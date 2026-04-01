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

test('popular verse references include the requested verses and passage ranges', () => {
  const references = POPULAR_VERSE_REFERENCES.map(formatReference);

  assert.equal(references.length, 58);
  assert.deepEqual(references, [
    'JHN 3:16',
    'ROM 8:28',
    'PHP 4:13',
    'JER 29:11',
    'PSA 23:1',
    'PRO 3:5-6',
    'ISA 40:31',
    'MAT 11:28',
    'ROM 12:2',
    'GAL 5:22',
    'NUM 6:24-26',
    'DEU 31:6',
    'JOS 1:9',
    '2SA 22:31',
    '2CH 7:14',
    'PSA 34:8',
    'PSA 46:1',
    'PSA 63:1',
    'PSA 91:1',
    'PSA 103:12',
    'ISA 9:6',
    'ISA 41:10',
    'ISA 53:5',
    'LAM 3:22-23',
    'EZK 36:26',
    'MAT 6:33',
    'MAT 16:24',
    'MAT 22:37-39',
    'MRK 8:34',
    'JHN 10:10',
    'JHN 14:6',
    'JHN 15:13',
    'JHN 16:33',
    'ACT 1:8',
    'ROM 5:8',
    'ROM 6:23',
    'ROM 8:1',
    'MAT 4:4',
    'MAT 5:16',
    'MAT 9:37-38',
    'MRK 11:24',
    'LUK 12:32',
    'JHN 5:24',
    'JHN 6:37',
    'JHN 7:38',
    'JHN 8:31-32',
    'JHN 10:27-28',
    'JHN 15:7',
    'ACT 2:21',
    'ROM 5:1',
    'ROM 10:13',
    '2CO 9:8',
    'EPH 5:8',
    'COL 1:13',
    'HEB 13:8',
    'REV 2:10',
    'REV 21:3-4',
    'REV 3:11',
  ]);
});
