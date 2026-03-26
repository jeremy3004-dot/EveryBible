import test from 'node:test';
import assert from 'node:assert/strict';

import type { TranslationCatalogEntry } from '../supabase/types';
import type { BibleTranslation } from '../../types';
import {
  buildCatalogLanguageFilters,
  filterInstallableCatalogEntries,
  filterCatalogEntriesByLanguage,
  mapCatalogEntryToBibleTranslation,
  normalizeCatalogEntries,
  normalizeCatalogTranslationId,
} from './translationCatalogModel';

const baseEntry: TranslationCatalogEntry = {
  id: 'row-1',
  translation_id: 'KJV',
  name: 'King James Version',
  abbreviation: 'KJV',
  language_code: 'eng',
  language_name: 'English',
  license_type: 'public-domain',
  license_url: null,
  source_url: null,
  has_audio: false,
  has_text: true,
  is_bundled: false,
  is_available: true,
  sort_order: 3,
  created_at: '2026-03-26T00:00:00.000Z',
  updated_at: '2026-03-26T00:00:00.000Z',
};

test('mapCatalogEntryToBibleTranslation keeps remote text capability when local placeholder says false', () => {
  const existing: BibleTranslation = {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'English',
    description: 'placeholder',
    copyright: 'Public Domain',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4.5,
    hasText: false,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'runtime',
    installState: 'remote-only',
  };

  const mapped = mapCatalogEntryToBibleTranslation(baseEntry, existing);

  assert.equal(mapped.id, 'kjv');
  assert.equal(mapped.hasText, true);
  assert.equal(mapped.hasAudio, false);
  assert.equal(mapped.source, 'runtime');
});

test('mapCatalogEntryToBibleTranslation preserves existing downloaded state and audio capability', () => {
  const entry: TranslationCatalogEntry = {
    ...baseEntry,
    translation_id: 'WEB',
    abbreviation: 'WEB',
    name: 'World English Bible',
    has_audio: true,
  };
  const existing: BibleTranslation = {
    id: 'web',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'English',
    description: 'placeholder',
    copyright: 'Public Domain',
    isDownloaded: true,
    downloadedBooks: ['GEN'],
    downloadedAudioBooks: ['GEN'],
    totalBooks: 66,
    sizeInMB: 4.5,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'bundled',
    installState: 'installed',
    textPackLocalPath: '/tmp/web.db',
  };

  const mapped = mapCatalogEntryToBibleTranslation(entry, existing);

  assert.equal(mapped.hasText, true);
  assert.equal(mapped.hasAudio, true);
  assert.equal(mapped.isDownloaded, true);
  assert.deepEqual(mapped.downloadedBooks, ['GEN']);
  assert.equal(mapped.audioGranularity, 'chapter');
});

test('normalizeCatalogEntries lowercases ids and keeps the best-ranked duplicate', () => {
  const normalized = normalizeCatalogEntries([
    {
      ...baseEntry,
      id: 'row-older',
      translation_id: 'NPIULB',
      sort_order: 20,
    },
    {
      ...baseEntry,
      id: 'row-newer',
      translation_id: 'npiulb',
      name: 'Nepali Bible',
      abbreviation: 'NPB',
      language_code: 'npi',
      language_name: 'Nepali',
      sort_order: 5,
    },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.translation_id, 'npiulb');
  assert.equal(normalized[0]?.name, 'Nepali Bible');
});

test('normalizeCatalogTranslationId collapses backend alias ids onto the app store ids', () => {
  assert.equal(normalizeCatalogTranslationId('engwebp'), 'web');
  assert.equal(normalizeCatalogTranslationId('eng-asv'), 'asv');
  assert.equal(normalizeCatalogTranslationId('engBBE'), 'bbe');
  assert.equal(normalizeCatalogTranslationId('spaRV1909'), 'sparv1909');
});

test('buildCatalogLanguageFilters deduplicates normalized labels and keeps English first', () => {
  const filters = buildCatalogLanguageFilters([
    {
      ...baseEntry,
      translation_id: 'KJV',
      language_name: ' English ',
    },
    {
      ...baseEntry,
      translation_id: 'WEB',
      language_name: 'English',
    },
    {
      ...baseEntry,
      translation_id: 'HIN',
      language_name: 'Hindi',
    },
    {
      ...baseEntry,
      translation_id: 'NPI',
      language_name: 'Nepali',
    },
  ]);

  assert.deepEqual(filters, [
    { code: 'English', label: 'English' },
    { code: 'Hindi', label: 'Hindi' },
    { code: 'Nepali', label: 'Nepali' },
  ]);
});

test('filterCatalogEntriesByLanguage matches trimmed language labels and supports all', () => {
  const entries = [
    {
      ...baseEntry,
      translation_id: 'KJV',
      language_name: ' English ',
    },
    {
      ...baseEntry,
      translation_id: 'WEB',
      language_name: 'English',
    },
    {
      ...baseEntry,
      translation_id: 'HIN',
      language_name: 'Hindi',
    },
  ];

  assert.deepEqual(
    filterCatalogEntriesByLanguage(entries, 'English').map((entry) => entry.translation_id),
    ['KJV', 'WEB']
  );

  assert.deepEqual(
    filterCatalogEntriesByLanguage(entries, 'all').map((entry) => entry.translation_id),
    ['KJV', 'WEB', 'HIN']
  );
});

test('filterInstallableCatalogEntries keeps alias-backed translations with a current backend version and excludes orphan catalog rows', () => {
  const entries: TranslationCatalogEntry[] = [
    {
      ...baseEntry,
      translation_id: 'BBE',
      name: 'Bible in Basic English',
      abbreviation: 'BBE',
      language_name: 'English',
      sort_order: 6,
    },
    {
      ...baseEntry,
      translation_id: 'engBBE',
      name: 'Bible in Basic English',
      abbreviation: 'BBE',
      language_name: 'English',
      sort_order: 100,
    },
    {
      ...baseEntry,
      translation_id: 'RVR',
      name: 'Reina-Valera Revisada',
      abbreviation: 'RVR',
      language_code: 'spa',
      language_name: 'Spanish',
      sort_order: 10,
    },
    {
      ...baseEntry,
      translation_id: 'spaRV1909',
      name: 'Reina Valera 1909',
      abbreviation: 'RVR',
      language_code: 'spa',
      language_name: 'Spanish',
      sort_order: 100,
    },
    {
      ...baseEntry,
      translation_id: 'npioncb',
      name: 'Nepali Contemporary Bible',
      abbreviation: 'NCB',
      language_code: 'npi',
      language_name: 'Nepali',
      sort_order: 100,
    },
    {
      ...baseEntry,
      translation_id: 'npiulb',
      name: 'Nepali Bible',
      abbreviation: 'NPB',
      language_code: 'npi',
      language_name: 'Nepali',
      sort_order: 100,
    },
    {
      ...baseEntry,
      translation_id: 'KJV',
      name: 'King James Version',
      abbreviation: 'KJV',
      language_name: 'English',
      sort_order: 3,
    },
  ];

  const filtered = filterInstallableCatalogEntries(
    entries,
    new Set(['engBBE', 'spaRV1909', 'npiulb'])
  );

  assert.deepEqual(
    filtered.map((entry) => entry.translation_id).sort(),
    ['bbe', 'npiulb', 'sparv1909']
  );
});
