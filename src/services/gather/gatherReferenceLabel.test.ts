import test from 'node:test';
import assert from 'node:assert/strict';

import { formatBibleReference, formatBibleReferenceLabel } from './gatherReferenceLabel';

test('formatBibleReference localizes the book name through the provided resolver', () => {
  const label = formatBibleReference({ bookId: 'JHN', chapter: 1 }, (bookId) =>
    bookId === 'JHN' ? 'यूहन्ना' : bookId
  );

  assert.equal(label, 'यूहन्ना 1');
});

test('formatBibleReferenceLabel joins multiple localized references without falling back to English', () => {
  const label = formatBibleReferenceLabel(
    [
      { bookId: 'JHN', chapter: 1 },
      { bookId: 'ROM', chapter: 8, startVerse: 28, endVerse: 30 },
    ],
    (bookId) => {
      const names: Record<string, string> = {
        JHN: 'यूहन्ना',
        ROM: 'रोमी',
      };
      return names[bookId] ?? bookId;
    }
  );

  assert.equal(label, 'यूहन्ना 1; रोमी 8:28-30');
});

test('formatBibleReferenceLabel falls back to the canonical English book name when no resolver is provided', () => {
  const label = formatBibleReferenceLabel([{ bookId: 'JHN', chapter: 3 }]);

  assert.equal(label, 'John 3');
});
