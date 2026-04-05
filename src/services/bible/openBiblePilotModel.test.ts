import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenBiblePilotAudioBasePath,
  buildOpenBiblePilotAudioManifest,
  buildOpenBiblePilotCatalog,
  buildOpenBiblePilotCatalogRow,
  shouldPublishOpenBiblePilotTiming,
  type OpenBiblePilotRegistryTranslation,
} from './openBiblePilotModel';

const npiulb: OpenBiblePilotRegistryTranslation = {
  translationId: 'npiulb',
  name: 'Nepali Unlocked Literal Bible (ULB)',
  abbreviation: 'NPB',
  sortOrder: 400,
  languageCode: 'npi',
  languageName: 'Nepali',
  textDirection: 'ltr',
  licenseType: 'public-domain',
  sourceUrl: 'https://open.bible',
  sourceExtIds: ['6311b8b12131fe7f0296b208'],
  audioCoverage: 'new-testament',
  timingMode: 'full-only',
  selected: true,
  status: 'planned',
  hasTextPack: true,
  textPackTranslationId: 'npiulb',
};

const hin2017: OpenBiblePilotRegistryTranslation = {
  translationId: 'hin2017',
  name: 'Hindi Indian Revised Version',
  abbreviation: 'IRV',
  sortOrder: 402,
  languageCode: 'hin',
  languageName: 'Hindi',
  textDirection: 'ltr',
  licenseType: 'public-domain',
  sourceUrl: 'https://open.bible',
  sourceExtIds: ['61f9ed8ac26fb60d49614b1b', '61f99306c26fb60d495e832e'],
  audioCoverage: 'full-bible',
  timingMode: 'none',
  selected: true,
  status: 'planned',
  hasTextPack: true,
  textPackTranslationId: 'hin2017',
};

test('buildOpenBiblePilotCatalog emits versioned relative media paths and preserves text-pack metadata', () => {
  const catalog = buildOpenBiblePilotCatalog({
    translation: npiulb,
    version: '2026.04.05-open-bible-audio-v1',
    updatedAt: '2026-04-05T00:00:00.000Z',
    audioBooks: {
      MAT: { totalBytes: 100, totalChapters: 28 },
      MRK: { totalBytes: 50, totalChapters: 16 },
    },
    totalAudioChapters: 44,
    totalTimingChapters: 44,
    textCatalog: {
      downloadUrl: 'text/npiulb/npiulb-2026.03.24-v1.db',
      sha256: 'text-sha',
      version: '2026.03.24-v1',
    },
  });

  assert.equal(catalog.version, '2026.04.05-open-bible-audio-v1');
  assert.equal(catalog.text?.downloadUrl, 'text/npiulb/npiulb-2026.03.24-v1.db');
  assert.equal(catalog.audio?.baseUrl, 'audio/npiulb/2026.04.05-open-bible-audio-v1');
  assert.equal(catalog.audio?.chapterPathTemplate, 'chapters/{bookId}/{chapter}.mp3');
  assert.equal(catalog.audio?.coverage, 'new-testament');
  assert.equal(catalog.timing?.baseUrl, 'timing/npiulb/2026.04.05-open-bible-audio-v1');
});

test('timing can be disabled per pilot translation even when audio is full-Bible', () => {
  const catalog = buildOpenBiblePilotCatalog({
    translation: hin2017,
    version: '2026.04.05-open-bible-audio-v1',
    updatedAt: '2026-04-05T00:00:00.000Z',
    audioBooks: {
      GEN: { totalBytes: 100, totalChapters: 50 },
    },
    totalAudioChapters: 50,
    totalTimingChapters: 40,
    textCatalog: null,
  });

  assert.equal(shouldPublishOpenBiblePilotTiming(hin2017, 50, 40), false);
  assert.equal(catalog.timing, undefined);
});

test('buildOpenBiblePilotAudioManifest and catalog row stay aligned on versioned paths', () => {
  const manifest = buildOpenBiblePilotAudioManifest({
    translation: npiulb,
    version: '2026.04.05-open-bible-audio-v1',
    updatedAt: '2026-04-05T00:00:00.000Z',
    books: {
      JHN: {
        totalBytes: 1234,
        totalChapters: 21,
        chapters: [
          {
            chapter: 3,
            bytes: 321,
            path: 'chapters/JHN/3.mp3',
          },
        ],
      },
    },
    totalAudioBytes: 1234,
    totalAudioChapters: 21,
    totalTimingChapters: 21,
  });

  const catalog = buildOpenBiblePilotCatalog({
    translation: npiulb,
    version: manifest.audioVersion,
    updatedAt: manifest.updatedAt,
    audioBooks: {
      JHN: { totalBytes: 1234, totalChapters: 21 },
    },
    totalAudioChapters: 21,
    totalTimingChapters: 21,
    textCatalog: null,
  });

  const row = buildOpenBiblePilotCatalogRow({
    translation: npiulb,
    catalog,
  });

  assert.equal(manifest.baseUrl, buildOpenBiblePilotAudioBasePath('npiulb', manifest.audioVersion));
  assert.equal(row.translation_id, 'npiulb');
  assert.equal(row.has_audio, true);
  assert.equal(row.sort_order, 400);
  assert.equal(row.distribution_state, 'published');
  assert.equal(row.catalog.audio?.baseUrl, manifest.baseUrl);
});
