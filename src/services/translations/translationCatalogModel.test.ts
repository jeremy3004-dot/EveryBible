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
  catalog: null,
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

test('mapCatalogEntryToBibleTranslation carries backend catalog delivery metadata into the app model', () => {
  const entry: TranslationCatalogEntry = {
    ...baseEntry,
    translation_id: 'BSB',
    abbreviation: 'BSB',
    name: 'Berean Standard Bible',
    has_audio: true,
    catalog: {
      version: '2026.03.26',
      updatedAt: '2026-03-26T12:00:00.000Z',
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://media.everybible.app/audio/bsb/v2026-03-26-1',
        chapterPathTemplate: 'chapters/{bookId}/{chapter}.m4a',
        fileExtension: 'm4a',
        mimeType: 'audio/mp4',
      },
    },
  };

  const mapped = mapCatalogEntryToBibleTranslation(entry);

  assert.equal(mapped.hasAudio, true);
  assert.equal(mapped.audioGranularity, 'chapter');
  assert.equal(mapped.catalog?.audio?.strategy, 'stream-template');
  assert.equal(mapped.catalog?.audio?.fileExtension, 'm4a');
  assert.equal(mapped.catalog?.audio?.mimeType, 'audio/mp4');
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
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/bbe.db',
          format: 'sqlite',
          sha256: 'bbe-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'engBBE',
      name: 'Bible in Basic English',
      abbreviation: 'BBE',
      language_name: 'English',
      sort_order: 100,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/engBBE.db',
          format: 'sqlite',
          sha256: 'engbbe-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'RVR',
      name: 'Reina-Valera Revisada',
      abbreviation: 'RVR',
      language_code: 'spa',
      language_name: 'Spanish',
      sort_order: 10,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/rvr.db',
          format: 'sqlite',
          sha256: 'rvr-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'spaRV1909',
      name: 'Reina Valera 1909',
      abbreviation: 'RVR',
      language_code: 'spa',
      language_name: 'Spanish',
      sort_order: 100,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/spaRV1909.db',
          format: 'sqlite',
          sha256: 'sparv1909-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
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
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/npiulb.db',
          format: 'sqlite',
          sha256: 'npiulb-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
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

test('filterInstallableCatalogEntries hides blocked English Bible variants even when they are installable', () => {
  const entries: TranslationCatalogEntry[] = [
    {
      ...baseEntry,
      translation_id: 'BSB',
      name: 'Berean Standard Bible',
      abbreviation: 'BSB',
      language_name: 'English',
      sort_order: 1,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/bsb.db',
          format: 'sqlite',
          sha256: 'bsb-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'engdby',
      name: 'Darby Translation',
      abbreviation: 'DBY',
      language_name: 'English',
      sort_order: 2,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/engdby.db',
          format: 'sqlite',
          sha256: 'dby-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'engdra',
      name: 'Darby Translation (Alternate)',
      abbreviation: 'DBYA',
      language_name: 'English',
      sort_order: 3,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/engdra.db',
          format: 'sqlite',
          sha256: 'dra-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
    {
      ...baseEntry,
      translation_id: 'enggnv',
      name: 'Geneva Bible 1599',
      abbreviation: 'GNV',
      language_name: 'English',
      sort_order: 4,
      catalog: {
        text: {
          downloadUrl: 'https://cdn.example.com/text/enggnv.db',
          format: 'sqlite',
          sha256: 'gnv-sha',
          version: '2026.04.04-v1',
        },
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: '2026.04.04-v1',
      },
    },
  ];

  const filtered = filterInstallableCatalogEntries(
    entries,
    new Set(['bsb', 'engdby', 'engdra', 'enggnv'])
  );

  assert.deepEqual(
    filtered.map((entry) => entry.translation_id),
    ['bsb']
  );
});

test('filterInstallableCatalogEntries excludes runtime text translations that have no published text-pack download', () => {
  const filtered = filterInstallableCatalogEntries(
    [
      {
        ...baseEntry,
        translation_id: 'npiulb',
        name: 'Nepali Bible',
        abbreviation: 'NPB',
        language_code: 'npi',
        language_name: 'Nepali',
        sort_order: 5,
        catalog: null,
      },
    ],
    new Set(['npiulb'])
  );

  assert.deepEqual(filtered, []);
});

test('filterInstallableCatalogEntries keeps audio-only runtime rows when they carry a real audio catalog', () => {
  const filtered = filterInstallableCatalogEntries(
    [
      {
        ...baseEntry,
        translation_id: 'benbcv',
        name: 'Bengali Contemporary Version',
        abbreviation: 'BCV',
        language_code: 'ben',
        language_name: 'Bengali',
        has_text: false,
        has_audio: true,
        catalog: {
          audio: {
            strategy: 'stream-template',
            baseUrl: 'audio/benbcv/2026.04.05-open-bible-audio-v1',
            chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
            coverage: 'full-bible',
          },
          updatedAt: '2026-04-05T00:00:00.000Z',
          version: '2026.04.05-open-bible-audio-v1',
        },
      },
    ],
    new Set()
  );

  assert.deepEqual(filtered.map((entry) => entry.translation_id), ['benbcv']);
});

test('filterInstallableCatalogEntries keeps text-backed runtime rows when they carry a published text pack', () => {
  const filtered = filterInstallableCatalogEntries(
    [
      {
        ...baseEntry,
        translation_id: 'npiulb',
        name: 'Nepali Unlocked Literal Bible (ULB)',
        abbreviation: 'NPB',
        language_code: 'npi',
        language_name: 'Nepali',
        has_text: true,
        has_audio: true,
        catalog: {
          text: {
            downloadUrl: 'text/npiulb/npiulb-2026.03.24-v1.db',
            format: 'sqlite',
            sha256: 'npi-text-sha',
            version: '2026.03.24-v1',
          },
          audio: {
            strategy: 'stream-template',
            baseUrl: 'audio/npiulb/2026.04.05-open-bible-audio-v1',
            chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
            coverage: 'new-testament',
          },
          updatedAt: '2026-04-05T00:00:00.000Z',
          version: '2026.04.05-open-bible-audio-v1',
        },
      },
    ],
    new Set()
  );

  assert.deepEqual(filtered.map((entry) => entry.translation_id), ['npiulb']);
});
