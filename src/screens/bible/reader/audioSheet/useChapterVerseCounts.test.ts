import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../../../testing/mockModules';
import { createReactHookRuntime } from '../../../../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const calls: string[] = [];
const pending = new Map<string, (verseCount: number) => void>();
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: (translationId: string, bookId: string, chapter: number) => {
    const key = `${translationId}:${bookId}:${chapter}`;
    calls.push(key);
    return new Promise((resolve) => {
      pending.set(key, (verseCount) =>
        resolve(Array.from({ length: verseCount }, (_, i) => ({ verse: i + 1 })))
      );
    });
  },
});

afterEach(() => {
  runtime.unmountAll();
  calls.length = 0;
  pending.clear();
});

test('one chapter resolving does not cancel or re-request the others still loading', async () => {
  const { useChapterVerseCounts } = await import('./useChapterVerseCounts');
  const view = runtime.mount(useChapterVerseCounts, 'bsb', 'GEN', [1, 2, 3]);
  await view.commit();
  assert.deepEqual(calls, ['bsb:GEN:1', 'bsb:GEN:2', 'bsb:GEN:3']);

  pending.get('bsb:GEN:1')?.(31);
  await view.commit();
  view.rerender();
  await view.commit();
  pending.get('bsb:GEN:2')?.(25);
  pending.get('bsb:GEN:3')?.(24);
  await view.commit();
  view.rerender();
  await view.commit();

  assert.deepEqual(calls, ['bsb:GEN:1', 'bsb:GEN:2', 'bsb:GEN:3'], 'no duplicate getChapter calls');
  assert.deepEqual([1, 2, 3].map(view.result), [31, 25, 24]);
});

test('chapters added later are requested once and earlier ones are not repeated', async () => {
  const { useChapterVerseCounts } = await import('./useChapterVerseCounts');
  const view = runtime.mount(useChapterVerseCounts, 'bsb', 'GEN', [1]);
  await view.commit();
  view.rerender('bsb', 'GEN', [1, 2]);
  await view.commit();
  assert.deepEqual(calls, ['bsb:GEN:1', 'bsb:GEN:2']);
});
