import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdjacentBibleChapter } from './books';

test('getAdjacentBibleChapter advances to the next book after the last chapter', () => {
  assert.deepEqual(getAdjacentBibleChapter('GEN', 50, 1), { bookId: 'EXO', chapter: 1 });
});

test('getAdjacentBibleChapter moves to the previous book from chapter one', () => {
  assert.deepEqual(getAdjacentBibleChapter('EXO', 1, -1), { bookId: 'GEN', chapter: 50 });
});

test('getAdjacentBibleChapter returns null after the final chapter of Revelation', () => {
  assert.equal(getAdjacentBibleChapter('REV', 22, 1), null);
});
