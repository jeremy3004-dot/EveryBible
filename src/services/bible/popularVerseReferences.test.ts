import assert from 'node:assert/strict';
import test from 'node:test';

import { POPULAR_VERSE_REFERENCES } from './popularVerseReferences';

const formatReference = (reference: {
  bookId: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}) => {
  if (!reference.verse) {
    return `${reference.bookId} ${reference.chapter}`;
  }

  if (!reference.verseEnd || reference.verseEnd === reference.verse) {
    return `${reference.bookId} ${reference.chapter}:${reference.verse}`;
  }

  return `${reference.bookId} ${reference.chapter}:${reference.verse}-${reference.verseEnd}`;
};

const ORIGINAL_REQUESTED_REFERENCE_COUNT = 58;
const ADDITIONAL_UPLIFTING_REFERENCE_COUNT = 100;

const REQUIRED_REFERENCES = [
  'JHN 3:16',
  'PRO 3:5-6',
  'NUM 6:24-26',
  'MAT 22:37-39',
  'REV 21:3-4',
  'GEN 28:15',
  'PSA 100:4-5',
  'ISA 43:18-19',
  'HAB 3:17-18',
  'ROM 8:38-39',
  'EPH 2:8-9',
  '1TH 5:16-18',
  'REV 22:13',
];

test('popular verse references include the requested verses and passage ranges', () => {
  const references = POPULAR_VERSE_REFERENCES.map(formatReference);
  const referenceSet = new Set(references);

  assert.equal(
    references.length,
    ORIGINAL_REQUESTED_REFERENCE_COUNT + ADDITIONAL_UPLIFTING_REFERENCE_COUNT
  );
  assert.equal(referenceSet.size, references.length);
  assert.equal(references[0], 'JHN 3:16');
  assert.equal(references[ORIGINAL_REQUESTED_REFERENCE_COUNT - 1], 'REV 3:11');
  assert.equal(references[ORIGINAL_REQUESTED_REFERENCE_COUNT], 'GEN 28:15');

  for (const reference of REQUIRED_REFERENCES) {
    assert.equal(referenceSet.has(reference), true, `Missing ${reference}`);
  }
});
