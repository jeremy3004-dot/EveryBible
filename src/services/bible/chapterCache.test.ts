import assert from 'node:assert/strict';
import test from 'node:test';
import { ChapterCache } from './chapterCache';
import type { Verse } from '../../types';
const verses = (text = 'original'): Verse[] => [
  {
    id: 1,
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text,
    formatting: { mode: 'lines', lines: [{ text }] },
  },
];

test('repeated and concurrent chapter reads share one load and return independent formatting', async () => {
  const cache = new ChapterCache(2);
  let calls = 0;
  const load = async () => {
    calls++;
    return verses();
  };
  const [first, second] = await Promise.all([cache.get('a', load), cache.get('a', load)]);
  first[0]!.formatting!.lines[0]!.text = 'changed';
  first.pop();
  assert.equal(second[0]!.formatting!.lines[0]!.text, 'original');
  await cache.get('a', load);
  assert.equal(calls, 1);
});

test('least recently used chapters are evicted and distinct keys never share text', async () => {
  const cache = new ChapterCache(2);
  let calls = 0;
  const load = async () => {
    calls++;
    return verses();
  };
  for (const key of [
    'translation-a/GEN/1',
    'translation-b/GEN/1',
    'translation-a/GEN/1',
    'translation-a/GEN/2',
    'translation-b/GEN/1',
  ])
    await cache.get(key, load);
  assert.equal(calls, 4);
});

test('failure and empty results remain retryable', async () => {
  const cache = new ChapterCache(2);
  await assert.rejects(
    cache.get('a', async () => {
      throw new Error('read failed');
    })
  );
  assert.deepEqual(await cache.get('a', async () => []), []);
  assert.equal((await cache.get('a', async () => verses('retry')))[0]?.text, 'retry');
});

test('invalidation clears cached text and prevents an old in-flight load from repopulating it', async () => {
  const cache = new ChapterCache(2);
  let resolve!: (value: Verse[]) => void;
  const old = cache.get(
    'a',
    () =>
      new Promise<Verse[]>((done) => {
        resolve = done;
      })
  );
  cache.clear();
  assert.equal((await cache.get('a', async () => verses('new')))[0]?.text, 'new');
  resolve(verses('old'));
  assert.equal((await old)[0]?.text, 'new');
  assert.equal((await cache.get('a', async () => verses('unexpected')))[0]?.text, 'new');
  cache.clear();
  assert.equal((await cache.get('a', async () => verses('replacement')))[0]?.text, 'replacement');
});
