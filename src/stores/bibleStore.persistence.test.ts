/**
 * Byte-level identity of what the Bible store writes to MMKV.
 *
 * Every installed device carries a `bible-storage` blob written by an earlier release, and the
 * next release reads it back through the same persist config. The literals below were captured
 * from the store before its actions were split into slice modules; any drift in the persisted
 * keys, their order, the partialize selection or the version fails here before it can reach a
 * user's storage.
 */
import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation } from '../types';

const STORAGE_KEY = 'bible-storage';
const CATALOG_SNAPSHOT_KEY = 'bible-runtime-catalog-v1';

const mmkv = mockMmkvStorage(mock);
installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;

before(async () => {
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});

after(() => {
  mock.reset();
});

const PERSISTED_BLOB =
  '{"state":{"currentBook":"JHN","currentChapter":3,"hasReaderHistory":true,"preferredChapterLaunchMode":"read","currentTranslation":"esv1","currentTranslationChosenAt":"2026-09-01T12:00:00.000Z","preferredTranslationLanguage":"Spanish","translations":[{"id":"bsb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"web","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"kjv","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"asv","source":"bundled","isDownloaded":true,"downloadedBooks":["PSA"],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"bbe","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"npiulb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"esv1","source":"runtime","isDownloaded":true,"downloadedBooks":["GEN","EXO"],"downloadedAudioBooks":[],"installState":"installed","activeTextPackVersion":"3","textPackLocalPath":"file:///packs/esv1.db","rollbackTextPackVersion":"2","rollbackTextPackLocalPath":"file:///packs/esv1.rollback.db"},{"id":"aud1","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":["MAT"],"installState":"failed","pendingTextPackVersion":"4","pendingTextPackLocalPath":"file:///packs/aud1.pending.db","lastInstallError":"network down","activeDownloadJob":{"id":"job-7","kind":"audio-book","state":"running","progress":40,"startedAt":1000,"updatedAt":2000}}]},"version":1}';
// What the store writes after hydrating PERSISTED_BLOB: hydration settles the interrupted audio
// job to failed, re-seeds the bundled runtime rows the catalog above had dropped, and fills an
// unset pack version from the catalog. Pinned too, so the merge/sanitize path cannot drift.
const REHYDRATED_BLOB =
  '{"state":{"currentBook":"JHN","currentChapter":3,"hasReaderHistory":true,"preferredChapterLaunchMode":"read","currentTranslation":"esv1","currentTranslationChosenAt":"2026-09-01T12:00:00.000Z","preferredTranslationLanguage":"Spanish","translations":[{"id":"bsb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"web","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"kjv","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"asv","source":"bundled","isDownloaded":true,"downloadedBooks":["PSA"],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"bbe","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"sparv1909","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"hincv","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"npiulb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"esv1","source":"runtime","isDownloaded":true,"downloadedBooks":["GEN","EXO"],"downloadedAudioBooks":[],"installState":"installed","activeTextPackVersion":"3","textPackLocalPath":"file:///packs/esv1.db","rollbackTextPackVersion":"2","rollbackTextPackLocalPath":"file:///packs/esv1.rollback.db"},{"id":"aud1","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":["MAT"],"installState":"failed","activeTextPackVersion":"3","pendingTextPackVersion":"4","pendingTextPackLocalPath":"file:///packs/aud1.pending.db","lastInstallError":"network down","activeDownloadJob":{"id":"job-7","kind":"audio-book","state":"failed","progress":40,"startedAt":1000,"updatedAt":2000}}]},"version":1}';
const CATALOG_SNAPSHOT =
  '[{"id":"esv1","name":"Runtime Translation esv1","abbreviation":"ESV1","language":"Spanish","description":"A cloud translation","copyright":"Public Domain","totalBooks":66,"sizeInMB":4.5,"hasText":true,"hasAudio":false,"audioGranularity":"none","catalog":{"version":"3","updatedAt":"2026-01-01T00:00:00.000Z","text":{"format":"sqlite","version":"3","downloadUrl":"https://media.example/esv1.db","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}},{"id":"aud1","name":"Runtime Translation aud1","abbreviation":"AUD1","language":"Nepali","description":"A cloud translation","copyright":"Public Domain","totalBooks":66,"sizeInMB":4.5,"hasText":false,"hasAudio":true,"audioGranularity":"chapter","catalog":{"version":"3","updatedAt":"2026-01-01T00:00:00.000Z","text":{"format":"sqlite","version":"3","downloadUrl":"https://media.example/aud1.db","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}]';

function driveRepresentativeState(): void {
  const installed = makeRuntimeTranslation({
    id: 'esv1',
    language: 'Spanish',
    isDownloaded: true,
    installState: 'installed',
    activeTextPackVersion: '3',
    textPackLocalPath: 'file:///packs/esv1.db',
    rollbackTextPackVersion: '2',
    rollbackTextPackLocalPath: 'file:///packs/esv1.rollback.db',
    downloadedBooks: ['GEN', 'EXO'],
  });
  const audioOnly = makeRuntimeTranslation({
    id: 'aud1',
    language: 'Nepali',
    hasText: false,
    hasAudio: true,
    audioGranularity: 'chapter',
    downloadedAudioBooks: ['MAT'],
    installState: 'failed',
    lastInstallError: 'network down',
    pendingTextPackVersion: '4',
    pendingTextPackLocalPath: 'file:///packs/aud1.pending.db',
  });
  useBibleStore.getState().applyRuntimeCatalog([installed, audioOnly]);

  useBibleStore.setState((state) => ({
    currentBook: 'JHN',
    currentChapter: 3,
    hasReaderHistory: true,
    preferredChapterLaunchMode: 'read',
    currentTranslation: 'esv1',
    currentTranslationChosenAt: '2026-09-01T12:00:00.000Z',
    preferredTranslationLanguage: 'Spanish',
    // Session-only state: none of it may reach storage.
    verses: [{ id: 1, bookId: 'JHN', chapter: 3, verse: 16, text: 'fixture' }],
    isLoading: true,
    error: 'transient',
    downloadProgress: { translationId: 'aud1', progress: 40, status: 'downloading' },
    translations: state.translations.map((translation): BibleTranslation => {
      if (translation.id === 'asv') {
        return { ...translation, isDownloaded: true, downloadedBooks: ['PSA'] };
      }
      if (translation.id === 'aud1') {
        return {
          ...translation,
          activeDownloadJob: {
            id: 'job-7',
            kind: 'audio-book',
            state: 'running',
            progress: 40,
            startedAt: 1_000,
            updatedAt: 2_000,
          },
        };
      }
      return translation;
    }),
  }));
}

test('the persisted blob for a representative state is byte-identical to the pre-split store', () => {
  driveRepresentativeState();

  assert.equal(mmkv.store.get(STORAGE_KEY), PERSISTED_BLOB);
});

test('the runtime catalog snapshot written beside it is byte-identical too', () => {
  assert.equal(mmkv.store.get(CATALOG_SNAPSHOT_KEY), CATALOG_SNAPSHOT);
});

test('the persist config keeps its storage name and version', () => {
  const options = useBibleStore.persist.getOptions();

  assert.deepEqual(
    { name: options.name, version: options.version },
    { name: STORAGE_KEY, version: 1 }
  );
});

test('hydrating the captured blob writes back the same bytes as the pre-split store', async () => {
  mmkv.store.set(STORAGE_KEY, PERSISTED_BLOB);
  mmkv.store.set(CATALOG_SNAPSHOT_KEY, CATALOG_SNAPSHOT);
  await useBibleStore.persist.rehydrate();
  mmkv.store.delete(STORAGE_KEY);

  useBibleStore.setState({ verses: [] });

  assert.equal(mmkv.store.get(STORAGE_KEY), REHYDRATED_BLOB);
});

// A pre-split (version 0) blob inlines the runtime translation's catalog metadata.
const VERSION_0_BLOB = JSON.stringify({
  state: {
    currentBook: 'PSA',
    currentChapter: 23,
    currentTranslation: 'legacy1',
    preferredTranslationLanguage: 'French',
    translations: [
      makeRuntimeTranslation({
        id: 'legacy1',
        language: 'French',
        isDownloaded: true,
        installState: 'installed',
        activeTextPackVersion: '2',
        textPackLocalPath: 'file:///packs/legacy1.db',
      }),
    ],
  },
  version: 0,
});
const MIGRATED_BLOB =
  '{"state":{"currentBook":"PSA","currentChapter":23,"hasReaderHistory":true,"preferredChapterLaunchMode":"listen","currentTranslation":"legacy1","currentTranslationChosenAt":null,"preferredTranslationLanguage":"French","translations":[{"id":"bsb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"web","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"kjv","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"asv","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"bbe","source":"bundled","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"sparv1909","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"hincv","source":"runtime","isDownloaded":false,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"remote-only"},{"id":"npiulb","source":"bundled","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"seeded"},{"id":"legacy1","source":"runtime","isDownloaded":true,"downloadedBooks":[],"downloadedAudioBooks":[],"installState":"installed","activeTextPackVersion":"2","textPackLocalPath":"file:///packs/legacy1.db"}]},"version":1}';
const MIGRATED_CATALOG_SNAPSHOT =
  '[{"id":"legacy1","name":"Runtime Translation legacy1","abbreviation":"LEGACY1","language":"French","description":"A cloud translation","copyright":"Public Domain","totalBooks":66,"sizeInMB":4.5,"hasText":true,"hasAudio":false,"audioGranularity":"none","catalog":{"version":"3","updatedAt":"2026-01-01T00:00:00.000Z","text":{"format":"sqlite","version":"3","downloadUrl":"https://media.example/legacy1.db","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}]';

test('migrating a version 0 blob writes the same bytes as the pre-split store', async () => {
  mmkv.store.delete(CATALOG_SNAPSHOT_KEY);
  mmkv.store.set(STORAGE_KEY, VERSION_0_BLOB);
  await useBibleStore.persist.rehydrate();

  assert.deepEqual(
    {
      blob: mmkv.store.get(STORAGE_KEY),
      snapshot: mmkv.store.get(CATALOG_SNAPSHOT_KEY),
    },
    { blob: MIGRATED_BLOB, snapshot: MIGRATED_CATALOG_SNAPSHOT }
  );
});
