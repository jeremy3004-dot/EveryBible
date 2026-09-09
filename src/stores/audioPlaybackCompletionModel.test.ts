import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextRepeatMode, resolveRepeatPlaybackTarget } from './audioPlaybackCompletionModel';

test('getNextRepeatMode cycles through off, chapter, and book modes', () => {
  assert.equal(getNextRepeatMode('off'), 'chapter');
  assert.equal(getNextRepeatMode('chapter'), 'book');
  assert.equal(getNextRepeatMode('book'), 'off');
});

test('resolveRepeatPlaybackTarget replays the same chapter when chapter repeat is enabled', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'chapter',
      bookId: 'JHN',
      chapter: 3,
      totalChapters: 21,
    }),
    { bookId: 'JHN', chapter: 3 }
  );
});

test('resolveRepeatPlaybackTarget advances within the same book when book repeat is enabled', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'JHN',
      chapter: 3,
      totalChapters: 21,
    }),
    { bookId: 'JHN', chapter: 4 }
  );
});

test('resolveRepeatPlaybackTarget wraps back to chapter one at the end of the book', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'JHN',
      chapter: 21,
      totalChapters: 21,
    }),
    { bookId: 'JHN', chapter: 1 }
  );
});

test('resolveRepeatPlaybackTarget returns null when repeat is off', () => {
  assert.equal(
    resolveRepeatPlaybackTarget({
      repeatMode: 'off',
      bookId: 'JHN',
      chapter: 3,
      totalChapters: 21,
    }),
    null
  );
});

test('resolveRepeatPlaybackTarget follows an exact chapter map when book repeat is enabled', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'JOS',
      chapter: 1,
      totalChapters: 24,
      availableChapters: [1, 2],
    }),
    { bookId: 'JOS', chapter: 2 }
  );
});

test('resolveRepeatPlaybackTarget wraps to the first covered chapter, not chapter one', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'PSA',
      chapter: 119,
      totalChapters: 150,
      availableChapters: [117, 119],
    }),
    { bookId: 'PSA', chapter: 117 }
  );

  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'JOS',
      chapter: 2,
      totalChapters: 24,
      availableChapters: [1, 2],
    }),
    { bookId: 'JOS', chapter: 1 }
  );
});

test('resolveRepeatPlaybackTarget stops when the book has no covered chapters', () => {
  assert.equal(
    resolveRepeatPlaybackTarget({
      repeatMode: 'book',
      bookId: 'MAT',
      chapter: 1,
      totalChapters: 28,
      availableChapters: [],
    }),
    null
  );
});

test('resolveRepeatPlaybackTarget still replays the current chapter with a map in chapter repeat', () => {
  assert.deepEqual(
    resolveRepeatPlaybackTarget({
      repeatMode: 'chapter',
      bookId: 'PSA',
      chapter: 117,
      totalChapters: 150,
      availableChapters: [117],
    }),
    { bookId: 'PSA', chapter: 117 }
  );
});
