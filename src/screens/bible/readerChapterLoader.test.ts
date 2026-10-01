import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Verse } from '../../types';
import {
  invalidateReaderChapterLoad,
  loadReaderChapter,
  readerChapterKey,
  type ReaderChapterLoad,
} from './readerChapterLoader';
import { assertDefined } from '../../utils/assertDefined';

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
    chapterKeys: [] as string[],
    loading: [] as boolean[],
    errors: [] as (string | null)[],
    markedRead: [] as number[],
    recovered: [] as string[],
    /** The reader-state changes each batchUpdates call grouped, in order. */
    batches: [] as string[][],
  };
  let openBatch: string[] | null = null;
  const note = (change: string) => openBatch?.push(change);
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
    markChapterRead: (_book, chapter) => {
      note('markedRead');
      recorded.markedRead.push(chapter);
    },
    recoverMissingInstalledPack: async (translationId) => {
      recorded.recovered.push(translationId);
    },
    setIsLoading: (value) => {
      note(`loading:${value}`);
      recorded.loading.push(value);
    },
    setError: (message) => {
      note('error');
      recorded.errors.push(message);
    },
    setVerses: (value) => {
      note('verses');
      recorded.verses.push(value);
    },
    setVersesChapterKey: (key) => {
      note('chapterKey');
      recorded.chapterKeys.push(key);
    },
    batchUpdates: (updates) => {
      const batch: string[] = [];
      openBatch = batch;
      try {
        updates();
      } finally {
        openBatch = null;
        recorded.batches.push(batch);
      }
    },
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
  assertDefined(tasks[0], 'tasks[0]').run();
  assert.deepEqual(recorded.prefetched, [3]);
  assert.equal(load.prefetchTaskRef.current, null);
});

test('a new chapter load cancels the superseded prefetch and ignores its late callback', async () => {
  const { load, tasks, recorded } = reader();

  await loadReaderChapter(load);
  await loadReaderChapter(load);

  assert.equal(assertDefined(tasks[0], 'tasks[0]').cancelled, true);
  assertDefined(tasks[0], 'tasks[0]').run(); // A cancelled native callback may already have been queued.
  assert.deepEqual(recorded.prefetched, []);
  assertDefined(tasks[1], 'tasks[1]').run();
  assert.deepEqual(recorded.prefetched, [3]);
});

test('reader cleanup makes a pending load stale and cancels its queued prefetch', async () => {
  const pending = deferred<Verse[]>();
  const results = [Promise.resolve([verse(1)]), pending.promise];
  const { load, tasks, recorded } = reader({ getChapter: () => results.shift()! });

  await loadReaderChapter(load);
  const queued = assertDefined(tasks[0], 'queued');
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

test('a loaded chapter records which chapter the verses belong to', async () => {
  const { load, recorded } = reader();

  await loadReaderChapter(load);

  assert.deepEqual(recorded.chapterKeys, [readerChapterKey('bsb', 'JHN', 3)]);
});

test('the verses stay tagged with the old chapter until the new chapter arrives', async () => {
  // Old verses stay on screen during a chapter change, so anything keyed to the new
  // route chapter (the audio follow-along highlight) must not paint on them.
  const next = deferred<Verse[]>();
  const results = [Promise.resolve([verse(1)]), next.promise];
  const { load, recorded } = reader({ getChapter: () => results.shift()! });

  await loadReaderChapter(load);
  const moving = loadReaderChapter({ ...load, chapter: 4, currentVerseCount: 1 });
  assert.deepEqual(recorded.chapterKeys, [readerChapterKey('bsb', 'JHN', 3)]);
  next.resolve([verse(1)]);
  await moving;

  assert.deepEqual(recorded.chapterKeys, [
    readerChapterKey('bsb', 'JHN', 3),
    readerChapterKey('bsb', 'JHN', 4),
  ]);
});

test('the verses stay tagged with the old translation until the new translation arrives', async () => {
  // A translation switch also keeps the old text on screen while the new one loads; a verse
  // selected there would be shared under the new translation's name with the old wording.
  const next = deferred<Verse[]>();
  const results = [Promise.resolve([verse(1)]), next.promise];
  const { load, recorded } = reader({ getChapter: () => results.shift()! });

  await loadReaderChapter(load);
  const switching = loadReaderChapter({ ...load, translationId: 'web', currentVerseCount: 1 });
  assert.notEqual(recorded.chapterKeys[0], readerChapterKey('web', 'JHN', 3));
  next.resolve([verse(1)]);
  await switching;

  assert.deepEqual(recorded.chapterKeys, [
    readerChapterKey('bsb', 'JHN', 3),
    readerChapterKey('web', 'JHN', 3),
  ]);
});

test('a stale chapter result never tags the verses with its chapter', async () => {
  const slow = deferred<Verse[]>();
  const results = [slow.promise, Promise.resolve([verse(2)])];
  const { load, recorded } = reader({ getChapter: () => results.shift()! });

  const first = loadReaderChapter(load);
  await loadReaderChapter({ ...load, chapter: 4 });
  slow.resolve([verse(1)]);
  await first;

  assert.deepEqual(recorded.chapterKeys, [readerChapterKey('bsb', 'JHN', 4)]);
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
  assert.deepEqual(
    recorded.chapterKeys,
    [readerChapterKey('bsb', 'JHN', 3)],
    'the empty chapter is the route chapter'
  );
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

test('a chapter that loads no verses is not marked read', async () => {
  // Nothing was on the page to read (an audio-only chapter, a gap in the pack), so it
  // must not tick the streak, the reading calendar or a plan step.
  const { load, recorded } = reader({ returnToPlanOnComplete: false, getChapter: async () => [] });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.verses, [[]]);
  assert.deepEqual(recorded.markedRead, []);
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

// React Native's old architecture renders every state update made outside an event on
// its own. Each of these was a separate pass over the whole reader (four when opening
// Psalm 119 in a release build), so the new chapter must arrive as one update.
test('a loaded chapter reaches the reader as one update: verses, key, read mark, loading', async () => {
  const { load, recorded } = reader({ returnToPlanOnComplete: false });

  await loadReaderChapter(load);

  assert.deepEqual(recorded.batches, [['verses', 'chapterKey', 'markedRead', 'loading:false']]);
  assert.deepEqual(recorded.loading, [true, false]);
});
