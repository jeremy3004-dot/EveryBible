import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VERSES_IN_CHAPTER,
  chapterVerseCount,
  clampPassageDraft,
  initialPassageDraft,
  soundLibraryChoices,
  stepPassageDraft,
  type PassageDraft,
  type VerseCountLookup,
} from './audioSheetModel';

// Genesis-like: 3 chapters of 31, 25 and 24 verses.
const counts: VerseCountLookup = (chapter) => ({ 1: 31, 2: 25, 3: 24 })[chapter] ?? null;
const draft = (start: [number, number], end: [number, number]): PassageDraft => ({
  start: { chapter: start[0], verse: start[1] },
  end: { chapter: end[0], verse: end[1] },
});

test('the library lists Off and Shuffle first, then the catalog once each', () => {
  assert.deepEqual(
    soundLibraryChoices([{ id: 'off' }, { id: 'piano' }, { id: 'rain' }, { id: 'piano' }]),
    ['off', 'shuffle', 'piano', 'rain']
  );
});

test('the picker opens on a stored passage in this book, else on the whole chapter', () => {
  const stored = { bookId: 'GEN', ...draft([1, 3], [2, 4]) };
  assert.deepEqual(initialPassageDraft(stored, 'GEN', 3, 3), draft([1, 3], [2, 4]));
  assert.deepEqual(
    initialPassageDraft(stored, 'EXO', 3, 40),
    draft([3, 1], [3, MAX_VERSES_IN_CHAPTER])
  );
});

test('an end past its chapter is pulled back to the last verse once the count is known', () => {
  assert.deepEqual(clampPassageDraft(draft([1, 1], [1, 176]), 3, counts), draft([1, 1], [1, 31]));
  const unknown: VerseCountLookup = () => null;
  assert.deepEqual(clampPassageDraft(draft([1, 1], [1, 176]), 3, unknown), draft([1, 1], [1, 176]));
});

test('moving the start past the end carries the end along', () => {
  assert.deepEqual(
    stepPassageDraft(draft([1, 1], [1, 5]), 'startChapter', 1, 3, counts),
    draft([2, 1], [2, 25])
  );
  assert.deepEqual(
    stepPassageDraft(draft([1, 5], [1, 5]), 'startVerse', 1, 3, counts),
    draft([1, 6], [1, 6])
  );
});

test('the end cannot move before the start, nor any end past the book', () => {
  assert.deepEqual(
    stepPassageDraft(draft([2, 4], [2, 4]), 'endVerse', -1, 3, counts),
    draft([2, 4], [2, 4])
  );
  assert.deepEqual(
    stepPassageDraft(draft([2, 4], [2, 9]), 'endChapter', -1, 3, counts),
    draft([2, 4], [2, 25])
  );
  assert.deepEqual(
    stepPassageDraft(draft([3, 1], [3, 24]), 'endChapter', 1, 3, counts),
    draft([3, 1], [3, 24])
  );
});

test("a chapter's verse count is its highest verse number, even with gaps", () => {
  assert.equal(chapterVerseCount([{ verse: 1 }, { verse: 2 }, { verse: 22 }]), 22);
  assert.equal(chapterVerseCount([]), 0);
});
