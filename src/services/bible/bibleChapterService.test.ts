import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { ChapterCache } from './chapterCache';
import { bibleBooks, getBookById } from '../../constants/books';
import type { Verse } from '../../types';

function fixture() {
  const calls: [string, string, number][] = [];
  const cache = new ChapterCache();
  let source = 'bundled';
  let read = async (translation: string, bookId: string, chapter: number): Promise<Verse[]> => [
    { id: 1, bookId, chapter, verse: 1, text: translation },
  ];
  const exports = {} as typeof import('./bibleService');
  const js = ts.transpileModule(
    readFileSync(new URL('./bibleService.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
  runInNewContext(js, {
    exports,
    console,
    require: (name: string) => {
      if (name === './bibleDatabase')
        return {
          DEFAULT_MINIMUM_READY_VERSE_COUNT: 1,
          initDatabase: async () => ({ verseCount: 1 }),
          getChapterSourceKey: () => source,
          getChapter: async (translation: string, book: string, chapter: number) => {
            calls.push([translation, book, chapter]);
            return read(translation, book, chapter);
          },
        };
      if (name === './chapterCache') return { chapterCache: cache };
      if (name === '../../constants') return { bibleBooks, getBookById };
      if (name === './dailyScripture' || name === './presentation') return {};
      throw new Error(name);
    },
  });
  return {
    api: exports,
    calls,
    cache,
    setRead: (next: typeof read) => {
      read = next;
    },
    setSource: (next: string) => {
      source = next;
    },
  };
}

test('prefetched next chapter and revisiting a chapter avoid redundant database reads', async () => {
  const { api, calls } = fixture();
  await api.getChapter!('a', 'GEN', 1);
  await api.prefetchNextChapter!('a', 'GEN', 1);
  await api.getChapter!('a', 'GEN', 2);
  await api.getChapter!('a', 'GEN', 1);
  assert.deepEqual(calls, [
    ['a', 'GEN', 1],
    ['a', 'GEN', 2],
  ]);
});

test('next chapter respects book boundaries and never wraps the final Bible chapter', async () => {
  const { api, calls } = fixture();
  await api.initBibleData!();
  await api.prefetchNextChapter!('a', 'GEN', 50);
  await api.prefetchNextChapter!('a', 'REV', 22);
  await api.prefetchNextChapter!('a', 'GEN', 0);
  await api.prefetchNextChapter!('a', 'GEN', 51);
  await api.prefetchNextChapter!('a', 'invalid', 1);
  assert.deepEqual(calls, [['a', 'EXO', 1]]);
});

test('source, translation, book, and chapter changes each isolate cached text', async () => {
  const { api, calls, setSource } = fixture();
  await api.getChapter!('a', 'GEN', 1);
  await api.getChapter!('b', 'GEN', 1);
  await api.getChapter!('a', 'EXO', 1);
  await api.getChapter!('a', 'GEN', 2);
  setSource('installed');
  await api.getChapter!('a', 'GEN', 1);
  assert.equal(calls.length, 5);
});

test('prefetch failures are silent and a later foreground read retries', async () => {
  const { api, calls, setRead } = fixture();
  await api.initBibleData!();
  setRead(async () => {
    throw new Error('read failed');
  });
  await api.prefetchNextChapter!('a', 'GEN', 1);
  setRead(async (_, bookId, chapter) => [{ id: 1, bookId, chapter, verse: 1, text: 'retry' }]);
  assert.equal((await api.getChapter!('a', 'GEN', 2))[0].text, 'retry');
  assert.equal(calls.length, 2);
});

test('prefetch skips initialization and active foreground reads', async () => {
  const { api, calls, setRead } = fixture();
  await api.prefetchNextChapter!('a', 'GEN', 1);
  assert.equal(calls.length, 0);
  let finish!: (verses: Verse[]) => void;
  setRead(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const current = api.getChapter!('a', 'GEN', 1);
  await api.prefetchNextChapter!('a', 'GEN', 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  finish([]);
  await current;
});

test('database pack invalidation clears chapter text even without a cached database handle', async () => {
  const { chapterCache } = await import('./chapterCache');
  const model = await import('./bibleDataModel');
  const formatting = await import('./verseFormatting');
  const exports = {} as typeof import('./bibleDatabase');
  const js = ts.transpileModule(
    readFileSync(new URL('./bibleDatabase.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
  runInNewContext(js, {
    exports,
    console,
    require: (name: string) => {
      if (name === './chapterCache') return { chapterCache };
      if (name === './bibleDataModel') return model;
      if (name === './verseFormatting') return formatting;
      if (name === 'expo-sqlite') return {};
      if (name.endsWith('.db')) return 1;
      throw new Error(name);
    },
  });
  const verse = (text: string): Verse[] => [{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text }];
  await chapterCache.get('installed', async () => verse('old'));
  let finish!: (verses: Verse[]) => void;
  const pending = chapterCache.get(
    'pending',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await exports.invalidateInstalledBibleDatabaseAtPath!('file:///documents/translations/a.db');
  await chapterCache.get('pending', async () => verse('new'));
  finish(verse('stale'));
  assert.equal((await pending)[0]?.text, 'new');
  assert.equal((await chapterCache.get('installed', async () => verse('new')))[0]?.text, 'new');
  assert.equal((await chapterCache.get('pending', async () => verse('new')))[0]?.text, 'new');
  chapterCache.clear();
});

test('one speculative read never queues unrelated foreground chapter reads', async () => {
  const { api, calls, setRead } = fixture();
  await api.initBibleData();
  let finish!: (verses: Verse[]) => void;
  setRead(async (_, bookId, chapter) => {
    if (chapter === 2)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return [{ id: 1, bookId, chapter, verse: 1, text: 'foreground' }];
  });
  const speculative = api.prefetchNextChapter('a', 'GEN', 1);
  await api.prefetchNextChapter('a', 'GEN', 3);
  assert.equal((await api.getChapter('a', 'GEN', 5))[0]?.text, 'foreground');
  assert.deepEqual(calls, [
    ['a', 'GEN', 2],
    ['a', 'GEN', 5],
  ]);
  finish([]);
  await speculative;
});

test('an invalidated read recomputes its source key before retrying', async () => {
  const { api, cache, calls, setRead, setSource } = fixture();
  let finish!: (verses: Verse[]) => void;
  setRead(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = api.getChapter('a', 'GEN', 1);
  await new Promise((resolve) => setImmediate(resolve));
  cache.clear();
  setSource('installed');
  setRead(async (_, bookId, chapter) => [{ id: 1, bookId, chapter, verse: 1, text: 'installed' }]);
  finish([{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'old bundled' }]);
  assert.equal((await pending)[0]?.text, 'installed');
  setSource('bundled');
  setRead(async (_, bookId, chapter) => [{ id: 1, bookId, chapter, verse: 1, text: 'bundled' }]);
  assert.equal((await api.getChapter('a', 'GEN', 1))[0]?.text, 'bundled');
  assert.equal(calls.length, 3);
});
