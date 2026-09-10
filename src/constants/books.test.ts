import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdjacentBibleChapter, getCompactTranslatedBookName } from './books';

test('getAdjacentBibleChapter advances to the next book after the last chapter', () => {
  assert.deepEqual(getAdjacentBibleChapter('GEN', 50, 1), { bookId: 'EXO', chapter: 1 });
});

test('getAdjacentBibleChapter moves to the previous book from chapter one', () => {
  assert.deepEqual(getAdjacentBibleChapter('EXO', 1, -1), { bookId: 'GEN', chapter: 50 });
});

test('getAdjacentBibleChapter returns null after the final chapter of Revelation', () => {
  assert.equal(getAdjacentBibleChapter('REV', 22, 1), null);
});

test('getCompactTranslatedBookName keeps short names intact and shortens long header labels', () => {
  const t = (key: string) =>
    (
      ({
        'bible.books.JHN': 'John',
        'bible.books.DEU': 'Deuteronomy',
        'bible.books.SNG': 'Song of Solomon',
      }) as Record<string, string>
    )[key] ?? key;

  assert.equal(getCompactTranslatedBookName('JHN', t), 'John');
  assert.equal(getCompactTranslatedBookName('DEU', t), 'Deut.');
  assert.equal(getCompactTranslatedBookName('SNG', t), 'Song');
});

test('getCompactTranslatedBookName matches the ICU collation it replaced on accented and cased names', () => {
  const t = (key: string) =>
    (
      ({
        // Accented first word: NOT the abbreviation's expansion, so the bare
        // abbreviation wins (accent-sensitive).
        'bible.books.DEU': 'Déuteronomio',
        // Same word as the abbreviation apart from case: still "the same word",
        // so no trailing period is added (case-insensitive).
        'bible.books.ECC': 'ECCL WRITINGS',
        // A genuine expansion of the abbreviation: abbreviate with a period.
        'bible.books.PHP': 'PHILIPPIANS',
      }) as Record<string, string>
    )[key] ?? key;

  assert.equal(getCompactTranslatedBookName('DEU', t), 'Deut');
  assert.equal(getCompactTranslatedBookName('ECC', t), 'Eccl');
  assert.equal(getCompactTranslatedBookName('PHP', t), 'Phil.');
});

test('lowercase equality is equivalent to accent-sensitive ICU collation for book abbreviations', () => {
  // The compaction helper used to call
  // `localeCompare(other, undefined, { sensitivity: 'accent' })` per render from
  // the app shell. `toLowerCase()` equality folds case and keeps accents
  // distinct — the same predicate, without loading ICU collation.
  const samples: Array<[string, string]> = [
    ['Deut', 'Deut'],
    ['DEUT', 'deut'],
    ['Déut', 'Deut'],
    ['Éxodo', 'Exodo'],
    ['Éxodo', 'éxodo'],
    ['Song', 'Sng'],
    ['Psalms', 'Ps'],
  ];

  samples.forEach(([left, right]) => {
    assert.equal(
      left.toLowerCase() === right.toLowerCase(),
      left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0,
      `"${left}" vs "${right}" should compare the same way with and without ICU collation`
    );
  });
});
