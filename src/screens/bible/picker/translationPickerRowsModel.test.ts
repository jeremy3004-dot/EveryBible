import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../../types';
import {
  buildTranslationPickerRows,
  groupPosition,
  translationPickerRowKey,
  translationPickerRowType,
  type TranslationPickerRowsInput,
} from './translationPickerRowsModel';

const bible = (id: string) => ({ id, name: id.toUpperCase() }) as BibleTranslation;
const labels = { myTranslations: 'My Translations', available: 'Available' };

const input = (
  overrides: Partial<TranslationPickerRowsInput> = {}
): TranslationPickerRowsInput => ({
  hasActiveSearchQuery: false,
  languageSearchResults: [],
  languageOptionCount: 2,
  sections: { myTranslations: [bible('bsb'), bible('kjv')], availableTranslations: [bible('net')] },
  availableLanguageLabel: 'English',
  labels,
  ...overrides,
});

const shape = (rows: ReturnType<typeof buildTranslationPickerRows>) =>
  rows.map((row) =>
    row.type === 'translation'
      ? `${row.id}:${row.position}`
      : row.type === 'section-header'
        ? `# ${row.label}`
        : row.id
  );

test('groupPosition rounds only the outer corners of a group', () => {
  assert.equal(groupPosition(0, 1), 'only');
  assert.deepEqual(
    [0, 1, 2].map((index) => groupPosition(index, 3)),
    ['first', 'middle', 'last']
  );
  assert.deepEqual(
    [0, 1].map((index) => groupPosition(index, 2)),
    ['first', 'last']
  );
});

test('browsing: the language pill, My Translations, then Available named by language', () => {
  assert.deepEqual(shape(buildTranslationPickerRows(input())), [
    'preference',
    '# My Translations',
    'my-bsb:first',
    'my-kjv:last',
    '# Available · English',
    'available-net:only',
  ]);
});

test('with one language there is no pill; with no language label the heading stays plain', () => {
  assert.deepEqual(
    shape(
      buildTranslationPickerRows(input({ languageOptionCount: 1, availableLanguageLabel: '' }))
    ),
    ['# My Translations', 'my-bsb:first', 'my-kjv:last', '# Available', 'available-net:only']
  );
});

test('searching: matching languages first, no pill, and an unlabelled Available heading', () => {
  const rows = buildTranslationPickerRows(
    input({
      hasActiveSearchQuery: true,
      languageSearchResults: [
        { value: 'Spanish', label: 'Spanish / Español', translationCount: 2 },
      ],
      sections: { myTranslations: [], availableTranslations: [bible('rv'), bible('lbla')] },
    })
  );
  assert.deepEqual(shape(rows), [
    'search-language-Spanish',
    '# Available',
    'available-rv:first',
    'available-lbla:last',
  ]);
});

test('empty sections draw no heading', () => {
  assert.deepEqual(
    shape(
      buildTranslationPickerRows(
        input({
          hasActiveSearchQuery: true,
          sections: { myTranslations: [], availableTranslations: [] },
        })
      )
    ),
    []
  );
});

test('the same Bible gets distinct keys in My Translations and Available', () => {
  const rows = buildTranslationPickerRows(
    input({
      sections: { myTranslations: [bible('bsb')], availableTranslations: [bible('bsb')] },
    })
  );
  const keys = rows.map(translationPickerRowKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(rows.map(translationPickerRowType), [
    'preference',
    'section-header',
    'translation',
    'section-header',
    'translation',
  ]);
});
