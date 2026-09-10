import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../types';
import {
  BIBLE_PERSISTED_STATE_VERSION,
  RUNTIME_CATALOG_SNAPSHOT_KEY,
  buildRuntimeCatalogSnapshot,
  migrateBiblePersistedState,
  readRuntimeCatalogSnapshot,
  toPersistedTranslation,
  writeRuntimeCatalogSnapshot,
} from './bibleTranslationPersistence';
import { sanitizePersistedBibleState } from './persistedStateSanitizers';
import type { RuntimeCatalogSnapshotStorage } from './bibleTranslationPersistence';

function createMemoryStorage(seed: Record<string, string> = {}): RuntimeCatalogSnapshotStorage & {
  readonly values: Map<string, string>;
  writes: number;
} {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    values,
    writes: 0,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.writes += 1;
      values.set(key, value);
    },
  };
}

function createRuntimeTranslation(overrides: Partial<BibleTranslation> = {}): BibleTranslation {
  return {
    id: 'tglulb',
    name: 'Tagalog Unlocked Literal Bible',
    abbreviation: 'ULB',
    language: 'Tagalog',
    description: 'Unlocked Literal Bible',
    copyright: 'CC BY-SA 4.0',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4.5,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'remote-only',
    activeTextPackVersion: null,
    pendingTextPackVersion: null,
    pendingTextPackLocalPath: null,
    textPackLocalPath: null,
    rollbackTextPackVersion: null,
    rollbackTextPackLocalPath: null,
    lastInstallError: null,
    activeDownloadJob: null,
    catalog: {
      version: '2026.03.21',
      updatedAt: '2026-03-21T10:00:00.000Z',
      text: {
        format: 'sqlite',
        version: '2026.03.21',
        downloadUrl: 'https://media.everybible.app/packs/tglulb.sqlite',
        sha256: 'sha256-text',
      },
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://media.everybible.app/audio/tglulb',
        chapterPathTemplate: '{bookId}/{chapter}.mp3',
      },
    },
    ...overrides,
  };
}

// Round-tripping through the real persist boundary: partialize -> JSON -> (snapshot join) -> merge.
function roundTrip(
  translations: BibleTranslation[],
  storage: RuntimeCatalogSnapshotStorage
): BibleTranslation[] {
  writeRuntimeCatalogSnapshot(translations, storage);
  const persisted = JSON.parse(
    JSON.stringify({
      currentTranslation: 'bsb',
      translations: translations.map(toPersistedTranslation),
    })
  ) as Record<string, unknown>;

  return sanitizePersistedBibleState(persisted, readRuntimeCatalogSnapshot(storage)).translations;
}

test('persisted deltas plus the runtime catalog snapshot round-trip a runtime translation intact', () => {
  const storage = createMemoryStorage();
  const installed = createRuntimeTranslation({
    isDownloaded: true,
    downloadedBooks: ['GEN', 'JHN'],
    downloadedAudioBooks: ['JHN'],
    installState: 'installed',
    activeTextPackVersion: '2026.03.21',
    textPackLocalPath: '/data/packs/tglulb.sqlite',
  });

  const restored = roundTrip([installed], storage);
  const runtime = restored.find((translation) => translation.id === 'tglulb');

  assert.ok(runtime, 'the downloaded runtime translation must survive a cold boot');
  assert.deepEqual(
    {
      id: runtime.id,
      name: runtime.name,
      abbreviation: runtime.abbreviation,
      language: runtime.language,
      description: runtime.description,
      copyright: runtime.copyright,
      isDownloaded: runtime.isDownloaded,
      downloadedBooks: runtime.downloadedBooks,
      downloadedAudioBooks: runtime.downloadedAudioBooks,
      totalBooks: runtime.totalBooks,
      sizeInMB: runtime.sizeInMB,
      hasText: runtime.hasText,
      hasAudio: runtime.hasAudio,
      audioGranularity: runtime.audioGranularity,
      source: runtime.source,
      installState: runtime.installState,
      activeTextPackVersion: runtime.activeTextPackVersion,
      textPackLocalPath: runtime.textPackLocalPath,
      catalog: runtime.catalog,
    },
    {
      id: installed.id,
      name: installed.name,
      abbreviation: installed.abbreviation,
      language: installed.language,
      description: installed.description,
      copyright: installed.copyright,
      isDownloaded: installed.isDownloaded,
      downloadedBooks: installed.downloadedBooks,
      downloadedAudioBooks: installed.downloadedAudioBooks,
      totalBooks: installed.totalBooks,
      sizeInMB: installed.sizeInMB,
      hasText: installed.hasText,
      hasAudio: installed.hasAudio,
      audioGranularity: installed.audioGranularity,
      source: installed.source,
      installState: installed.installState,
      activeTextPackVersion: installed.activeTextPackVersion,
      textPackLocalPath: installed.textPackLocalPath,
      catalog: installed.catalog,
    }
  );
});

test('round-tripping keeps bundled translations seeded from the live constants', () => {
  const storage = createMemoryStorage();
  const restored = roundTrip([createRuntimeTranslation()], storage);
  const bsb = restored.find((translation) => translation.id === 'bsb');

  assert.ok(bsb, 'bundled translations are always re-seeded from constants');
  assert.equal(bsb.source, 'bundled');
  assert.equal(bsb.isDownloaded, true);
});

test('the persisted delta for a runtime translation carries no static catalog metadata', () => {
  const persisted = toPersistedTranslation(createRuntimeTranslation()) as Record<string, unknown>;

  assert.equal(persisted.source, 'runtime', 'runtime deltas must stay distinguishable on restore');
  for (const staticKey of [
    'catalog',
    'description',
    'copyright',
    'name',
    'abbreviation',
    'language',
    'totalBooks',
    'sizeInMB',
    'hasText',
    'hasAudio',
    'audioGranularity',
  ]) {
    assert.equal(
      staticKey in persisted,
      false,
      `${staticKey} is static catalog data and must not be re-serialized on every set()`
    );
  }
});

test('slimming runtime translations shrinks the per-set() payload by more than 80%', () => {
  const runtimeTranslations = Array.from({ length: 200 }, (_, index) =>
    createRuntimeTranslation({
      id: `runtime-${index}`,
      name: `Runtime Translation ${index}`,
      abbreviation: `RT${index}`,
    })
  );

  const previousShapeBytes = JSON.stringify(runtimeTranslations).length;
  const nextShapeBytes = JSON.stringify(runtimeTranslations.map(toPersistedTranslation)).length;

  assert.ok(
    nextShapeBytes / previousShapeBytes < 0.2,
    `expected >80% smaller persisted translations, got ${nextShapeBytes}/${previousShapeBytes}`
  );
});

test('migrating a version-0 blob keeps an installed runtime translation and seeds the snapshot', () => {
  const storage = createMemoryStorage();
  const legacyRuntime = {
    ...createRuntimeTranslation({
      isDownloaded: true,
      downloadedBooks: ['GEN'],
      installState: 'installed',
      activeTextPackVersion: '2026.03.21',
      textPackLocalPath: '/data/packs/tglulb.sqlite',
    }),
  };
  const legacyState = {
    currentBook: 'JHN',
    currentChapter: 3,
    currentTranslation: 'tglulb',
    translations: [{ id: 'bsb', isDownloaded: true, downloadedBooks: [] }, legacyRuntime],
  };

  const migrated = migrateBiblePersistedState(legacyState, 0, storage) as Record<string, unknown>;

  assert.ok(
    storage.values.has(RUNTIME_CATALOG_SNAPSHOT_KEY),
    'migration must move runtime catalog metadata into its own key before dropping it from the store'
  );

  const migratedTranslations = migrated.translations as Record<string, unknown>[];
  const migratedRuntime = migratedTranslations.find((entry) => entry.id === 'tglulb');
  assert.ok(migratedRuntime);
  assert.equal('catalog' in migratedRuntime, false);
  assert.equal(migratedRuntime.textPackLocalPath, '/data/packs/tglulb.sqlite');

  const restored = sanitizePersistedBibleState(
    JSON.parse(JSON.stringify(migrated)),
    readRuntimeCatalogSnapshot(storage)
  );
  const runtime = restored.translations.find((translation) => translation.id === 'tglulb');

  assert.ok(runtime, 'a migrated install must not lose its downloaded Bible');
  assert.equal(runtime.textPackLocalPath, '/data/packs/tglulb.sqlite');
  assert.equal(runtime.installState, 'installed');
  assert.equal(runtime.name, 'Tagalog Unlocked Literal Bible');
  assert.deepEqual(runtime.catalog, legacyRuntime.catalog);
  assert.equal(restored.currentTranslation, 'tglulb');
});

test('migrating a legacy blank-timestamp Every Language row keeps its audio catalog', () => {
  const storage = createMemoryStorage();
  const legacyElRow = {
    id: 'el-abcd',
    name: 'Example Language Audio Bible',
    abbreviation: 'ELA',
    language: 'Example',
    description: 'Every Language audio',
    copyright: 'Every Language',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: ['JHN'],
    totalBooks: 0,
    sizeInMB: 0,
    hasText: false,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'remote-only',
    catalog: {
      version: 'v3',
      // The shape older EL builds persisted: no timestamp at all.
      updatedAt: '',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: 'manifests/el-abcd.json',
        audioVersion: 'v3',
        catalogBaseUrl: 'https://catalog.example.org',
      },
    },
  };

  const migrated = migrateBiblePersistedState({ translations: [legacyElRow] }, 0, storage);
  const restored = sanitizePersistedBibleState(
    JSON.parse(JSON.stringify(migrated)),
    readRuntimeCatalogSnapshot(storage)
  );
  const runtime = restored.translations.find((translation) => translation.id === 'el-abcd');

  assert.ok(runtime, 'the legacy EL row must survive migration');
  assert.equal(runtime.catalog?.audio?.strategy, 'el-manifest');
  assert.deepEqual(runtime.downloadedAudioBooks, ['JHN']);
});

test('migration leaves the legacy shape in place when the snapshot cannot be written', () => {
  const failingStorage: RuntimeCatalogSnapshotStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
  const legacyRuntime = createRuntimeTranslation({
    installState: 'installed',
    textPackLocalPath: '/data/packs/tglulb.sqlite',
  });
  const legacyState = { translations: [legacyRuntime] };

  const migrated = migrateBiblePersistedState(legacyState, 0, failingStorage) as {
    translations: Record<string, unknown>[];
  };

  assert.ok(
    'catalog' in migrated.translations[0],
    'a failed snapshot write must not strip metadata that has nowhere else to live'
  );
});

test('a runtime delta survives a missing catalog snapshot when its text pack is installed', () => {
  const storage = createMemoryStorage();
  const installed = createRuntimeTranslation({
    isDownloaded: true,
    downloadedBooks: ['GEN'],
    installState: 'installed',
    textPackLocalPath: '/data/packs/tglulb.sqlite',
  });

  const persisted = JSON.parse(
    JSON.stringify({
      currentTranslation: 'tglulb',
      translations: [installed].map(toPersistedTranslation),
    })
  ) as Record<string, unknown>;

  // No snapshot written at all — the metadata cache is missing or corrupt.
  const restored = sanitizePersistedBibleState(persisted, readRuntimeCatalogSnapshot(storage));
  const runtime = restored.translations.find((translation) => translation.id === 'tglulb');

  assert.ok(runtime, 'a downloaded Bible must never disappear because its metadata cache is gone');
  assert.equal(runtime.textPackLocalPath, '/data/packs/tglulb.sqlite');
  assert.equal(runtime.isDownloaded, true);
  assert.equal(runtime.installState, 'installed');
  assert.equal(runtime.hasText, true);
  assert.equal(runtime.source, 'runtime');
  assert.equal(restored.currentTranslation, 'tglulb');
});

test('a remote-only runtime delta is dropped when the catalog snapshot is missing', () => {
  const storage = createMemoryStorage();
  const persisted = JSON.parse(
    JSON.stringify({ translations: [createRuntimeTranslation()].map(toPersistedTranslation) })
  ) as Record<string, unknown>;

  const restored = sanitizePersistedBibleState(persisted, readRuntimeCatalogSnapshot(storage));

  assert.equal(
    restored.translations.some((translation) => translation.id === 'tglulb'),
    false,
    'a not-yet-downloaded row with no metadata has nothing to render and is refetched anyway'
  );
});

test('sanitizePersistedBibleState still accepts the legacy full-object runtime shape', () => {
  const legacy = createRuntimeTranslation({
    isDownloaded: true,
    installState: 'installed',
    textPackLocalPath: '/data/packs/tglulb.sqlite',
  });

  const restored = sanitizePersistedBibleState({ translations: [legacy] });
  const runtime = restored.translations.find((translation) => translation.id === 'tglulb');

  assert.ok(runtime, 'a blob written before the format change must still hydrate');
  assert.equal(runtime.name, 'Tagalog Unlocked Literal Bible');
  assert.equal(runtime.catalog?.version, legacy.catalog?.version);
  assert.equal(runtime.catalog?.text?.downloadUrl, legacy.catalog?.text?.downloadUrl);
  assert.equal(runtime.textPackLocalPath, '/data/packs/tglulb.sqlite');
});

test('the runtime catalog snapshot is only rewritten when the catalog actually changes', () => {
  const storage = createMemoryStorage();
  const translations = [createRuntimeTranslation()];

  assert.equal(writeRuntimeCatalogSnapshot(translations, storage), true);
  const writesAfterFirst = storage.writes;
  assert.equal(writeRuntimeCatalogSnapshot(translations, storage), false);
  assert.equal(storage.writes, writesAfterFirst, 'an unchanged catalog must not touch storage');

  const changed = [createRuntimeTranslation({ name: 'Renamed Translation' })];
  assert.equal(writeRuntimeCatalogSnapshot(changed, storage), true);
  assert.equal(storage.writes, writesAfterFirst + 1);
});

test('an empty catalog apply never erases cached offline metadata', () => {
  const storage = createMemoryStorage();
  const translations = [createRuntimeTranslation()];

  assert.equal(writeRuntimeCatalogSnapshot(translations, storage), true);
  const cached = storage.values.get(RUNTIME_CATALOG_SNAPSHOT_KEY);

  assert.equal(writeRuntimeCatalogSnapshot([], storage), false);
  assert.equal(
    storage.values.get(RUNTIME_CATALOG_SNAPSHOT_KEY),
    cached,
    'a refresh that yielded no runtime rows must not demote downloaded Bibles to placeholders'
  );
});

test('the runtime catalog snapshot excludes bundled translations and user-mutable delta fields', () => {
  const snapshot = buildRuntimeCatalogSnapshot([
    createRuntimeTranslation({ isDownloaded: true, textPackLocalPath: '/data/packs/a.sqlite' }),
    createRuntimeTranslation({ id: 'bsb', source: 'bundled' }),
  ]);

  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].id, 'tglulb');
  assert.equal('textPackLocalPath' in snapshot[0], false);
  assert.equal('isDownloaded' in snapshot[0], false);
  assert.equal('installState' in snapshot[0], false);
});

test('a corrupt runtime catalog snapshot degrades to no snapshot instead of throwing', () => {
  const storage = createMemoryStorage({ [RUNTIME_CATALOG_SNAPSHOT_KEY]: '{not json' });

  assert.equal(readRuntimeCatalogSnapshot(storage).size, 0);

  const partiallyCorrupt = createMemoryStorage({
    [RUNTIME_CATALOG_SNAPSHOT_KEY]: JSON.stringify([{ id: 'broken' }, null, 42]),
  });
  assert.equal(readRuntimeCatalogSnapshot(partiallyCorrupt).size, 0);
});

test('migration is a no-op once the persisted blob is already at the current version', () => {
  assert.equal(BIBLE_PERSISTED_STATE_VERSION, 1);

  const storage = createMemoryStorage();
  const alreadyCurrent = { translations: [{ id: 'tglulb', source: 'runtime' }] };

  assert.equal(
    migrateBiblePersistedState(alreadyCurrent, BIBLE_PERSISTED_STATE_VERSION, storage),
    alreadyCurrent
  );
  assert.equal(storage.writes, 0);
});
