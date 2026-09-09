import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTranslationPickerSections,
  buildTranslationSearchIndex,
  searchTranslationIndex,
} from './bibleTranslationModel';
const rows = [
  { id: 'one', name: 'English Bible', language: 'en', isDownloaded: true, hasText: true },
  { id: 'two', name: 'Nepali Bible', language: 'ne', isDownloaded: false, hasText: false },
];
test('hidden downloads remain findable, pinned audio appears in My Translations, current selection stays safe', () => {
  const result = buildTranslationPickerSections(rows, null, {
    hiddenIds: ['one'],
    pinnedIds: ['two'],
  });
  assert.deepEqual(
    result.myTranslations.map((x) => x.id),
    ['two']
  );
  assert.deepEqual(
    result.availableTranslations.map((x) => x.id),
    ['one']
  );
  assert.equal(rows[0].isDownloaded, true);
  assert.deepEqual(
    buildTranslationPickerSections(rows, null, {
      hiddenIds: ['one'],
      currentTranslationId: 'one',
    }).myTranslations.map((x) => x.id),
    ['one']
  );
});
test('indexed search preserves fuzzy search and does not re-read catalog fields on keystrokes', () => {
  let reads = 0;
  const indexed = buildTranslationSearchIndex([
    {
      ...rows[0],
      get name() {
        reads++;
        return 'English Bible';
      },
    },
  ]);
  const initialReads = reads;
  assert.equal(searchTranslationIndex(indexed, 'englis').length, 1);
  assert.equal(searchTranslationIndex(indexed, 'english').length, 1);
  assert.equal(reads, initialReads);
});

test('search builds one normalized haystack per catalog row across repeated queries', () => {
  let reads = 0;
  const catalog = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    language: 'en',
    get name() {
      reads++;
      return `Bible ${i}`;
    },
  }));
  const index = buildTranslationSearchIndex(catalog);
  for (const query of ['b', 'bi', 'bib', 'bibl', 'bible']) searchTranslationIndex(index, query);
  assert.equal(reads, 1000, 'five queries previously read and normalized 5000 catalog names');
});

test('the current translation leads My Translations ahead of pinned favourites', () => {
  const result = buildTranslationPickerSections(
    [
      { id: 'asv', language: 'English', isDownloaded: true, hasText: true },
      { id: 'kjv', language: 'English', isDownloaded: true, hasText: true },
      { id: 'bsb', language: 'English', isDownloaded: true, hasText: true },
    ],
    'English',
    { pinnedIds: ['kjv'], currentTranslationId: 'bsb' }
  );

  assert.deepEqual(
    result.myTranslations.map((x) => x.id),
    ['bsb', 'kjv', 'asv']
  );
});
