/**
 * bibleService orchestrates the bundled-database singleton, the chapter cache and
 * the daily-scripture assembly. Only `./bibleDatabase` is replaced (it talks to
 * expo-sqlite); the chapter cache, book constants and daily-scripture model are
 * the real ones.
 *
 * Test order matters: the module holds a one-way `isInitialized` latch, so every
 * "not initialised yet" behaviour is asserted before the test that initialises it.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { Verse } from '../../types';

interface ChapterRead {
  translationId: string;
  bookId: string;
  chapter: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

const db = {
  minimumsSeen: [] as Array<number | undefined>,
  ready: false,
  verseCount: 0,
  inspectError: null as Error | null,
  initCalls: 0,
  initResult: null as (() => Promise<{ verseCount: number }>) | null,
  chapterReads: [] as ChapterRead[],
  chapterRows: new Map<string, Verse[]>(),
  chapterError: null as Error | null,
  chapterImpl: null as ((read: ChapterRead) => Promise<Verse[]>) | null,
  sourceKeyGeneration: 0,
  searchReads: [] as Array<{ translationId: string; query: string }>,
  searchResults: [] as Verse[],
  searchError: null as Error | null,
};

const chapterKey = (read: ChapterRead) => `${read.translationId}:${read.bookId}:${read.chapter}`;

const seedChapter = (read: ChapterRead, verses: Verse[]) => {
  db.chapterRows.set(chapterKey(read), verses);
};

const makeVerse = (bookId: string, chapter: number, verse: number, text: string): Verse => ({
  id: chapter * 1000 + verse,
  bookId,
  chapter,
  verse,
  text,
});

mockModule(mock, sourcePath('services/bible/bibleDatabase.ts'), {
  DEFAULT_MINIMUM_READY_VERSE_COUNT: 120000,
  inspectBundledDatabaseStatus: async (minimum?: number) => {
    db.minimumsSeen.push(minimum);
    if (db.inspectError) {
      throw db.inspectError;
    }
    return { ready: db.ready, verseCount: db.verseCount };
  },
  initDatabase: async (minimum?: number) => {
    db.initCalls += 1;
    db.minimumsSeen.push(minimum);
    if (db.initResult) {
      return db.initResult();
    }
    return { verseCount: db.verseCount };
  },
  getChapterSourceKey: (translationId: string) =>
    `source:${translationId}:${db.sourceKeyGeneration}`,
  getChapter: async (translationId: string, bookId: string, chapter: number) => {
    const read = { translationId, bookId, chapter };
    db.chapterReads.push(read);
    if (db.chapterImpl) {
      return db.chapterImpl(read);
    }
    if (db.chapterError) {
      throw db.chapterError;
    }
    return db.chapterRows.get(chapterKey(read)) ?? [];
  },
  searchVerses: async (translationId: string, query: string) => {
    db.searchReads.push({ translationId, query });
    if (db.searchError) {
      throw db.searchError;
    }
    return db.searchResults;
  },
});

let service: typeof import('./bibleService');
let chapterCache: typeof import('./chapterCache').chapterCache;
let dailyScripture: typeof import('./dailyScripture');

before(async () => {
  service = await import('./bibleService');
  chapterCache = (await import('./chapterCache')).chapterCache;
  dailyScripture = await import('./dailyScripture');
});

beforeEach(() => {
  db.minimumsSeen.length = 0;
  db.ready = false;
  db.verseCount = 0;
  db.inspectError = null;
  db.initCalls = 0;
  db.initResult = null;
  db.chapterReads.length = 0;
  db.chapterRows.clear();
  db.chapterError = null;
  db.chapterImpl = null;
  db.searchReads.length = 0;
  db.searchResults = [];
  db.searchError = null;
  // A fresh source key per test gives every test its own chapter-cache namespace.
  db.sourceKeyGeneration += 1;
});

after(() => {
  mock.reset();
});

test('the bundled data is not ready while the database holds too few verses', async () => {
  db.ready = false;

  assert.equal(await service.isBibleDataReady(), false);
  assert.deepEqual(db.minimumsSeen, [120000]);
});

test('a database that cannot be inspected is reported as not ready', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  db.inspectError = new Error('database file missing');

  assert.equal(await service.isBibleDataReady(), false);
  assert.equal(warn.mock.callCount(), 1);
});

test('initialising rejects when the bundled database has too few verses to read', async () => {
  db.verseCount = 10;

  await assert.rejects(() => service.initBibleData(), /not ready \(10\/120000\)/);
  assert.equal(await service.isBibleDataReady(), false);
});

test('a failed initialisation is retried rather than latched', async () => {
  db.initResult = async () => {
    throw new Error('asset copy failed');
  };

  await assert.rejects(() => service.initBibleData(), /asset copy failed/);
  await assert.rejects(() => service.initBibleData(), /asset copy failed/);

  assert.equal(db.initCalls, 2);
});

test('the daily scripture initialises the bundled database when it is not ready yet', async () => {
  db.ready = false;
  db.initResult = async () => {
    throw new Error('asset copy failed');
  };

  await assert.rejects(
    () =>
      service.getDailyScripture(
        { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
        false
      ),
    /asset copy failed/
  );
  assert.equal(db.initCalls, 1);
});

test('concurrent initialisation requests share a single database initialisation', async () => {
  const gate = defer<{ verseCount: number }>();
  db.initResult = () => gate.promise;

  const first = service.initBibleData();
  const second = service.initBibleData();
  gate.resolve({ verseCount: 200000 });
  await Promise.all([first, second]);

  assert.equal(db.initCalls, 1);
});

test('initialising again after success does not touch the database', async () => {
  await service.initBibleData();

  assert.equal(db.initCalls, 0);
});

test('readiness is answered from memory once the bundled data has initialised', async () => {
  assert.equal(await service.isBibleDataReady(), true);
  assert.deepEqual(db.minimumsSeen, []);
});

test('reading a chapter returns the verses stored for that translation', async () => {
  const verses = [makeVerse('JHN', 1, 1, 'In the beginning was the Word')];
  seedChapter({ translationId: 'bsb', bookId: 'JHN', chapter: 1 }, verses);

  assert.deepEqual(await service.getChapter('bsb', 'JHN', 1), verses);
});

test('reading a chapter routes to the requested translation', async () => {
  seedChapter({ translationId: 'esv1', bookId: 'JHN', chapter: 1 }, [
    makeVerse('JHN', 1, 1, 'Spanish text'),
  ]);
  seedChapter({ translationId: 'bsb', bookId: 'JHN', chapter: 1 }, [
    makeVerse('JHN', 1, 1, 'English text'),
  ]);

  assert.equal((await service.getChapter('esv1', 'JHN', 1))[0]?.text, 'Spanish text');
  assert.equal((await service.getChapter('bsb', 'JHN', 1))[0]?.text, 'English text');
});

test('reading the same chapter twice hits the database only once', async () => {
  seedChapter({ translationId: 'bsb', bookId: 'ROM', chapter: 8 }, [
    makeVerse('ROM', 8, 28, 'All things work together'),
  ]);

  await service.getChapter('bsb', 'ROM', 8);
  await service.getChapter('bsb', 'ROM', 8);

  assert.equal(db.chapterReads.length, 1);
});

test('a cached chapter is handed out as a copy the caller cannot corrupt', async () => {
  seedChapter({ translationId: 'bsb', bookId: 'ROM', chapter: 8 }, [
    makeVerse('ROM', 8, 28, 'All things work together'),
  ]);

  const first = await service.getChapter('bsb', 'ROM', 8);
  first[0]!.text = 'mutated';
  const second = await service.getChapter('bsb', 'ROM', 8);

  assert.equal(second[0]?.text, 'All things work together');
});

test('a chapter is re-read when the installed database behind it changes', async () => {
  seedChapter({ translationId: 'bsb', bookId: 'ROM', chapter: 8 }, [
    makeVerse('ROM', 8, 28, 'All things work together'),
  ]);

  await service.getChapter('bsb', 'ROM', 8);
  db.sourceKeyGeneration += 1;
  await service.getChapter('bsb', 'ROM', 8);

  assert.equal(db.chapterReads.length, 2);
});

test('an empty chapter is never cached, so a later read can still find the text', async () => {
  await service.getChapter('bsb', 'ROM', 8);
  seedChapter({ translationId: 'bsb', bookId: 'ROM', chapter: 8 }, [
    makeVerse('ROM', 8, 28, 'All things work together'),
  ]);

  const second = await service.getChapter('bsb', 'ROM', 8);

  assert.equal(db.chapterReads.length, 2);
  assert.equal(second[0]?.text, 'All things work together');
});

test('a chapter read that fails propagates to the reader', async () => {
  db.chapterError = new Error('database is locked');

  await assert.rejects(() => service.getChapter('bsb', 'ROM', 8), /database is locked/);
});

test('prefetching reads the next chapter of the same book', async () => {
  await service.prefetchNextChapter('bsb', 'ROM', 8);

  assert.deepEqual(db.chapterReads, [{ translationId: 'bsb', bookId: 'ROM', chapter: 9 }]);
});

test('prefetching rolls over to the first chapter of the next book', async () => {
  await service.prefetchNextChapter('bsb', 'ROM', 16);

  assert.deepEqual(db.chapterReads, [{ translationId: 'bsb', bookId: '1CO', chapter: 1 }]);
});

test('prefetching stops at the last chapter of the last book', async () => {
  await service.prefetchNextChapter('bsb', 'REV', 22);

  assert.deepEqual(db.chapterReads, []);
});

test('prefetching ignores a book the app does not ship', async () => {
  await service.prefetchNextChapter('bsb', 'NOPE', 1);

  assert.deepEqual(db.chapterReads, []);
});

test('prefetching ignores a chapter number outside the book', async () => {
  await service.prefetchNextChapter('bsb', 'ROM', 0);
  await service.prefetchNextChapter('bsb', 'ROM', 17);
  await service.prefetchNextChapter('bsb', 'ROM', 1.5);

  assert.deepEqual(db.chapterReads, []);
});

test('prefetching swallows a read error so the foreground retry still works', async () => {
  db.chapterError = new Error('database is locked');

  await service.prefetchNextChapter('bsb', 'ROM', 8);

  assert.equal(db.chapterReads.length, 1);
});

test('prefetching yields to a chapter the reader is waiting for', async () => {
  const gate = defer<Verse[]>();
  db.chapterImpl = () => gate.promise;
  const foreground = service.getChapter('bsb', 'ROM', 8);

  await service.prefetchNextChapter('bsb', 'ROM', 8);
  gate.resolve([]);
  await foreground;

  assert.deepEqual(db.chapterReads, [{ translationId: 'bsb', bookId: 'ROM', chapter: 8 }]);
});

test('only one prefetch runs at a time', async () => {
  const gate = defer<Verse[]>();
  db.chapterImpl = () => gate.promise;
  const first = service.prefetchNextChapter('bsb', 'ROM', 8);

  await service.prefetchNextChapter('bsb', 'PHP', 1);
  gate.resolve([]);
  await first;

  assert.deepEqual(db.chapterReads, [{ translationId: 'bsb', bookId: 'ROM', chapter: 9 }]);
});

test('searching asks the database for matches in the chosen translation', async () => {
  db.searchResults = [makeVerse('JHN', 3, 16, 'For God so loved the world')];

  const results = await service.searchBible('esv1', 'loved');

  assert.deepEqual(results, db.searchResults);
  assert.deepEqual(db.searchReads, [{ translationId: 'esv1', query: 'loved' }]);
});

test('searching returns nothing when the database finds no match', async () => {
  assert.deepEqual(await service.searchBible('bsb', 'zzzz'), []);
});

test('searching passes an empty query straight through to the database', async () => {
  await service.searchBible('bsb', '');

  assert.deepEqual(db.searchReads, [{ translationId: 'bsb', query: '' }]);
});

test('a search failure propagates to the caller', async () => {
  db.searchError = new Error('search index unavailable');

  await assert.rejects(() => service.searchBible('bsb', 'grace'), /search index unavailable/);
});

test('getBookInfo describes a book of the Bible', () => {
  assert.equal(service.getBookInfo('ROM')?.name, 'Romans');
});

test('getBookInfo returns nothing for a book the app does not ship', () => {
  assert.equal(service.getBookInfo('NOPE'), undefined);
});

test('getAllBooks lists all 66 books in canonical order', () => {
  const books = service.getAllBooks();

  assert.equal(books.length, 66);
  assert.equal(books[0]?.id, 'GEN');
  assert.equal(books.at(-1)?.id, 'REV');
});

test('the verse of the day is the verse named by the daily reference', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, 1, 'First verse'),
    makeVerse(reference.bookId, reference.chapter, reference.verse ?? 1, 'The daily verse'),
  ]);

  const verse = await service.getVerseOfTheDay();

  assert.equal(verse?.text, 'The daily verse');
});

test('the verse of the day falls back to the first verse of the chapter', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'esv1', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, 1, 'Only verse'),
  ]);

  const verse = await service.getVerseOfTheDay('esv1');

  assert.equal(verse?.text, 'Only verse');
});

test('the verse of the day is null when the chapter has no text', async () => {
  assert.equal(await service.getVerseOfTheDay('bbe'), null);
});

test('the daily scripture reads the passage text of a text translation', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, reference.verse ?? 1, '  Daily passage  '),
  ]);

  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false
  );

  assert.equal(daily.kind, 'verse-text');
  assert.equal(daily.text, 'Daily passage');
  assert.equal(daily.bookId, reference.bookId);
});

test('the daily scripture joins exactly the verses the reference names', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  const start = reference.verse ?? 1;
  const end = reference.verseEnd ?? start;
  const named = [];
  for (let verse = start; verse <= end; verse += 1) {
    named.push(makeVerse(reference.bookId, reference.chapter, verse, `named ${verse}`));
  }
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, start - 1, 'before the reference'),
    ...named,
    makeVerse(reference.bookId, reference.chapter, end + 1, 'after the reference'),
  ]);

  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false
  );

  assert.equal(daily.kind, 'verse-text');
  assert.equal(daily.text, named.map((verse) => verse.text).join(' '));
});

test('the daily scripture falls back to the chapter opening when the named verse is missing', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, 999, 'Some other verse'),
  ]);

  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false
  );

  assert.equal(daily.text, 'Some other verse');
});

test('the daily scripture reports no text when the chapter holds no verses at all', async () => {
  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false
  );

  assert.equal(daily.text, null);
});

test('an options object without an initialisation preference still allows initialising', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, reference.verse ?? 1, 'Default options text'),
  ]);

  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false,
    {}
  );

  assert.equal(daily.text, 'Default options text');
});

test('the daily scripture offers chapter audio for an audio-only translation', async () => {
  const daily = await service.getDailyScripture(
    { id: 'elx', hasText: false, hasAudio: true, audioGranularity: 'chapter' },
    true
  );

  assert.equal(daily.kind, 'section-audio');
  assert.equal(daily.playScope, 'chapter');
  assert.deepEqual(db.chapterReads, []);
});

test('the daily scripture is empty for a translation with neither text nor playable audio', async () => {
  const daily = await service.getDailyScripture(
    { id: 'elx', hasText: false, hasAudio: true, audioGranularity: 'chapter' },
    false
  );

  assert.equal(daily.kind, 'empty');
  assert.equal(daily.text, null);
});

test('the daily scripture still reads text when initialisation is not allowed but the data is ready', async () => {
  const reference = dailyScripture.getDailyScriptureReference();
  seedChapter({ translationId: 'bsb', bookId: reference.bookId, chapter: reference.chapter }, [
    makeVerse(reference.bookId, reference.chapter, reference.verse ?? 1, 'Ready text'),
  ]);

  const daily = await service.getDailyScripture(
    { id: 'bsb', hasText: true, hasAudio: false, audioGranularity: 'none' },
    false,
    { allowInitialization: false }
  );

  assert.equal(daily.text, 'Ready text');
});

test('the chapter cache can be cleared without disturbing the service', async () => {
  seedChapter({ translationId: 'bsb', bookId: 'ROM', chapter: 8 }, [
    makeVerse('ROM', 8, 28, 'All things work together'),
  ]);

  await service.getChapter('bsb', 'ROM', 8);
  chapterCache.clear();
  await service.getChapter('bsb', 'ROM', 8);

  assert.equal(db.chapterReads.length, 2);
});
