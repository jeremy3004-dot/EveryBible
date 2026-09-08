import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';

const reader = readFileSync(new URL('./BibleReaderScreen.tsx', import.meta.url), 'utf8');
const loadSource = reader.slice(
  reader.indexOf('  async function loadChapter()'),
  reader.indexOf('  const handleCompletePlanDay')
);

function harness() {
  const tasks: { run: () => void; cancelled: boolean }[] = [];
  const prefetched: number[] = [];
  const request = { current: 0 };
  const pending = { current: null as null | { cancel: () => void } };
  const context = {
    chapterLoadRequestIdRef: request,
    chapterPrefetchTaskRef: pending,
    shouldShowChapterLoadSkeleton: () => false,
    verses: [],
    setIsLoading: () => {},
    setError: () => {},
    setVerses: () => {},
    getChapter: async () => [{ verse: 1 }],
    currentTranslation: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    returnToPlanOnComplete: true,
    prefetchNextChapter: (_translation: string, _book: string, chapter: number) => {
      prefetched.push(chapter);
    },
    InteractionManager: {
      runAfterInteractions: (run: () => void) => {
        const task = { run, cancelled: false };
        tasks.push(task);
        return {
          cancel: () => {
            task.cancelled = true;
          },
        };
      },
    },
  };
  const load = runInNewContext(`(${loadSource})`, context) as () => Promise<void>;
  return { load, tasks, prefetched, request, pending };
}

test('chapter load defers text prefetch until interactions settle', async () => {
  const h = harness();
  await h.load();
  assert.equal(h.prefetched.length, 0);
  assert.equal(h.tasks.length, 1);
  h.tasks[0].run();
  assert.deepEqual(h.prefetched, [3]);
});

test('new chapter load cancels and rejects superseded prefetch callbacks', async () => {
  const h = harness();
  await h.load();
  await h.load();
  assert.equal(h.tasks[0].cancelled, true);
  h.tasks[0].run(); // Guard even if a cancelled native callback has already been queued.
  assert.equal(h.prefetched.length, 0);
  h.tasks[1].run();
  assert.deepEqual(h.prefetched, [3]);
});

test('reader cleanup invalidates pending load and cancels prefetch without audio work', () => {
  assert.match(
    reader,
    /void loadChapter\(\);\s*return \(\) => \{\s*chapterLoadRequestIdRef.current \+= 1;\s*chapterPrefetchTaskRef.current\?\.cancel\(\);\s*chapterPrefetchTaskRef.current = null;/
  );
  assert.doesNotMatch(loadSource, /playChapter\(|prefetchChapterAudio\(/);
});
