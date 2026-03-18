import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePassageReference } from './referenceParser';

test('parses a standard verse reference into Bible reader navigation params', () => {
  assert.deepEqual(parsePassageReference('John 3:16'), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    label: 'John 3:16',
  });
});

test('parses common abbreviations and chapter-only references', () => {
  assert.deepEqual(parsePassageReference('1 Cor 13'), {
    bookId: '1CO',
    chapter: 13,
    focusVerse: undefined,
    label: '1 Corinthians 13',
  });
});

test('uses the first navigable verse when the input is a complex range', () => {
  assert.deepEqual(parsePassageReference('Luke 10:5-7, 10-11'), {
    bookId: 'LUK',
    chapter: 10,
    focusVerse: 5,
    label: 'Luke 10:5',
  });
});

test('rejects bare book names, incomplete references, and plain-text searches', () => {
  assert.equal(parsePassageReference('John'), null);
  assert.equal(parsePassageReference('John 3:'), null);
  assert.equal(parsePassageReference('love one another'), null);
});
