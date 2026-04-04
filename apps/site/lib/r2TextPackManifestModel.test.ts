import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTextPackManifestItem,
  parseTextPackObjectKey,
} from './r2TextPackManifestModel';

test('parseTextPackObjectKey extracts translation ids and file names from R2 text object keys', () => {
  assert.deepEqual(
    parseTextPackObjectKey('text/npiulb/npiulb-2026.03.24-v1.db'),
    {
      translationId: 'npiulb',
      fileName: 'npiulb-2026.03.24-v1.db',
    }
  );

  assert.deepEqual(
    parseTextPackObjectKey('text/eng-web/eng-web-2026.04.03-v1.db'),
    {
      translationId: 'eng-web',
      fileName: 'eng-web-2026.04.03-v1.db',
    }
  );
});

test('parseTextPackObjectKey rejects non-db or malformed keys', () => {
  assert.equal(parseTextPackObjectKey('audio/npiulb/JHN/1.mp3'), null);
  assert.equal(parseTextPackObjectKey('text/npiulb/'), null);
  assert.equal(parseTextPackObjectKey('text/npiulb/readme.txt'), null);
});

test('buildTextPackManifestItem derives the manifest fields for direct and overridden translation ids', () => {
  assert.deepEqual(
    buildTextPackManifestItem({
      abbreviation: 'NPB',
      fileName: 'npiulb-2026.03.24-v1.db',
      lastModified: '2026-04-02T12:48:40.000Z',
      name: 'Nepali Bible',
      objectKey: 'text/npiulb/npiulb-2026.03.24-v1.db',
      sha256: 'sha-npi',
      sourceTranslationId: 'npiulb',
      translationId: 'npiulb',
      verseCount: 31102,
    }),
    {
      abbreviation: 'NPB',
      downloadUrl: 'text/npiulb/npiulb-2026.03.24-v1.db',
      name: 'Nepali Bible',
      sha256: 'sha-npi',
      sourceTranslationId: 'npiulb',
      translationId: 'npiulb',
      updatedAt: '2026-04-02T12:48:40.000Z',
      verseCount: 31102,
      version: '2026.03.24-v1',
    }
  );

  assert.deepEqual(
    buildTextPackManifestItem({
      abbreviation: 'KJV',
      fileName: 'kjv-2026.04.03-v1.db',
      lastModified: '2026-04-03T13:45:02.000Z',
      name: 'King James Version',
      objectKey: 'text/kjv/kjv-2026.04.03-v1.db',
      sha256: 'sha-kjv',
      sourceTranslationId: 'eng-kjv',
      translationId: 'kjv',
      verseCount: 31102,
    }),
    {
      abbreviation: 'KJV',
      downloadUrl: 'text/kjv/kjv-2026.04.03-v1.db',
      name: 'King James Version',
      sha256: 'sha-kjv',
      sourceTranslationId: 'eng-kjv',
      translationId: 'kjv',
      updatedAt: '2026-04-03T13:45:02.000Z',
      verseCount: 31102,
      version: '2026.04.03-v1',
    }
  );
});
