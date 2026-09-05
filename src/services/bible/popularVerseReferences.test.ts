import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

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
const ADDITIONAL_UPLIFTING_REFERENCE_COUNT = 142;

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

test('every daily passage exists in each bundled translation for offline use', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(
    fileURLToPath(new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url)),
    { readOnly: true }
  );
  try {
    const translations = database.prepare('SELECT DISTINCT translation_id FROM verses').all() as {
      translation_id: string;
    }[];
    const query = database.prepare(
      'SELECT COUNT(*) AS count FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? AND length(trim(text)) > 0'
    );
    assert.ok(translations.length >= 4);
    for (const { translation_id } of translations) {
      for (const reference of POPULAR_VERSE_REFERENCES) {
        const start = reference.verse!;
        const end = reference.verseEnd ?? start;
        const result = query.get(
          translation_id,
          reference.bookId,
          reference.chapter,
          start,
          end
        ) as {
          count: number;
        };
        assert.equal(
          result.count,
          end - start + 1,
          `${translation_id}: ${formatReference(reference)}`
        );
      }
    }
  } finally {
    database.close();
  }
});
