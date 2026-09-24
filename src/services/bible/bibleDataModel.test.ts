import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import {
  activateTranslationPackCandidate,
  BUNDLED_BIBLE_SCHEMA_VERSION,
  buildBibleFallbackSearchTerms,
  buildBibleSearchQuery,
  buildBibleSubstringSearchTerms,
  buildInstalledBibleDatabaseSource,
  failTranslationPackCandidate,
  isBundledBibleDatabaseReady,
  isSingleCharacterWordQuery,
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

const validTextCatalog = {
  format: 'sqlite',
  version: '2026.09.01',
  downloadUrl: 'https://media.example.com/packs/niv.sqlite',
  sha256: 'abc123',
};

function manifestTranslation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'niv',
    name: 'New International Version',
    abbreviation: 'NIV',
    language: 'English',
    description: 'Runtime translation',
    copyright: 'Example License',
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    totalBooks: 66,
    sizeInMB: 5.2,
    text: validTextCatalog,
    ...overrides,
  };
}

function parseTranslations(...translations: unknown[]) {
  return parseTranslationCatalogManifest({
    manifestVersion: '2026.09.01',
    issuedAt: '2026-09-01T00:00:00.000Z',
    translations,
  }).translations;
}

function parseSingleAudio(audio: unknown) {
  const [translation] = parseTranslations(
    manifestTranslation({
      hasText: false,
      hasAudio: true,
      audioGranularity: 'chapter',
      text: undefined,
      audio,
    })
  );
  return translation?.audio ?? null;
}

test('parseTranslationCatalogManifest rejects a payload that is not a plain object', () => {
  for (const payload of [null, 'manifest', [], 42]) {
    assert.throws(
      () => parseTranslationCatalogManifest(payload),
      /Signed manifest payload must be an object/
    );
  }
});

test('parseTranslationCatalogManifest rejects a payload missing its version, issue date or translation list', () => {
  const valid = {
    manifestVersion: '2026.09.01',
    issuedAt: '2026-09-01T00:00:00.000Z',
    translations: [],
  };
  const broken = [
    { ...valid, manifestVersion: '   ' },
    { ...valid, issuedAt: 'not a date' },
    { ...valid, issuedAt: '  ' },
    { ...valid, issuedAt: 1_756_684_800_000 },
    { ...valid, translations: { niv: manifestTranslation() } },
  ];
  for (const payload of broken) {
    assert.throws(
      () => parseTranslationCatalogManifest(payload),
      /Signed manifest payload is missing required fields/
    );
  }
  assert.deepEqual(parseTranslationCatalogManifest(valid), valid);
});

test('parseTranslationCatalogManifest trims identity fields and keeps a text pack with its verse count and signature', () => {
  const [translation] = parseTranslations(
    manifestTranslation({
      id: '  niv  ',
      name: ' New International Version ',
      text: {
        ...validTextCatalog,
        version: ' 2026.09.01 ',
        downloadUrl: '  /packs/niv.sqlite  ',
        verseCount: 31_102,
        signature: '  sig-value  ',
      },
    })
  );

  assert.deepEqual(translation, {
    id: 'niv',
    name: 'New International Version',
    abbreviation: 'NIV',
    language: 'English',
    description: 'Runtime translation',
    copyright: 'Example License',
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    totalBooks: 66,
    sizeInMB: 5.2,
    text: {
      format: 'sqlite',
      version: '2026.09.01',
      downloadUrl: '/packs/niv.sqlite',
      sha256: 'abc123',
      verseCount: 31_102,
      signature: 'sig-value',
    },
    audio: undefined,
  });
});

test('parseTranslationCatalogManifest omits a verse count that is not a positive safe integer', () => {
  for (const verseCount of [0, -5, 1.5, Number.MAX_SAFE_INTEGER + 2, '31102']) {
    const [translation] = parseTranslations(
      manifestTranslation({ text: { ...validTextCatalog, verseCount } })
    );
    assert.deepEqual(translation?.text, validTextCatalog, `verseCount ${String(verseCount)}`);
  }
});

test('parseTranslationCatalogManifest drops a text translation whose pack is unusable', () => {
  const unusableTextCatalogs = [
    undefined,
    'https://media.example.com/packs/niv.sqlite',
    { ...validTextCatalog, format: 'zip' },
    { ...validTextCatalog, version: '' },
    { ...validTextCatalog, downloadUrl: 42 },
    { ...validTextCatalog, sha256: '   ' },
  ];
  for (const text of unusableTextCatalogs) {
    assert.deepEqual(parseTranslations(manifestTranslation({ text })), []);
  }
});

test('parseTranslationCatalogManifest skips malformed entries while keeping valid ones', () => {
  const translations = parseTranslations(
    null,
    'niv',
    manifestTranslation({ id: 'no-name', name: '' }),
    manifestTranslation({ id: 'no-abbr', abbreviation: undefined }),
    manifestTranslation({ id: 'no-language', language: ' ' }),
    manifestTranslation({ id: 'no-description', description: null }),
    manifestTranslation({ id: 'no-copyright', copyright: 7 }),
    manifestTranslation({ id: 'text-flag', hasText: 'yes' }),
    manifestTranslation({ id: 'audio-flag', hasAudio: 1 }),
    manifestTranslation({ id: 'granularity', audioGranularity: 'book' }),
    manifestTranslation({ id: 'fractional-books', totalBooks: 66.5 }),
    manifestTranslation({ id: 'no-books', totalBooks: 0 }),
    manifestTranslation({ id: 'string-books', totalBooks: '66' }),
    manifestTranslation({ id: 'negative-size', sizeInMB: -1 }),
    manifestTranslation({ id: 'infinite-size', sizeInMB: Number.POSITIVE_INFINITY }),
    manifestTranslation({ id: 'missing-audio', hasAudio: true, audio: undefined }),
    manifestTranslation({ id: 'kept' })
  );

  assert.deepEqual(
    translations.map((translation) => translation.id),
    ['kept']
  );
});

test('parseTranslationCatalogManifest ignores an unusable audio block when the translation has no audio', () => {
  const [translation] = parseTranslations(
    manifestTranslation({ audio: { strategy: 'provider', provider: 'unknown' } })
  );

  assert.equal(translation?.id, 'niv');
  assert.equal(translation?.audio, undefined);
});

test('parseTranslationCatalogManifest keeps a provider audio block with its optional fields and valid books', () => {
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'provider',
      provider: 'bible-is',
      fileExtension: ' mp3 ',
      mimeType: 'audio/mpeg',
      signature: 'provider-sig',
      books: {
        GEN: { totalChapters: 50, totalBytes: 1_024 },
        EXO: { totalChapters: 40 },
        LEV: { totalBytes: 0 },
        NUM: { totalChapters: 0, totalBytes: -1 },
        DEU: { totalChapters: Number.NaN, totalBytes: Number.POSITIVE_INFINITY },
        JOS: 'not a book',
      },
    }),
    {
      strategy: 'provider',
      provider: 'bible-is',
      fileExtension: 'mp3',
      mimeType: 'audio/mpeg',
      signature: 'provider-sig',
      books: {
        GEN: { totalChapters: 50, totalBytes: 1_024 },
        EXO: { totalChapters: 40 },
        LEV: { totalBytes: 0 },
      },
    }
  );
});

test('parseTranslationCatalogManifest keeps a bare provider audio block and omits a book map with no usable books', () => {
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'provider',
      provider: 'ebible-webbe',
      books: { GEN: { totalChapters: -1 } },
    }),
    { strategy: 'provider', provider: 'ebible-webbe' }
  );
  assert.deepEqual(
    parseSingleAudio({ strategy: 'provider', provider: 'ebible-webbe', books: ['GEN'] }),
    { strategy: 'provider', provider: 'ebible-webbe' }
  );
});

test('parseTranslationCatalogManifest drops audio from an unknown provider or strategy', () => {
  assert.equal(parseSingleAudio({ strategy: 'provider', provider: 'spotify' }), null);
  assert.equal(parseSingleAudio({ strategy: 'torrent', downloadUrl: 'x', sha256: 'y' }), null);
  assert.equal(parseSingleAudio('provider'), null);
});

test('parseTranslationCatalogManifest keeps a stream-template audio block with its optional fields', () => {
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'stream-template',
      baseUrl: 'https://audio.example.com/web',
      chapterPathTemplate: ' {book}/{chapter}.mp3 ',
      fileExtension: 'mp3',
      mimeType: 'audio/mpeg',
      signature: 'stream-sig',
      books: { JHN: { totalChapters: 21 } },
    }),
    {
      strategy: 'stream-template',
      baseUrl: 'https://audio.example.com/web',
      chapterPathTemplate: '{book}/{chapter}.mp3',
      fileExtension: 'mp3',
      mimeType: 'audio/mpeg',
      signature: 'stream-sig',
      books: { JHN: { totalChapters: 21 } },
    }
  );
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'stream-template',
      baseUrl: 'https://audio.example.com/web',
      chapterPathTemplate: '{book}/{chapter}.mp3',
    }),
    {
      strategy: 'stream-template',
      baseUrl: 'https://audio.example.com/web',
      chapterPathTemplate: '{book}/{chapter}.mp3',
    }
  );
});

test('parseTranslationCatalogManifest drops a stream-template audio block without a base URL or path template', () => {
  assert.equal(
    parseSingleAudio({ strategy: 'stream-template', chapterPathTemplate: '{book}.mp3' }),
    null
  );
  assert.equal(
    parseSingleAudio({ strategy: 'stream-template', baseUrl: 'https://audio.example.com' }),
    null
  );
});

test('parseTranslationCatalogManifest keeps the mime type and signature of an el-manifest audio block', () => {
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/lqdtest/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://lqd-media.example.com',
      mimeType: 'audio/mpeg',
      signature: 'el-sig',
    }),
    {
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/lqdtest/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://lqd-media.example.com',
      mimeType: 'audio/mpeg',
      signature: 'el-sig',
    }
  );
});

test('parseTranslationCatalogManifest drops an el-manifest audio block missing its manifest, version or base URL', () => {
  const complete = {
    strategy: 'el-manifest',
    manifestUrl: '/manifests/audio/lqdtest/v1.json',
    audioVersion: 'v1',
    catalogBaseUrl: 'https://lqd-media.example.com',
  };
  assert.notEqual(parseSingleAudio(complete), null);
  for (const field of ['manifestUrl', 'audioVersion', 'catalogBaseUrl']) {
    assert.equal(parseSingleAudio({ ...complete, [field]: '  ' }), null, field);
  }
});

test('parseTranslationCatalogManifest keeps an audio-pack block with its optional fields and books', () => {
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'audio-pack',
      downloadUrl: 'https://media.example.com/audio/niv.zip',
      sha256: ' def456 ',
      fileExtension: 'm4a',
      mimeType: 'audio/mp4',
      signature: 'pack-sig',
      books: { PSA: { totalChapters: 150, totalBytes: 9_000 } },
    }),
    {
      strategy: 'audio-pack',
      downloadUrl: 'https://media.example.com/audio/niv.zip',
      sha256: 'def456',
      fileExtension: 'm4a',
      mimeType: 'audio/mp4',
      signature: 'pack-sig',
      books: { PSA: { totalChapters: 150, totalBytes: 9_000 } },
    }
  );
  assert.deepEqual(
    parseSingleAudio({
      strategy: 'audio-pack',
      downloadUrl: 'https://media.example.com/audio/niv.zip',
      sha256: 'def456',
    }),
    {
      strategy: 'audio-pack',
      downloadUrl: 'https://media.example.com/audio/niv.zip',
      sha256: 'def456',
    }
  );
});

test('parseTranslationCatalogManifest drops an audio-pack block without a download URL or checksum', () => {
  assert.equal(parseSingleAudio({ strategy: 'audio-pack', sha256: 'def456' }), null);
  assert.equal(
    parseSingleAudio({ strategy: 'audio-pack', downloadUrl: 'https://media.example.com/a.zip' }),
    null
  );
});

test('activateTranslationPackCandidate leaves a translation untouched when no complete candidate is staged', () => {
  const noCandidate = createPackTranslation();
  const noPath = createPackTranslation({ pendingTextPackVersion: '2026.04.01' });

  assert.equal(activateTranslationPackCandidate(noCandidate), noCandidate);
  assert.equal(activateTranslationPackCandidate(noPath), noPath);
});

test('activateTranslationPackCandidate records no rollback target on a first install', () => {
  const staged = stageTranslationPackCandidate(
    createPackTranslation({
      isDownloaded: false,
      activeTextPackVersion: undefined,
      textPackLocalPath: undefined,
    }),
    { version: '2026.04.01', localPath: 'file:///downloads/niv-2026-04-01.sqlite' }
  );

  const activated = activateTranslationPackCandidate(staged);

  assert.equal(activated.isDownloaded, true);
  assert.equal(activated.installState, 'installed');
  assert.equal(activated.rollbackTextPackVersion, null);
  assert.equal(activated.rollbackTextPackLocalPath, null);
});

test('failTranslationPackCandidate marks a first install as failed when there is nothing to roll back to', () => {
  const staged = stageTranslationPackCandidate(
    createPackTranslation({ activeTextPackVersion: null, textPackLocalPath: null }),
    { version: '2026.04.01', localPath: 'file:///downloads/niv-2026-04-01.sqlite' }
  );

  const failed = failTranslationPackCandidate(staged, 'download interrupted');

  assert.equal(failed.installState, 'failed');
  assert.equal(failed.lastInstallError, 'download interrupted');
  assert.equal(failed.pendingTextPackVersion, null);
});

test('rollbackTranslationPack leaves a translation untouched without complete rollback metadata', () => {
  const noPath = createPackTranslation({ rollbackTextPackVersion: '2026.03.21' });
  const noVersion = createPackTranslation({
    rollbackTextPackLocalPath: 'file:///packs/old.sqlite',
  });

  assert.equal(rollbackTranslationPack(noPath), noPath);
  assert.equal(rollbackTranslationPack(noVersion), noVersion);
});

test('buildInstalledBibleDatabaseSource ignores trailing slashes on the pack path', () => {
  assert.deepEqual(buildInstalledBibleDatabaseSource('niv', 'file:///packs/niv.sqlite//'), {
    kind: 'installed',
    translationId: 'niv',
    databaseName: 'niv.sqlite',
    directory: 'file:///packs',
  });
});

test('buildInstalledBibleDatabaseSource rejects a path without a directory', () => {
  assert.equal(buildInstalledBibleDatabaseSource('niv', 'niv.sqlite'), null);
  assert.equal(buildInstalledBibleDatabaseSource('niv', '/niv.sqlite'), null);
  assert.equal(buildInstalledBibleDatabaseSource('niv', '/'), null);
});

test('isBundledBibleDatabaseReady requires the verse count, schema, search index and formatting data', () => {
  const ready = {
    verseCount: 31_102,
    schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION,
    hasSearchIndex: true,
    formattedVerseCount: 30_000,
  };

  assert.equal(isBundledBibleDatabaseReady(ready, 31_102), true);
  assert.equal(isBundledBibleDatabaseReady(ready, 31_103), false);
  assert.equal(
    isBundledBibleDatabaseReady({ ...ready, schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION - 1 }, 1),
    false
  );
  assert.equal(isBundledBibleDatabaseReady({ ...ready, hasSearchIndex: false }, 1), false);
  assert.equal(isBundledBibleDatabaseReady({ ...ready, formattedVerseCount: 0 }, 1), false);
});

test('buildBibleSearchQuery quotes each word as an FTS5 prefix phrase', () => {
  assert.equal(buildBibleSearchQuery('  love one another! '), '"love"* "one"* "another"*');
  assert.equal(buildBibleSearchQuery("Father's house"), '"Father\'s"* "house"*');
  assert.equal(buildBibleSearchQuery('प्रेम'), '"प्रेम"*');
});

test('buildBibleSearchQuery sends each word once and bounds a pasted passage', () => {
  // The index folds case, so a repeated word only costs another pass over its postings.
  assert.equal(buildBibleSearchQuery('the Lord the LORD lord'), '"the"* "Lord"*');
  // A pasted chapter became thousands of prefix phrases: 3.5 s of SQLite work on a desktop for
  // 3,000 words (seconds more on a phone, with chapter reads queued behind it) to match nothing.
  const pasted = Array.from({ length: 1000 }, (_, index) => `word${index}`).join(' ');
  const phrases = buildBibleSearchQuery(pasted)?.split(' ') ?? [];
  assert.equal(phrases.length, 16);
  assert.equal(phrases[0], '"word0"*');
});

test('buildBibleSearchQuery returns null when the query has no searchable words', () => {
  assert.equal(buildBibleSearchQuery(''), null);
  assert.equal(buildBibleSearchQuery(' "?!,. '), null);
});

test('isSingleCharacterWordQuery recognises scripts where one character is a word', () => {
  assert.equal(isSingleCharacterWordQuery('爱'), true);
  assert.equal(isSingleCharacterWordQuery('빛'), true);
  assert.equal(isSingleCharacterWordQuery('a'), false);
  assert.equal(isSingleCharacterWordQuery('ก'), false);
});

test('buildBibleSubstringSearchTerms leaves spaced scripts to the FTS index', () => {
  assert.equal(buildBibleSubstringSearchTerms('love'), null);
  assert.equal(buildBibleSubstringSearchTerms('प्रेम'), null);
});

test('buildBibleSubstringSearchTerms splits an unspaced-script query into unique NFC terms', () => {
  assert.deepEqual(buildBibleSubstringSearchTerms('神爱世人 神爱世人 世人'), ['神爱世人', '世人']);
  const decomposedHangul = '세상'.normalize('NFD');
  assert.deepEqual(buildBibleSubstringSearchTerms(decomposedHangul), ['세상']);
});

test('buildBibleSubstringSearchTerms caps the number of substring terms', () => {
  const query = Array.from({ length: 12 }, (_, index) => `神${index}`).join(' ');

  assert.deepEqual(
    buildBibleSubstringSearchTerms(query),
    Array.from({ length: 8 }, (_, index) => `神${index}`)
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
