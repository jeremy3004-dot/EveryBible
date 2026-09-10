/**
 * Core behaviour of the Bible store: reading position, translation selection,
 * runtime catalog merging, text-pack install state and sign-out cleanup.
 *
 * Download orchestration lives in bibleStore.downloads.test.ts (text) and
 * bibleStore.audio.test.ts (audio); persisted-state hydration lives in
 * bibleStore.hydration.test.ts — each needs its own mock/storage configuration.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
  type BibleStoreDoubles,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation } from '../types';

const mmkv = mockMmkvStorage(mock);
const doubles: BibleStoreDoubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaultTranslations: () => BibleTranslation[];
let sanitizePersistedBibleState: typeof import('./persistedStateSanitizers').sanitizePersistedBibleState;
let refreshRuntimeCatalog: typeof import('../services/translations/runtimeCatalogRefresh').refreshRuntimeCatalog;
let mapElCatalogToBibleTranslations: typeof import('../services/elMedia/elTranslationMapping').mapElCatalogToBibleTranslations;
/** Recorded before any test runs, so import-time side effects stay assertable. */
let importTimeAudioSyncs: string[][] = [];
let importTimeResolverRegistrations = 0;

before(async () => {
  const sanitizers = await import('./persistedStateSanitizers');
  defaultTranslations = sanitizers.getDefaultBibleTranslations;
  sanitizePersistedBibleState = sanitizers.sanitizePersistedBibleState;
  ({ refreshRuntimeCatalog } = await import('../services/translations/runtimeCatalogRefresh'));
  ({ mapElCatalogToBibleTranslations } = await import('../services/elMedia/elTranslationMapping'));
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
  importTimeAudioSyncs = doubles.remote.syncedTranslationIds.map((ids) => [...ids]);
  importTimeResolverRegistrations = doubles.database.resolverRegistrations;
});

beforeEach(async () => {
  // Let any fire-and-forget work started by the previous test settle before the
  // recordings are cleared, so a late analytics event cannot land in the next test.
  await flushAsyncWork();
  doubles.reset();
  useBibleStore.setState(
    { ...useBibleStore.getInitialState(), translations: defaultTranslations() },
    true
  );
  mmkv.store.clear();
});

after(() => {
  mock.reset();
});

const withTranslations = (extra: BibleTranslation[]) => {
  useBibleStore.setState((state) => ({ translations: [...state.translations, ...extra] }));
};

const findTranslation = (id: string): BibleTranslation | undefined =>
  useBibleStore.getState().translations.find((translation) => translation.id === id);

test('a fresh install opens on Genesis 1 in the Berean text with no reader history', () => {
  const state = useBibleStore.getState();

  assert.deepEqual(
    {
      currentBook: state.currentBook,
      currentChapter: state.currentChapter,
      currentTranslation: state.currentTranslation,
      hasReaderHistory: state.hasReaderHistory,
      preferredChapterLaunchMode: state.preferredChapterLaunchMode,
      preferredTranslationLanguage: state.preferredTranslationLanguage,
      verses: state.verses,
      downloadProgress: state.downloadProgress,
      error: state.error,
      isLoading: state.isLoading,
    },
    {
      currentBook: 'GEN',
      currentChapter: 1,
      currentTranslation: 'bsb',
      hasReaderHistory: false,
      preferredChapterLaunchMode: 'listen',
      preferredTranslationLanguage: 'English',
      verses: [],
      downloadProgress: null,
      error: null,
      isLoading: false,
    }
  );
});

test('the bundled translation list is published to the audio resolver when the store loads', () => {
  assert.equal(importTimeAudioSyncs.length, 1);
  assert.deepEqual(importTimeAudioSyncs[0], [
    'bsb',
    'web',
    'kjv',
    'asv',
    'bbe',
    'sparv1909',
    'hincv',
    'npiulb',
  ]);
});

test('the store registers itself as the installed-database source resolver on load', () => {
  assert.equal(importTimeResolverRegistrations, 1);
  assert.equal(typeof doubles.database.resolver, 'function');
});

test('the database source resolver describes the installed pack of a downloaded translation', () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'esv1', textPackLocalPath: 'file:///packs/esv1.db' }),
  ]);

  assert.deepEqual(doubles.database.resolver?.('esv1'), {
    kind: 'installed',
    translationId: 'esv1',
    databaseName: 'esv1.db',
    directory: 'file:///packs',
  });
});

test('the database source resolver reports no installed pack for a translation without one', () => {
  assert.equal(doubles.database.resolver?.('bsb'), null);
  assert.equal(doubles.database.resolver?.('not-a-translation'), null);
});

test('setCurrentBook moves the reader and records that reading has started', () => {
  useBibleStore.getState().setCurrentBook('JHN');

  assert.equal(useBibleStore.getState().currentBook, 'JHN');
  assert.equal(useBibleStore.getState().hasReaderHistory, true);
});

test('setCurrentChapter moves the reader and records that reading has started', () => {
  useBibleStore.getState().setCurrentChapter(12);

  assert.equal(useBibleStore.getState().currentChapter, 12);
  assert.equal(useBibleStore.getState().hasReaderHistory, true);
});

test('setPreferredChapterLaunchMode remembers whether chapters open to read or listen', () => {
  useBibleStore.getState().setPreferredChapterLaunchMode('read');

  assert.equal(useBibleStore.getState().preferredChapterLaunchMode, 'read');
});

test('applySyncedReadingPosition adopts a reading position synced from another device', () => {
  useBibleStore.getState().applySyncedReadingPosition({ bookId: 'PSA', chapter: 23 });

  const state = useBibleStore.getState();
  assert.deepEqual(
    { book: state.currentBook, chapter: state.currentChapter, history: state.hasReaderHistory },
    { book: 'PSA', chapter: 23, history: true }
  );
});

test('applySyncedReadingPosition ignores a synced position the reader is already on', () => {
  useBibleStore.getState().applySyncedReadingPosition({ bookId: 'GEN', chapter: 1 });

  assert.equal(useBibleStore.getState().hasReaderHistory, false);
});

test('setVerses replaces the chapter text held for the reader', () => {
  const verses = [{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning' }];

  useBibleStore.getState().setVerses(verses);

  assert.deepEqual(useBibleStore.getState().verses, verses);
});

test('setLoading toggles the reader loading flag', () => {
  useBibleStore.getState().setLoading(true);

  assert.equal(useBibleStore.getState().isLoading, true);
});

test('setError stores a message for the reader to surface', () => {
  useBibleStore.getState().setError('No chapter text');

  assert.equal(useBibleStore.getState().error, 'No chapter text');
});

test('setCurrentTranslation switches to an installed bundled translation and saves the preference', () => {
  useBibleStore.setState({ error: 'stale error' });

  useBibleStore.getState().setCurrentTranslation('asv');

  const state = useBibleStore.getState();
  assert.equal(state.currentTranslation, 'asv');
  assert.equal(state.preferredTranslationLanguage, 'English');
  assert.equal(state.error, null);
  assert.deepEqual(doubles.translations.preferenceCalls, [{ primary: 'asv' }]);
});

test('setCurrentTranslation survives a preference sync that rejects', async () => {
  doubles.translations.preferenceError = new Error('offline');

  useBibleStore.getState().setCurrentTranslation('asv');
  await flushAsyncWork();

  assert.equal(useBibleStore.getState().currentTranslation, 'asv');
});

test('setCurrentTranslation ignores a translation id the store does not know', () => {
  useBibleStore.getState().setCurrentTranslation('not-a-translation');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.deepEqual(doubles.translations.preferenceCalls, []);
});

test('setCurrentTranslation refuses a bundled translation that carries neither text nor audio', () => {
  useBibleStore.getState().setCurrentTranslation('kjv');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('setCurrentTranslation refuses a runtime translation whose text pack is not on disk', () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', hasText: true })]);

  useBibleStore.getState().setCurrentTranslation('esv1');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.deepEqual(doubles.translations.preferenceCalls, []);
});

test('setCurrentTranslation accepts a runtime translation once its text pack is installed', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      hasText: true,
      language: 'Spanish',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  useBibleStore.getState().setCurrentTranslation('esv1');

  assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
  assert.equal(useBibleStore.getState().preferredTranslationLanguage, 'Spanish');
});

test('setCurrentTranslation accepts an audio-only translation that can stream', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'elx',
      hasText: false,
      hasAudio: true,
      language: 'Nepali',
      audioGranularity: 'chapter',
    }),
  ]);
  doubles.remote.availableAudioIds.add('elx');

  useBibleStore.getState().setCurrentTranslation('elx');

  assert.equal(useBibleStore.getState().currentTranslation, 'elx');
  assert.deepEqual(doubles.translations.preferenceCalls, [{ primary: 'elx' }]);
});

test('setCurrentTranslation accepts an audio-only translation with downloaded chapters offline', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'elx',
      hasText: false,
      hasAudio: true,
      audioGranularity: 'chapter',
      downloadedAudioBooks: ['MRK'],
    }),
  ]);

  useBibleStore.getState().setCurrentTranslation('elx');

  assert.equal(useBibleStore.getState().currentTranslation, 'elx');
});

test('setCurrentTranslation refuses an audio-only translation with nothing to play', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'elx',
      hasText: false,
      hasAudio: true,
      audioGranularity: 'chapter',
    }),
  ]);

  useBibleStore.getState().setCurrentTranslation('elx');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.deepEqual(doubles.translations.preferenceCalls, []);
});

test('setCurrentTranslation clears the language preference when the translation has a blank language', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      language: '   ',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  useBibleStore.getState().setCurrentTranslation('esv1');

  assert.equal(useBibleStore.getState().preferredTranslationLanguage, null);
});

test('setPreferredTranslationLanguage trims the stored language', () => {
  useBibleStore.getState().setPreferredTranslationLanguage('  Nepali  ');

  assert.equal(useBibleStore.getState().preferredTranslationLanguage, 'Nepali');
});

test('setPreferredTranslationLanguage clears the preference for a blank language', () => {
  useBibleStore.getState().setPreferredTranslationLanguage('   ');

  assert.equal(useBibleStore.getState().preferredTranslationLanguage, null);
});

test('setPreferredTranslationLanguage clears the preference when given null', () => {
  useBibleStore.getState().setPreferredTranslationLanguage(null);

  assert.equal(useBibleStore.getState().preferredTranslationLanguage, null);
});

test('applyRuntimeCatalog adds cloud translations alongside the bundled ones', () => {
  useBibleStore.getState().applyRuntimeCatalog([makeRuntimeTranslation({ id: 'esv1' })]);

  const ids = useBibleStore.getState().translations.map((translation) => translation.id);
  assert.equal(ids.includes('esv1'), true);
  assert.equal(ids.includes('bsb'), true);
});

test('applyRuntimeCatalog keeps the local install state of a translation already downloaded', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
      activeTextPackVersion: '2',
      downloadedBooks: ['GEN'],
      downloadedAudioBooks: ['MRK'],
      lastInstallError: 'previous failure',
    }),
  ]);

  useBibleStore
    .getState()
    .applyRuntimeCatalog([makeRuntimeTranslation({ id: 'esv1', name: 'Renamed' })]);

  const merged = findTranslation('esv1');
  assert.deepEqual(
    {
      name: merged?.name,
      isDownloaded: merged?.isDownloaded,
      installState: merged?.installState,
      textPackLocalPath: merged?.textPackLocalPath,
      activeTextPackVersion: merged?.activeTextPackVersion,
      downloadedBooks: merged?.downloadedBooks,
      downloadedAudioBooks: merged?.downloadedAudioBooks,
      lastInstallError: merged?.lastInstallError,
    },
    {
      name: 'Renamed',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
      activeTextPackVersion: '2',
      downloadedBooks: ['GEN'],
      downloadedAudioBooks: ['MRK'],
      lastInstallError: 'previous failure',
    }
  );
});

test('applyRuntimeCatalog ignores catalog entries that are not runtime translations', () => {
  const bundledImposter = { ...makeRuntimeTranslation({ id: 'fake' }), source: 'bundled' as const };

  useBibleStore.getState().applyRuntimeCatalog([bundledImposter]);

  assert.equal(findTranslation('fake'), undefined);
});

test('applyRuntimeCatalog drops cloud translations that left the catalog and were never installed', () => {
  useBibleStore.getState().applyRuntimeCatalog([]);

  const ids = useBibleStore.getState().translations.map((translation) => translation.id);
  assert.deepEqual(ids, ['bsb', 'web', 'kjv', 'asv', 'bbe', 'npiulb']);
});

test('applyRuntimeCatalog falls back to the Berean text when the selected translation disappears', () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'esv1', textPackLocalPath: 'file:///packs/esv1.db' }),
  ]);
  useBibleStore.getState().setCurrentTranslation('esv1');
  useBibleStore.setState((state) => ({
    translations: state.translations.map((translation) =>
      translation.id === 'esv1'
        ? { ...translation, isDownloaded: false, textPackLocalPath: null }
        : translation
    ),
  }));

  useBibleStore.getState().applyRuntimeCatalog([]);

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('applyRuntimeCatalog republishes the merged list to the audio and timing resolvers', async () => {
  useBibleStore.getState().applyRuntimeCatalog([makeRuntimeTranslation({ id: 'esv1' })]);
  await flushAsyncWork();

  const expected = useBibleStore.getState().translations.map((translation) => translation.id);
  assert.deepEqual(doubles.remote.syncedTranslationIds.at(-1), expected);
  assert.deepEqual(doubles.timestamps.syncedTranslationIds.at(-1), expected);
});

test('stageTranslationPack records the candidate pack awaiting activation', () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', lastInstallError: 'older failure' })]);

  useBibleStore
    .getState()
    .stageTranslationPack('esv1', { version: '4', localPath: 'file:///packs/esv1.next.db' });

  const staged = findTranslation('esv1');
  assert.deepEqual(
    {
      installState: staged?.installState,
      pendingTextPackVersion: staged?.pendingTextPackVersion,
      pendingTextPackLocalPath: staged?.pendingTextPackLocalPath,
      lastInstallError: staged?.lastInstallError,
    },
    {
      installState: 'installing',
      pendingTextPackVersion: '4',
      pendingTextPackLocalPath: 'file:///packs/esv1.next.db',
      lastInstallError: null,
    }
  );
});

test('activateTranslationPack promotes the staged pack and keeps the old one for rollback', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      activeTextPackVersion: '3',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  useBibleStore
    .getState()
    .stageTranslationPack('esv1', { version: '4', localPath: 'file:///packs/esv1.next.db' });

  useBibleStore.getState().activateTranslationPack('esv1');

  const activated = findTranslation('esv1');
  assert.deepEqual(
    {
      installState: activated?.installState,
      isDownloaded: activated?.isDownloaded,
      activeTextPackVersion: activated?.activeTextPackVersion,
      textPackLocalPath: activated?.textPackLocalPath,
      rollbackTextPackVersion: activated?.rollbackTextPackVersion,
      rollbackTextPackLocalPath: activated?.rollbackTextPackLocalPath,
      pendingTextPackVersion: activated?.pendingTextPackVersion,
    },
    {
      installState: 'installed',
      isDownloaded: true,
      activeTextPackVersion: '4',
      textPackLocalPath: 'file:///packs/esv1.next.db',
      rollbackTextPackVersion: '3',
      rollbackTextPackLocalPath: 'file:///packs/esv1.db',
      pendingTextPackVersion: null,
    }
  );
});

test('activateTranslationPack does nothing when no pack has been staged', () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  const before = findTranslation('esv1');

  useBibleStore.getState().activateTranslationPack('esv1');

  assert.deepEqual(findTranslation('esv1'), before);
});

test('failTranslationPack offers a rollback when a previous pack is still installed', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      activeTextPackVersion: '3',
      textPackLocalPath: 'file:///packs/esv1.db',
      pendingTextPackVersion: '4',
      pendingTextPackLocalPath: 'file:///packs/esv1.next.db',
    }),
  ]);

  useBibleStore.getState().failTranslationPack('esv1', 'checksum mismatch');

  const failed = findTranslation('esv1');
  assert.deepEqual(
    {
      installState: failed?.installState,
      lastInstallError: failed?.lastInstallError,
      pendingTextPackVersion: failed?.pendingTextPackVersion,
      pendingTextPackLocalPath: failed?.pendingTextPackLocalPath,
    },
    {
      installState: 'rollback-available',
      lastInstallError: 'checksum mismatch',
      pendingTextPackVersion: null,
      pendingTextPackLocalPath: null,
    }
  );
});

test('failTranslationPack marks a first install as failed when there is nothing to roll back to', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      pendingTextPackVersion: '4',
      pendingTextPackLocalPath: 'file:///packs/esv1.next.db',
    }),
  ]);

  useBibleStore.getState().failTranslationPack('esv1', 'download failed');

  assert.equal(findTranslation('esv1')?.installState, 'failed');
});

test('rollbackTranslationPackInstall restores the previously installed pack', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      installState: 'rollback-available',
      activeTextPackVersion: '4',
      textPackLocalPath: 'file:///packs/esv1.next.db',
      rollbackTextPackVersion: '3',
      rollbackTextPackLocalPath: 'file:///packs/esv1.db',
      lastInstallError: 'checksum mismatch',
    }),
  ]);

  useBibleStore.getState().rollbackTranslationPackInstall('esv1');

  const rolledBack = findTranslation('esv1');
  assert.deepEqual(
    {
      installState: rolledBack?.installState,
      activeTextPackVersion: rolledBack?.activeTextPackVersion,
      textPackLocalPath: rolledBack?.textPackLocalPath,
      rollbackTextPackVersion: rolledBack?.rollbackTextPackVersion,
      lastInstallError: rolledBack?.lastInstallError,
    },
    {
      installState: 'installed',
      activeTextPackVersion: '3',
      textPackLocalPath: 'file:///packs/esv1.db',
      rollbackTextPackVersion: null,
      lastInstallError: null,
    }
  );
});

test('rollbackTranslationPackInstall does nothing without a recorded rollback target', () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', installState: 'failed' })]);
  const before = findTranslation('esv1');

  useBibleStore.getState().rollbackTranslationPackInstall('esv1');

  assert.deepEqual(findTranslation('esv1'), before);
});

test('getAvailableTranslations returns the full translation list', () => {
  assert.deepEqual(
    useBibleStore.getState().getAvailableTranslations(),
    useBibleStore.getState().translations
  );
});

test('getCurrentTranslationInfo describes the selected translation', () => {
  assert.equal(useBibleStore.getState().getCurrentTranslationInfo()?.id, 'bsb');
});

test('getCurrentTranslationInfo returns nothing when the selection is not in the list', () => {
  useBibleStore.setState({ currentTranslation: 'ghost' });

  assert.equal(useBibleStore.getState().getCurrentTranslationInfo(), undefined);
});

test('isBookDownloaded is true for every book of a fully downloaded translation', () => {
  assert.equal(useBibleStore.getState().isBookDownloaded('bsb', 'JHN'), true);
});

test('isBookDownloaded is true for an individually downloaded book', () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', downloadedBooks: ['JHN'] })]);

  assert.equal(useBibleStore.getState().isBookDownloaded('esv1', 'JHN'), true);
  assert.equal(useBibleStore.getState().isBookDownloaded('esv1', 'GEN'), false);
});

test('isBookDownloaded is false for a translation the store does not know', () => {
  assert.equal(useBibleStore.getState().isBookDownloaded('ghost', 'JHN'), false);
});

test('isAudioBookDownloaded reflects the downloaded audio books of a translation', () => {
  withTranslations([makeRuntimeTranslation({ id: 'elx', downloadedAudioBooks: ['MRK'] })]);

  assert.equal(useBibleStore.getState().isAudioBookDownloaded('elx', 'MRK'), true);
  assert.equal(useBibleStore.getState().isAudioBookDownloaded('elx', 'JHN'), false);
  assert.equal(useBibleStore.getState().isAudioBookDownloaded('ghost', 'MRK'), false);
});

test('resetForSignOut clears the reading position and in-flight download UI', () => {
  useBibleStore.setState({
    currentBook: 'REV',
    currentChapter: 22,
    hasReaderHistory: true,
    preferredChapterLaunchMode: 'read',
    verses: [{ id: 1, bookId: 'REV', chapter: 22, verse: 1, text: 'A river' }],
    isLoading: true,
    error: 'boom',
    downloadProgress: { translationId: 'esv1', progress: 40, status: 'downloading' },
  });

  useBibleStore.getState().resetForSignOut();

  const state = useBibleStore.getState();
  assert.deepEqual(
    {
      currentBook: state.currentBook,
      currentChapter: state.currentChapter,
      hasReaderHistory: state.hasReaderHistory,
      preferredChapterLaunchMode: state.preferredChapterLaunchMode,
      verses: state.verses,
      isLoading: state.isLoading,
      error: state.error,
      downloadProgress: state.downloadProgress,
    },
    {
      currentBook: 'GEN',
      currentChapter: 1,
      hasReaderHistory: false,
      preferredChapterLaunchMode: 'listen',
      verses: [],
      isLoading: false,
      error: null,
      downloadProgress: null,
    }
  );
});

test('resetForSignOut keeps device-level translation availability intact', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  useBibleStore.getState().setCurrentTranslation('esv1');

  useBibleStore.getState().resetForSignOut();

  assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
  assert.equal(findTranslation('esv1')?.isDownloaded, true);
});

test('persisting a bundled translation writes only its install state, not the catalog copy', () => {
  useBibleStore.getState().setCurrentChapter(3);

  const persisted = JSON.parse(mmkv.store.get('bible-storage') ?? '{}');
  const bsb = persisted.state.translations.find(
    (translation: { id: string }) => translation.id === 'bsb'
  );
  // Null pack fields are elided: JSON.stringify drops undefined, and hydration
  // restores an absent key as null anyway.
  assert.deepEqual(bsb, {
    id: 'bsb',
    source: 'bundled',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    installState: 'seeded',
  });
});

test('persisting a runtime translation writes the delta only, never its static metadata', () => {
  const runtime = makeRuntimeTranslation({
    id: 'esv1',
    isDownloaded: true,
    installState: 'installed',
    textPackLocalPath: 'file:///packs/esv1.db',
    activeTextPackVersion: '3',
  });
  withTranslations([runtime]);

  useBibleStore.getState().setCurrentChapter(4);

  const persisted = JSON.parse(mmkv.store.get('bible-storage') ?? '{}');
  const stored = persisted.state.translations.find(
    (translation: { id: string }) => translation.id === 'esv1'
  );
  assert.deepEqual(stored, {
    id: 'esv1',
    source: 'runtime',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    installState: 'installed',
    activeTextPackVersion: '3',
    textPackLocalPath: 'file:///packs/esv1.db',
  });
});

test('the persisted blob is stamped with the delta-format version', () => {
  useBibleStore.getState().setCurrentChapter(5);

  assert.equal(JSON.parse(mmkv.store.get('bible-storage') ?? '{}').version, 1);
});

test('navigating a chapter never rewrites the runtime catalog metadata cache', () => {
  useBibleStore.getState().applyRuntimeCatalog([makeRuntimeTranslation({ id: 'esv1' })]);
  const snapshotAfterCatalog = mmkv.store.get('bible-runtime-catalog-v1');

  useBibleStore.getState().setCurrentChapter(6);

  assert.equal(mmkv.store.get('bible-runtime-catalog-v1'), snapshotAfterCatalog);
});

test('a runtime catalog refresh caches the static metadata under its own key', () => {
  useBibleStore.getState().applyRuntimeCatalog([makeRuntimeTranslation({ id: 'esv1' })]);

  const snapshot = JSON.parse(mmkv.store.get('bible-runtime-catalog-v1') ?? '[]');
  const cached = snapshot.find((entry: { id: string }) => entry.id === 'esv1');
  const expected = makeRuntimeTranslation({ id: 'esv1' });
  assert.equal(cached?.name, expected.name);
  assert.equal(cached?.language, expected.language);
  assert.equal(
    'isDownloaded' in (cached ?? {}),
    false,
    'the metadata cache holds no user state; that lives in the delta'
  );
});

test('persisting the store keeps the reading position and translation preferences', () => {
  useBibleStore.getState().setCurrentBook('ROM');
  useBibleStore.getState().setCurrentChapter(8);
  useBibleStore.getState().setPreferredChapterLaunchMode('read');
  useBibleStore.getState().setPreferredTranslationLanguage('Nepali');

  const persisted = JSON.parse(mmkv.store.get('bible-storage') ?? '{}');
  assert.deepEqual(
    {
      currentBook: persisted.state.currentBook,
      currentChapter: persisted.state.currentChapter,
      hasReaderHistory: persisted.state.hasReaderHistory,
      preferredChapterLaunchMode: persisted.state.preferredChapterLaunchMode,
      preferredTranslationLanguage: persisted.state.preferredTranslationLanguage,
      currentTranslation: persisted.state.currentTranslation,
    },
    {
      currentBook: 'ROM',
      currentChapter: 8,
      hasReaderHistory: true,
      preferredChapterLaunchMode: 'read',
      preferredTranslationLanguage: 'Nepali',
      currentTranslation: 'bsb',
    }
  );
});

test('persisting the store never writes the loaded chapter text', () => {
  useBibleStore
    .getState()
    .setVerses([{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning' }]);

  const persisted = JSON.parse(mmkv.store.get('bible-storage') ?? '{}');
  assert.equal('verses' in persisted.state, false);
  assert.equal('downloadProgress' in persisted.state, false);
});

test('reconcileTranslationPacks does nothing when no runtime pack claims to be installed', async () => {
  await useBibleStore.getState().reconcileTranslationPacks();

  assert.deepEqual(doubles.fileSystem.infoRequests, []);
});

test('reconcileTranslationPacks keeps a runtime pack whose file is present on disk', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.fileSystem.setFile('file:///packs/esv1.db', { exists: true, size: 2048 });

  await useBibleStore.getState().reconcileTranslationPacks();

  assert.deepEqual(doubles.fileSystem.infoRequests, ['file:///packs/esv1.db']);
  assert.equal(findTranslation('esv1')?.installState, 'installed');
});

test('reconcileTranslationPacks resets a runtime translation whose pack file vanished', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      activeTextPackVersion: '3',
      textPackLocalPath: 'file:///packs/esv1.db',
      downloadedBooks: ['GEN'],
    }),
  ]);
  doubles.fileSystem.setFile('file:///packs/esv1.db', { exists: false, size: 0 });
  useBibleStore.setState({ currentTranslation: 'esv1' });

  await useBibleStore.getState().reconcileTranslationPacks();

  const reset = findTranslation('esv1');
  assert.deepEqual(
    {
      isDownloaded: reset?.isDownloaded,
      installState: reset?.installState,
      textPackLocalPath: reset?.textPackLocalPath,
      activeTextPackVersion: reset?.activeTextPackVersion,
      downloadedBooks: reset?.downloadedBooks,
      lastInstallError: reset?.lastInstallError,
      currentTranslation: useBibleStore.getState().currentTranslation,
    },
    {
      isDownloaded: false,
      installState: 'remote-only',
      textPackLocalPath: null,
      activeTextPackVersion: null,
      downloadedBooks: [],
      lastInstallError: 'Local text pack missing from disk. Re-download required.',
      currentTranslation: 'bsb',
    }
  );
});

test('reconcileTranslationPacks treats a zero-byte pack file as a missing download', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.fileSystem.setFile('file:///packs/esv1.db', { exists: true, size: 0 });

  await useBibleStore.getState().reconcileTranslationPacks();

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
});

test('reconcileTranslationPacks treats a file-system error as a missing download', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.fileSystem.infoError = new Error('storage unavailable');

  await useBibleStore.getState().reconcileTranslationPacks();

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
});

test('recoverMissingInstalledPack drops the cached database and resets the broken translation', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  useBibleStore.setState({ currentTranslation: 'esv1' });

  await useBibleStore.getState().recoverMissingInstalledPack('esv1');

  assert.deepEqual(doubles.database.invalidatedPaths, ['file:///packs/esv1.db']);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('recoverMissingInstalledPack republishes the repaired list to the audio and timing resolvers', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  await useBibleStore.getState().recoverMissingInstalledPack('esv1');
  await flushAsyncWork();

  const expected = useBibleStore.getState().translations.map((translation) => translation.id);
  assert.deepEqual(doubles.remote.syncedTranslationIds.at(-1), expected);
  assert.deepEqual(doubles.timestamps.syncedTranslationIds.at(-1), expected);
});

test('recoverMissingInstalledPack still resets the translation when invalidation throws', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.database.invalidateError = new Error('database busy');

  await useBibleStore.getState().recoverMissingInstalledPack('esv1');

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.equal(warn.mock.callCount(), 1);
});

test('recoverMissingInstalledPack ignores a bundled translation', async () => {
  await useBibleStore.getState().recoverMissingInstalledPack('bsb');

  assert.deepEqual(doubles.database.invalidatedPaths, []);
  assert.equal(findTranslation('bsb')?.isDownloaded, true);
});

test('recoverMissingInstalledPack ignores a translation the store does not know', async () => {
  await useBibleStore.getState().recoverMissingInstalledPack('ghost');

  assert.deepEqual(doubles.database.invalidatedPaths, []);
});

test('recoverMissingInstalledPack skips database invalidation when no pack path is recorded', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', installState: 'failed' })]);

  await useBibleStore.getState().recoverMissingInstalledPack('esv1');

  assert.deepEqual(doubles.database.invalidatedPaths, []);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
});

// ---------------------------------------------------------------------------
// Every Language audio-only catalog rows across a refresh and a restart
// ---------------------------------------------------------------------------

/** An audio-only EL row exactly as the EL catalog mapper produces it. */
const makeMappedElTranslation = (): BibleTranslation =>
  mapElCatalogToBibleTranslations({
    schemaVersion: 'lqd-catalog/v1',
    sequence: 1,
    generatedAt: '2026-09-05T00:00:00.000Z',
    baseUrl: 'https://media.example.com',
    translations: [
      {
        translationId: 'el-persistence',
        languageIso6393: 'eng',
        languageName: 'English',
        translationName: 'Persistence Audio',
        abbreviation: 'PA',
        source: 'langquest',
        copyright: 'CC0-1.0',
        deliveryMode: 'chapter',
        hasAudio: true,
        currentAudioVersion: 'v1',
        manifestUrl: '/manifest.json',
        manifestSha256: 'a'.repeat(64),
      },
    ],
  })[0];

// An EL row carries no text and no books, which is exactly the shape earlier builds
// mistook for a corrupt runtime row and dropped, losing the reader's selection and
// every downloaded chapter. `legacy` covers rows persisted before the catalog
// carried a timestamp.
for (const legacy of [false, true]) {
  test(`an EL audio-only translation keeps its selection and downloads across a catalog refresh and restart (legacy=${legacy})`, async () => {
    const mapped = makeMappedElTranslation();
    const persisted = {
      ...mapped,
      downloadedAudioBooks: ['GEN', 'JHN'],
      catalog: { ...mapped.catalog!, updatedAt: legacy ? '' : mapped.catalog!.updatedAt },
    };
    const restored = sanitizePersistedBibleState(
      JSON.parse(JSON.stringify({ currentTranslation: persisted.id, translations: [persisted] }))
    );
    useBibleStore.setState({ ...useBibleStore.getInitialState(), ...restored }, true);

    await refreshRuntimeCatalog({
      listTranslations: async () => ({ success: false, error: 'offline' }),
      getStoreTranslations: () => useBibleStore.getState().translations,
      applyRuntimeCatalog: (translations) =>
        useBibleStore.getState().applyRuntimeCatalog(translations),
      resolveUrl: () => 'https://media.example.com/catalog.json',
      elStep: async () => [
        {
          ...makeMappedElTranslation(),
          name: 'Updated audio catalog',
          catalog: { ...mapped.catalog!, updatedAt: '2026-09-06T00:00:00.000Z' },
        },
      ],
    });

    const afterRestart = sanitizePersistedBibleState(
      JSON.parse(JSON.stringify(useBibleStore.getState()))
    );
    const el = afterRestart.translations.find(({ id }) => id === persisted.id);
    assert.equal(afterRestart.currentTranslation, persisted.id);
    assert.ok(el);
    assert.deepEqual(
      {
        name: el.name,
        updatedAt: el.catalog?.updatedAt,
        downloadedAudioBooks: el.downloadedAudioBooks,
        hasText: el.hasText,
        totalBooks: el.totalBooks,
      },
      {
        name: 'Updated audio catalog',
        updatedAt: '2026-09-06T00:00:00.000Z',
        downloadedAudioBooks: ['GEN', 'JHN'],
        hasText: false,
        totalBooks: 0,
      }
    );
  });
}
