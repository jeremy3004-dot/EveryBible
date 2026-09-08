import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { shallow } from 'zustand/shallow';

const source = ts.transpileModule(
  readFileSync(new URL('./useAudioPosition.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
function subscribe(track?: { translationId: string; bookId: string; chapter: number }) {
  let state = {
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: 0,
    duration: 90_000,
  };
  let selector: (value: typeof state) => unknown = () => null;
  const exports: { useAudioPosition?: (track?: unknown) => unknown } = {};
  runInNewContext(source, {
    exports,
    require: (name: string) =>
      name.includes('shallow')
        ? { useShallow: (fn: typeof selector) => fn }
        : {
            useAudioStore: (fn: typeof selector) => {
              selector = fn;
              return fn(state);
            },
          },
  });
  exports.useAudioPosition!(track);
  return {
    read: () => selector(state),
    update: (patch: Partial<typeof state>) => {
      state = { ...state, ...patch };
    },
  };
}

test('reader ignores all 240 ticks belonging to another chapter', () => {
  const subscription = subscribe({ translationId: 'bsb', bookId: 'JHN', chapter: 4 });
  const initial = subscription.read();
  let updates = 0;
  for (let position = 250; position <= 60_000; position += 250) {
    subscription.update({ currentPosition: position });
    if (!shallow(initial, subscription.read())) updates += 1;
  }
  assert.equal(updates, 0);
});

test('matching track retains exact progress, backward seeks and duration corrections', () => {
  const subscription = subscribe({ translationId: 'bsb', bookId: 'JHN', chapter: 3 });
  for (const position of [250, 60_123, 5_123]) {
    subscription.update({ currentPosition: position, duration: 100_001 });
    assert.equal(
      JSON.stringify(subscription.read()),
      JSON.stringify({ currentPosition: position, duration: 100_001 })
    );
  }
  subscription.update({ currentTranslationId: 'web' });
  assert.equal(
    JSON.stringify(subscription.read()),
    JSON.stringify({ currentPosition: 0, duration: 0 })
  );
  subscription.update({ currentTranslationId: 'bsb' });
  assert.equal(
    JSON.stringify(subscription.read()),
    JSON.stringify({ currentPosition: 5123, duration: 100001 })
  );
});

test('unscoped progress consumers retain the live track position', () => {
  const subscription = subscribe();
  subscription.update({ currentPosition: 45_678 });
  assert.equal(
    JSON.stringify(subscription.read()),
    JSON.stringify({ currentPosition: 45_678, duration: 90_000 })
  );
});

test('reader scopes progress to its visible translation and chapter', () => {
  const reader = readFileSync(
    new URL('../screens/bible/BibleReaderScreen.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    reader,
    /useAudioPosition\(\{\s*translationId: currentTranslation,\s*bookId,\s*chapter,\s*\}\)/
  );
});

test('reader prefetches text only after accepting a successful nonempty chapter load', () => {
  const reader = readFileSync(
    new URL('../screens/bible/BibleReaderScreen.tsx', import.meta.url),
    'utf8'
  );
  const loadChapter = reader.slice(
    reader.indexOf('  async function loadChapter()'),
    reader.indexOf('  const handleCompletePlanDay')
  );
  assert.match(
    loadChapter,
    /await getChapter\([\s\S]*requestId !== chapterLoadRequestIdRef.current[\s\S]*return;[\s\S]*setVerses\(data\);\s*if \(data.length > 0\) \{[\s\S]*void prefetchNextChapter\(currentTranslation, bookId, chapter\);/
  );
  assert.doesNotMatch(loadChapter, /playChapter\(|prefetchChapterAudio\(/);
});
