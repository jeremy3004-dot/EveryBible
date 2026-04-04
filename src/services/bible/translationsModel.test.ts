/**
 * Unit tests for content versioning and multi-translation support.
 *
 * Covers:
 *  - bibleTranslations catalog integrity (all required fields present)
 *  - getTranslationById lookup
 *  - buildBibleSearchQuery tokenisation logic
 *  - isBundledBibleDatabaseReady version gate
 *  - parseTranslationCatalogManifest validation edge cases
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bibleTranslations, getTranslationById } from '../../constants/translations';
import {
  buildBibleSearchQuery,
  isBundledBibleDatabaseReady,
  BUNDLED_BIBLE_SCHEMA_VERSION,
  parseTranslationCatalogManifest,
} from './bibleDataModel';
import type { BundledBibleDatabaseStatus } from './bibleDataModel';

// ── Translation catalog integrity ─────────────────────────────────────────────

test('bibleTranslations catalog is non-empty', () => {
  assert.ok(bibleTranslations.length > 0, 'Catalog must contain at least one translation');
});

test('every translation in the catalog has required string fields', () => {
  const required: (keyof (typeof bibleTranslations)[0])[] = [
    'id',
    'name',
    'abbreviation',
    'language',
    'description',
    'copyright',
  ];

  for (const translation of bibleTranslations) {
    for (const field of required) {
      const value = translation[field];
      assert.equal(
        typeof value,
        'string',
        `translation "${translation.id}" field "${field}" must be a string`
      );
      assert.ok(
        (value as string).length > 0,
        `translation "${translation.id}" field "${field}" must not be empty`
      );
    }
  }
});

test('every translation has a valid audioGranularity value', () => {
  const valid = new Set(['none', 'chapter', 'verse']);
  for (const translation of bibleTranslations) {
    assert.ok(
      valid.has(translation.audioGranularity),
      `translation "${translation.id}" has invalid audioGranularity: ${translation.audioGranularity}`
    );
  }
});

test('every translation has a positive totalBooks count', () => {
  for (const translation of bibleTranslations) {
    assert.ok(
      typeof translation.totalBooks === 'number' && translation.totalBooks > 0,
      `translation "${translation.id}" must have totalBooks > 0`
    );
  }
});

test('every translation has a non-negative sizeInMB', () => {
  for (const translation of bibleTranslations) {
    assert.ok(
      typeof translation.sizeInMB === 'number' && translation.sizeInMB >= 0,
      `translation "${translation.id}" must have sizeInMB >= 0`
    );
  }
});

test('translations with hasAudio=true have an audioGranularity other than none', () => {
  for (const translation of bibleTranslations) {
    if (translation.hasAudio) {
      assert.notEqual(
        translation.audioGranularity,
        'none',
        `translation "${translation.id}" has hasAudio=true but audioGranularity=none`
      );
    }
  }
});

test('catalog contains the bundled BSB translation', () => {
  const bsb = bibleTranslations.find((t) => t.id === 'bsb');
  assert.ok(bsb, 'BSB translation must exist in catalog');
  assert.equal(bsb?.isDownloaded, true);
  assert.equal(bsb?.hasText, true);
});

test('all translation IDs are unique', () => {
  const ids = bibleTranslations.map((t) => t.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'Translation IDs must be unique');
});

// ── getTranslationById ────────────────────────────────────────────────────────

test('getTranslationById returns the matching translation by ID', () => {
  const bsb = getTranslationById('bsb');
  assert.ok(bsb, 'Should find BSB by ID');
  assert.equal(bsb?.abbreviation, 'BSB');
});

test('getTranslationById returns undefined for an unknown ID', () => {
  const result = getTranslationById('unknown-xyz');
  assert.equal(result, undefined);
});

test('getTranslationById is case-sensitive and does not find a wrong-case ID', () => {
  // IDs are defined lowercase; uppercase lookup should return undefined
  const result = getTranslationById('BSB');
  assert.equal(result, undefined);
});

test('getTranslationById finds all translations by their own ID', () => {
  for (const translation of bibleTranslations) {
    const found = getTranslationById(translation.id);
    assert.ok(found, `Should find "${translation.id}" by its own ID`);
    assert.equal(found?.id, translation.id);
  }
});

// ── buildBibleSearchQuery ─────────────────────────────────────────────────────

test('buildBibleSearchQuery returns null for an empty string', () => {
  assert.equal(buildBibleSearchQuery(''), null);
});

test('buildBibleSearchQuery returns null for a whitespace-only string', () => {
  assert.equal(buildBibleSearchQuery('   '), null);
});

test('buildBibleSearchQuery returns null for a punctuation-only string', () => {
  assert.equal(buildBibleSearchQuery('!!! ---'), null);
});

test('buildBibleSearchQuery appends a wildcard to a single token', () => {
  assert.equal(buildBibleSearchQuery('grace'), 'grace*');
});

test('buildBibleSearchQuery appends wildcards to all tokens', () => {
  assert.equal(buildBibleSearchQuery('love one another'), 'love* one* another*');
});

test('buildBibleSearchQuery strips punctuation between tokens', () => {
  const result = buildBibleSearchQuery('faith, hope, and love');
  assert.equal(result, 'faith* hope* and* love*');
});

test('buildBibleSearchQuery handles unicode letter tokens', () => {
  // Hebrew / accented characters should be kept as tokens
  const result = buildBibleSearchQuery('grâce');
  assert.equal(result, 'grâce*');
});

test('buildBibleSearchQuery handles mixed numeric and letter tokens', () => {
  const result = buildBibleSearchQuery('John 3');
  assert.equal(result, 'John* 3*');
});

// ── isBundledBibleDatabaseReady ───────────────────────────────────────────────

function makeStatus(overrides: Partial<BundledBibleDatabaseStatus> = {}): BundledBibleDatabaseStatus {
  return {
    verseCount: 31102,
    schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION,
    hasSearchIndex: true,
    ...overrides,
  };
}

test('isBundledBibleDatabaseReady returns true when all criteria are met', () => {
  assert.equal(isBundledBibleDatabaseReady(makeStatus(), 31000), true);
});

test('isBundledBibleDatabaseReady returns false when verseCount is below minimum', () => {
  assert.equal(isBundledBibleDatabaseReady(makeStatus({ verseCount: 100 }), 31000), false);
});

test('isBundledBibleDatabaseReady returns false when schemaVersion is outdated', () => {
  assert.equal(
    isBundledBibleDatabaseReady(makeStatus({ schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION - 1 }), 31000),
    false
  );
});

test('isBundledBibleDatabaseReady returns false when the search index is absent', () => {
  assert.equal(isBundledBibleDatabaseReady(makeStatus({ hasSearchIndex: false }), 31000), false);
});

test('isBundledBibleDatabaseReady accepts a future schemaVersion above minimum', () => {
  assert.equal(
    isBundledBibleDatabaseReady(makeStatus({ schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION + 1 }), 31000),
    true
  );
});

test('isBundledBibleDatabaseReady returns false when all criteria fail simultaneously', () => {
  assert.equal(
    isBundledBibleDatabaseReady(
      { verseCount: 0, schemaVersion: 0, hasSearchIndex: false },
      31000
    ),
    false
  );
});

// ── parseTranslationCatalogManifest edge cases ────────────────────────────────

const validManifestPayload = {
  manifestVersion: '2026.03.01',
  issuedAt: '2026-03-01T00:00:00.000Z',
  translations: [],
};

test('parseTranslationCatalogManifest accepts a valid payload with an empty translations array', () => {
  const result = parseTranslationCatalogManifest(validManifestPayload);
  assert.equal(result.manifestVersion, '2026.03.01');
  assert.equal(result.translations.length, 0);
});

test('parseTranslationCatalogManifest throws when the payload is not an object', () => {
  assert.throws(
    () => parseTranslationCatalogManifest('a string'),
    /must be an object/i
  );
});

test('parseTranslationCatalogManifest throws when manifestVersion is missing', () => {
  assert.throws(
    () => parseTranslationCatalogManifest({ ...validManifestPayload, manifestVersion: '' }),
    /missing required fields/i
  );
});

test('parseTranslationCatalogManifest throws when issuedAt is not a valid ISO date', () => {
  assert.throws(
    () => parseTranslationCatalogManifest({ ...validManifestPayload, issuedAt: 'not-a-date' }),
    /missing required fields/i
  );
});

test('parseTranslationCatalogManifest throws when translations is missing', () => {
  const withoutTranslations = { ...validManifestPayload } as Partial<typeof validManifestPayload>;
  delete withoutTranslations.translations;
  assert.throws(
    () => parseTranslationCatalogManifest(withoutTranslations),
    /missing required fields/i
  );
});

test('parseTranslationCatalogManifest silently drops invalid translation entries', () => {
  const payload = {
    ...validManifestPayload,
    translations: [
      // Valid entry
      {
        id: 'web',
        name: 'World English Bible',
        abbreviation: 'WEB',
        language: 'English',
        description: 'Public domain',
        copyright: 'Public Domain',
        hasText: true,
        hasAudio: false,
        audioGranularity: 'none',
        totalBooks: 66,
        sizeInMB: 4.5,
        text: {
          format: 'sqlite',
          version: '2026.01.01',
          downloadUrl: 'https://cdn.example.com/web.sqlite',
          sha256: 'abc123',
        },
      },
      // Invalid entry — missing required fields
      { id: '', name: '' },
    ],
  };

  const result = parseTranslationCatalogManifest(payload);
  assert.equal(result.translations.length, 1, 'Invalid translation entries should be dropped');
  assert.equal(result.translations[0]?.id, 'web');
});

test('parseTranslationCatalogManifest parses a translation with audio stream-template', () => {
  const payload = {
    ...validManifestPayload,
    translations: [
      {
        id: 'kjv-audio',
        name: 'King James Version Audio',
        abbreviation: 'KJV',
        language: 'English',
        description: 'KJV with audio',
        copyright: 'Public Domain',
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 0,
        audio: {
          strategy: 'stream-template',
          baseUrl: 'https://cdn.example.com/kjv',
          chapterPathTemplate: '{bookId}/{chapter}.mp3',
        },
      },
    ],
  };

  const result = parseTranslationCatalogManifest(payload);
  assert.equal(result.translations.length, 1);
  assert.equal(result.translations[0]?.id, 'kjv-audio');
});

test('parseTranslationCatalogManifest preserves explicit audio book coverage when present', () => {
  const payload = {
    ...validManifestPayload,
    translations: [
      {
        id: 'npiulb',
        name: 'Nepali Bible',
        abbreviation: 'NPB',
        language: 'Nepali',
        description: 'Open Bible NT audio',
        copyright: 'Public Domain',
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 5,
        audio: {
          strategy: 'stream-template',
          baseUrl: 'https://cdn.example.com/npiulb',
          chapterPathTemplate: '{bookId}/{chapter}.mp3',
          books: {
            MAT: { totalChapters: 28 },
            MRK: { totalChapters: 16 },
            LUK: { totalChapters: 24 },
            JHN: { totalChapters: 21 },
          },
        },
      },
    ],
  };

  const result = parseTranslationCatalogManifest(payload);
  assert.deepEqual(
    Object.keys(result.translations[0]?.audio?.books ?? {}),
    ['MAT', 'MRK', 'LUK', 'JHN']
  );
});
