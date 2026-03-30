import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBibleSelectionShareText,
  extractBibleSelectionText,
  formatBibleSelectionReference,
} from './bibleSelectionModel';

test('formats a selected Bible reference with the translation label', () => {
  assert.equal(
    formatBibleSelectionReference({
      bookName: 'Ephesians',
      chapter: 1,
      startVerse: 3,
      endVerse: 3,
      translationLabel: 'BSB',
    }),
    'Ephesians 1:3 BSB'
  );
});

test('formats a selected Bible reference range with the translation label', () => {
  assert.equal(
    formatBibleSelectionReference({
      bookName: 'Ephesians',
      chapter: 1,
      startVerse: 3,
      endVerse: 5,
      translationLabel: 'BSB',
    }),
    'Ephesians 1:3-5 BSB'
  );
});

test('joins the selected verses into copyable selection text', () => {
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
      { startVerse: 3, endVerse: 5 }
    ),
    'Blessed be the God and Father of our Lord Jesus Christ. He chose us in Him before the foundation of the world. He predestined us for adoption as His sons through Jesus Christ.'
  );
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
