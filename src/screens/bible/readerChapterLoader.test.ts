import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Verse } from '../../types';
import {
  invalidateReaderChapterLoad,
  loadReaderChapter,
  type ReaderChapterLoad,
} from './readerChapterLoader';

mock.method(console, 'error', () => undefined);

const verse = (number: number) => ({ verse: number }) as unknown as Verse;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function reader(overrides: Partial<ReaderChapterLoad> = {}) {
  const tasks: { run: () => void; cancelled: boolean }[] = [];
  const recorded = {
    prefetched: [] as number[],
    verses: [] as Verse[][],
    loading: [] as boolean[],
    errors: [] as (string | null)[],
    markedRead: [] as number[],
    recovered: [] as string[],
  };
  const load: ReaderChapterLoad = {
    requestIdRef: { current: 0 },
    prefetchTaskRef: { current: null },
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    translation: { hasText: true },
    currentVerseCount: 0,
    returnToPlanOnComplete: true,
    getChapter: async () => [verse(1)],
    prefetchNextChapter: async (_translation, _book, chapter) => {
      recorded.prefetched.push(chapter);
    },
    runAfterInteractions: (run) => {
      const task = { run, cancelled: false };
      tasks.push(task);
      return {
        cancel: () => {
          task.cancelled = true;
        },
      };
    },
    markChapterRead: (_book, chapter) => recorded.markedRead.push(chapter),
    recoverMissingInstalledPack: async (translationId) => {
      recorded.recovered.push(translationId);
    },
    setIsLoading: (value) => recorded.loading.push(value),
    setError: (message) => recorded.errors.push(message),
    setVerses: (value) => recorded.verses.push(value),
    t: (key) => `t:${key}`,
    ...overrides,
  };
  return { load, tasks, recorded };
}

test('a chapter load defers the next-chapter text prefetch until interactions settle', async () => {
  const { load, tasks, recorded } = reader();

  await loadReaderChapter(load);

  assert.deepEqual(recorded.prefetched, []);
  assert.equal(tasks.length, 1);
  tasks[0].run();
  assert.deepEqual(recorded.prefetched, [3]);
  assert.equal(load.prefetchTaskRef.current, null);
});

test('a new chapter load cancels the superseded prefetch and ignores its late callback', async () => {
  const { load, tasks, recorded } = reader();

  await loadReaderChapter(load);
  await loadReaderChapter(load);

  assert.equal(tasks[0].cancelled, true);
  tasks[0].run(); // A cancelled native callback may already have been queued.
  assert.deepEqual(recorded.prefetched, []);
  tasks[1].run();
  assert.deepEqual(recorded.prefetched, [3]);
});

test('reader cleanup makes a pending load stale and cancels its queued prefetch', async () => {
  const pending = deferred<Verse[]>();
  const results = [Promise.resolve([verse(1)]), pending.promise];
  const { load, tasks, recorded } = reader({ getChapter: () => results.shift()! });

  await loadReaderChapter(load);
  const queued = tasks[0];
  const inFlight = loadReaderChapter(load);
  invalidateReaderChapterLoad(load);
  pending.resolve([verse(1)]);
  await inFlight;

  assert.equal(queued.cancelled, true);
  assert.equal(load.prefetchTaskRef.current, null);
  assert.equal(recorded.verses.length, 1, 'only the first, current load reached the screen');
  assert.equal(tasks.length, 1, 'the stale load queued no prefetch');
  queued.run();
  assert.deepEqual(recorded.prefetched, []);
});

test('a stale chapter result never replaces the chapter the reader moved to', async () => {
  const slow = deferred<Verse[]>();
  const results = [slow.promise, Promise.resolve([verse(2)])];
  const { load, recorded } = reader({ getChapter: () => results.shift()! });

  const first = loadReaderChapter(load);
  await loadReaderChapter(load);
  slow.resolve([verse(1)]);
  await first;

  assert.deepEqual(recorded.verses, [[verse(2)]]);
  assert.deepEqual(recorded.loading, [true, true, false], 'the stale load leaves loading alone');
});

test('an empty chapter is shown but queues no prefetch', async () => {
  const { load, tasks, recorded } = reader({ getChapter: async () => [] });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.verses, [[]]);
  assert.equal(tasks.length, 0);
});

test('an audio-only translation skips the text query and clears the verses', async () => {
  let queried = false;
  const { load, tasks, recorded } = reader({
    translation: { hasText: false },
    getChapter: async () => {
      queried = true;
      return [verse(1)];
    },
  });

  await loadReaderChapter(load);

  assert.equal(queried, false);
  assert.deepEqual(recorded.verses, [[]]);
  assert.deepEqual(recorded.loading, [true, false]);
  assert.equal(tasks.length, 0);
});

test('a chapter change with verses on screen never shows the loading skeleton', async () => {
  const { load, recorded } = reader({ currentVerseCount: 30 });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.loading, [false]);
});

test('reading outside a plan marks the chapter read; a plan session leaves that to the plan', async () => {
  const outside = reader({ returnToPlanOnComplete: false });
  await loadReaderChapter(outside.load);
  assert.deepEqual(outside.recorded.markedRead, [3]);

  const inPlan = reader({ returnToPlanOnComplete: true });
  await loadReaderChapter(inPlan.load);
  assert.deepEqual(inPlan.recorded.markedRead, []);
});

test('a vanished installed pack triggers the self-heal and a recoverable message', async () => {
  const missing = Object.assign(new Error('Installed database file is missing'), {
    name: 'MissingInstalledDatabaseError',
  });
  const { load, recorded } = reader({
    getChapter: async () => {
      throw missing;
    },
  });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.recovered, ['bsb']);
  assert.deepEqual(recorded.errors, [null, 't:bible.packMissingRecovering']);
  assert.deepEqual(recorded.loading, [true, false]);
});

test('any other load failure shows the generic message without a self-heal', async () => {
  const { load, recorded } = reader({
    getChapter: async () => {
      throw new Error('SQLITE_BUSY');
    },
  });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.recovered, []);
  assert.deepEqual(recorded.errors, [null, 't:bible.failedToLoad']);
});
