import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import {
  activateTranslationPackCandidate,
  buildBibleFallbackSearchTerms,
  buildInstalledBibleDatabaseSource,
  failTranslationPackCandidate,
  parseTranslationCatalogManifest,
  rollbackTranslationPack,
  stageTranslationPackCandidate,
} from './bibleDataModel';

test('parseTranslationCatalogManifest preserves a valid el-manifest audio block', () => {
  const parsed = parseTranslationCatalogManifest({
    manifestVersion: '2026.07.20',
    issuedAt: '2026-07-20T00:00:00.000Z',
    translations: [
      {
        id: 'lqdtest',
        name: 'LangQuest Distribution Test',
        abbreviation: 'LQDT',
        language: 'Test Language',
        description: 'Every Language audio-only entry',
        copyright: 'Public Domain audio (CC0 1.0)',
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 0,
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
          audioVersion: 'v2026-07-20-1',
          catalogBaseUrl: 'https://lqd-media.platform-979.workers.dev',
          fileExtension: 'mp3',
        },
      },
    ],
  });

  assert.equal(parsed.translations.length, 1);
  const audio = parsed.translations[0]?.audio;
  assert.equal(audio?.strategy, 'el-manifest');
  assert.equal(audio?.manifestUrl, '/manifests/audio/lqdtest/v2026-07-20-1.json');
  assert.equal(audio?.audioVersion, 'v2026-07-20-1');
  assert.equal(audio?.catalogBaseUrl, 'https://lqd-media.platform-979.workers.dev');
  assert.equal(audio?.fileExtension, 'mp3');
});

test('parseTranslationCatalogManifest drops an el-manifest audio block with a non-http catalogBaseUrl', () => {
  const parsed = parseTranslationCatalogManifest({
    manifestVersion: '2026.07.20',
    issuedAt: '2026-07-20T00:00:00.000Z',
    translations: [
      {
        id: 'lqdtest',
        name: 'LangQuest Distribution Test',
        abbreviation: 'LQDT',
        language: 'Test Language',
        description: 'Every Language audio-only entry',
        copyright: 'Public Domain audio (CC0 1.0)',
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 0,
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/audio/lqdtest/v.json',
          audioVersion: 'v2026-07-20-1',
          catalogBaseUrl: 'ftp://lqd-media.example.com',
        },
      },
    ],
  });

  // hasAudio:true + an unparseable el-manifest audio block drops the whole translation
  // (parseManifestTranslation requires audio when hasAudio is true), so it must not leak in.
  assert.equal(parsed.translations.length, 0);
});

test('parseTranslationCatalogManifest upgrades plain-http media urls to https in a release build', () => {
  const parsed = parseTranslationCatalogManifest({
    manifestVersion: '2026.09.24',
    issuedAt: '2026-09-24T00:00:00.000Z',
    translations: [
      {
        id: 'npiulb',
        name: 'Nepali ULB',
        abbreviation: 'NPIULB',
        language: 'Nepali',
        description: 'Text and audio',
        copyright: 'CC BY-SA 4.0',
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 4,
        text: {
          format: 'sqlite',
          version: '1',
          downloadUrl: 'http://cdn.example.com/text/npiulb.sqlite',
          sha256: 'a'.repeat(64),
        },
        audio: {
          strategy: 'stream-template',
          baseUrl: 'http://cdn.example.com/audio/npiulb',
          chapterPathTemplate: '{bookId}/{chapter}.mp3',
        },
      },
      {
        id: 'lqdtest',
        name: 'LangQuest Distribution Test',
        abbreviation: 'LQDT',
        language: 'Test Language',
        description: 'Every Language audio-only entry',
        copyright: 'Public Domain audio (CC0 1.0)',
        hasText: false,
        hasAudio: true,
        audioGranularity: 'chapter',
        totalBooks: 66,
        sizeInMB: 0,
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/audio/lqdtest/v.json',
          audioVersion: 'v2026-07-20-1',
          catalogBaseUrl: 'http://lqd-media.example.com',
        },
      },
    ],
  });

  const [npiulb, lqdtest] = parsed.translations;
  assert.equal(npiulb?.text?.downloadUrl, 'https://cdn.example.com/text/npiulb.sqlite');
  assert.equal(npiulb?.audio?.baseUrl, 'https://cdn.example.com/audio/npiulb');
  assert.equal(lqdtest?.audio?.catalogBaseUrl, 'https://lqd-media.example.com');
});

function createPackTranslation(
  overrides: Partial<
    BibleTranslation & {
      pendingTextPackLocalPath?: string | null;
      rollbackTextPackVersion?: string | null;
      rollbackTextPackLocalPath?: string | null;
    }
  > = {}
): BibleTranslation & {
  pendingTextPackLocalPath?: string | null;
  rollbackTextPackVersion?: string | null;
  rollbackTextPackLocalPath?: string | null;
} {
  return {
    id: 'niv',
    name: 'New International Version',
    abbreviation: 'NIV',
    language: 'English',
    description: 'Runtime translation from backend catalog',
    copyright: 'Example License',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 5.2,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'installed',
    activeTextPackVersion: '2026.03.21',
    textPackLocalPath: 'file:///packs/niv-2026-03-21.sqlite',
    ...overrides,
  };
}

test('stageTranslationPackCandidate keeps the active pack while recording a pending candidate', () => {
  const translation = createPackTranslation();

  const staged = stageTranslationPackCandidate(translation, {
    version: '2026.04.01',
    localPath: 'file:///downloads/niv-2026-04-01.sqlite',
  });

  assert.equal(staged.activeTextPackVersion, '2026.03.21');
  assert.equal(staged.textPackLocalPath, 'file:///packs/niv-2026-03-21.sqlite');
  assert.equal(staged.pendingTextPackVersion, '2026.04.01');
  assert.equal(staged.pendingTextPackLocalPath, 'file:///downloads/niv-2026-04-01.sqlite');
  assert.equal(staged.installState, 'installing');
});

test('activateTranslationPackCandidate swaps the active pack and preserves rollback metadata', () => {
  const translation = stageTranslationPackCandidate(createPackTranslation(), {
    version: '2026.04.01',
    localPath: 'file:///downloads/niv-2026-04-01.sqlite',
  });

  const activated = activateTranslationPackCandidate(translation);

  assert.equal(activated.activeTextPackVersion, '2026.04.01');
  assert.equal(activated.textPackLocalPath, 'file:///downloads/niv-2026-04-01.sqlite');
  assert.equal(activated.rollbackTextPackVersion, '2026.03.21');
  assert.equal(activated.rollbackTextPackLocalPath, 'file:///packs/niv-2026-03-21.sqlite');
  assert.equal(activated.pendingTextPackVersion, null);
  assert.equal(activated.pendingTextPackLocalPath, null);
  assert.equal(activated.installState, 'installed');
});

test('failTranslationPackCandidate preserves the last known good pack and exposes rollback availability', () => {
  const translation = stageTranslationPackCandidate(createPackTranslation(), {
    version: '2026.04.01',
    localPath: 'file:///downloads/niv-2026-04-01.sqlite',
  });

  const failed = failTranslationPackCandidate(translation, 'checksum mismatch');

  assert.equal(failed.activeTextPackVersion, '2026.03.21');
  assert.equal(failed.textPackLocalPath, 'file:///packs/niv-2026-03-21.sqlite');
  assert.equal(failed.pendingTextPackVersion, null);
  assert.equal(failed.pendingTextPackLocalPath, null);
  assert.equal(failed.lastInstallError, 'checksum mismatch');
  assert.equal(failed.installState, 'rollback-available');
});

test('rollbackTranslationPack restores the last known good version when rollback metadata exists', () => {
  const translation = createPackTranslation({
    activeTextPackVersion: '2026.04.01',
    textPackLocalPath: 'file:///packs/niv-2026-04-01.sqlite',
    rollbackTextPackVersion: '2026.03.21',
    rollbackTextPackLocalPath: 'file:///packs/niv-2026-03-21.sqlite',
    installState: 'rollback-available',
    lastInstallError: 'checksum mismatch',
  });

  const rolledBack = rollbackTranslationPack(translation);

  assert.equal(rolledBack.activeTextPackVersion, '2026.03.21');
  assert.equal(rolledBack.textPackLocalPath, 'file:///packs/niv-2026-03-21.sqlite');
  assert.equal(rolledBack.rollbackTextPackVersion, null);
  assert.equal(rolledBack.rollbackTextPackLocalPath, null);
  assert.equal(rolledBack.lastInstallError, null);
  assert.equal(rolledBack.installState, 'installed');
});

test('buildInstalledBibleDatabaseSource derives the SQLite directory and database name from a local pack path', () => {
  assert.deepEqual(
    buildInstalledBibleDatabaseSource('niv', 'file:///packs/niv-2026-04-01.sqlite'),
    {
      kind: 'installed',
      translationId: 'niv',
      databaseName: 'niv-2026-04-01.sqlite',
      directory: 'file:///packs',
    }
  );
});

test('buildInstalledBibleDatabaseSource carries the installed pack version when one is known', () => {
  assert.deepEqual(
    buildInstalledBibleDatabaseSource('niv', 'file:///packs/niv.db', '2026.09.01-v2'),
    {
      kind: 'installed',
      translationId: 'niv',
      databaseName: 'niv.db',
      directory: 'file:///packs',
      packVersion: '2026.09.01-v2',
    }
  );
  assert.equal(
    buildInstalledBibleDatabaseSource('niv', 'file:///packs/niv.db', null)?.packVersion,
    undefined
  );
});

test('buildBibleFallbackSearchTerms lists the case spellings of each word for a substring scan', () => {
  assert.deepEqual(buildBibleFallbackSearchTerms('lord'), [['lord', 'Lord', 'LORD']]);
  assert.deepEqual(buildBibleFallbackSearchTerms('Бог любовь'), [
    ['Бог', 'бог', 'БОГ'],
    ['любовь', 'Любовь', 'ЛЮБОВЬ'],
  ]);
  // Uncased scripts have one spelling; marks stay inside the word, as in the FTS query.
  assert.deepEqual(buildBibleFallbackSearchTerms('प्रेम'), [['प्रेम']]);
  assert.deepEqual(buildBibleFallbackSearchTerms('% _ "'), []);
  assert.equal(buildBibleFallbackSearchTerms('a b c d e f g h i j').length, 8);
});
