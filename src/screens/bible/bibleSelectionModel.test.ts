import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBibleSelectionShareText,
  buildBibleSelectionVerseRanges,
  extractBibleSelectionText,
  formatBibleSelectionReference,
  getBibleSelectionShareTranslationLabel,
  toggleBibleSelectionVerse,
} from './bibleSelectionModel';

test('formats a multi-verse Bible selection reference with the translation label', () => {
  assert.equal(
    formatBibleSelectionReference({
      bookName: 'Ephesians',
      chapter: 1,
      verses: [5, 3, 4, 4, 7],
      translationLabel: 'BSB',
    }),
    'Ephesians 1:3-5, 7 BSB'
  );
});

test('joins the selected verses into copyable selection text in chapter order', () => {
  assert.equal(
    extractBibleSelectionText(
      [
        { verse: 3, text: 'Blessed be the God and Father of our Lord Jesus Christ.' },
        {
          verse: 4,
          text: 'He chose us in Him before the foundation of the world.',
        },
        { verse: 5, text: 'He predestined us for adoption as His sons through Jesus Christ.' },
      ],
      [5, 3, 4]
    ),
    'Blessed be the God and Father of our Lord Jesus Christ. He chose us in Him before the foundation of the world. He predestined us for adoption as His sons through Jesus Christ.'
  );
});

test('groups contiguous selected verses into reusable verse ranges', () => {
  assert.deepEqual(buildBibleSelectionVerseRanges([1, 2, 4, 5, 7]), [
    { verse_start: 1, verse_end: 2 },
    { verse_start: 4, verse_end: 5 },
    { verse_start: 7, verse_end: 7 },
  ]);
});

test('toggles verses like a sorted set so multi-select stays order-independent', () => {
  let selectedVerses: number[] = [];

  selectedVerses = toggleBibleSelectionVerse(selectedVerses, 5);
  selectedVerses = toggleBibleSelectionVerse(selectedVerses, 3);
  selectedVerses = toggleBibleSelectionVerse(selectedVerses, 4);
  selectedVerses = toggleBibleSelectionVerse(selectedVerses, 3);

  assert.deepEqual(selectedVerses, [4, 5]);
});

test('builds the selected-verse share payload with the reference on top', () => {
  assert.equal(
    buildBibleSelectionShareText({
      referenceLabel: 'Ephesians 1:3-5 BSB',
      selectedText:
        'Blessed be the God and Father of our Lord Jesus Christ. He chose us in Him before the foundation of the world.',
    }),
    'Ephesians 1:3-5 BSB\n\nBlessed be the God and Father of our Lord Jesus Christ. He chose us in Him before the foundation of the world.'
  );
});

test('prefers the full translation name when the abbreviation is only the language label', () => {
  assert.equal(
    getBibleSelectionShareTranslationLabel({
      translationName: 'Nepali Bible',
      translationAbbreviation: 'Nepali',
      translationLanguage: 'Nepali',
    }),
    'Nepali Bible'
  );
});

test('keeps the short translation abbreviation when it is distinct from the language name', () => {
  assert.equal(
    getBibleSelectionShareTranslationLabel({
      translationName: 'Berean Standard Bible',
      translationAbbreviation: 'BSB',
      translationLanguage: 'English',
    }),
    'BSB'
  );
});
