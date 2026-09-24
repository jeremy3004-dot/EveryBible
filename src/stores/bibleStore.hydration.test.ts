/**
 * Hydration of the Bible store from persisted MMKV state.
 *
 * The seeded payload below is read at import time, which is the real production
 * path (persist hydrates synchronously from MMKV). Later payload shapes are
 * driven through `useBibleStore.persist.rehydrate()`, which runs the same
 * merge/sanitize path without needing a second mock configuration.
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

const STORAGE_KEY = 'bible-storage';

const seededRuntime = makeRuntimeTranslation({
  id: 'esv1',
  isDownloaded: true,
  installState: 'installed',
  activeTextPackVersion: '3',
  textPackLocalPath: 'file:///packs/esv1.db',
  downloadedBooks: ['GEN'],
});

const seeded = {
  state: {
    currentBook: 'JHN',
    currentChapter: 3,
    preferredChapterLaunchMode: 'read',
    preferredTranslationLanguage: '  Nepali  ',
    currentTranslation: '  ASV  ',
    translations: [
      {
        id: 'asv',
        name: 'Tampered Name',
        description: 'Tampered description',
        isDownloaded: true,
        downloadedBooks: ['GEN'],
        downloadedAudioBooks: [],
        installState: 'seeded',
      },
      seededRuntime,
      { id: 'not-a-translation', source: 'runtime', name: 'Broken' },
    ],
  },
  version: 0,
};

const mmkv = mockMmkvStorage(mock, { [STORAGE_KEY]: JSON.stringify(seeded) });
const doubles: BibleStoreDoubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
/** Captured before the first `beforeEach` clears the recordings. */
let importTimeAudioSyncs: string[][] = [];

const rehydrateWith = async (state: Record<string, unknown>, version = 0) => {
  mmkv.store.set(STORAGE_KEY, JSON.stringify({ state, version }));
  await useBibleStore.persist.rehydrate();
};

const findTranslation = (id: string): BibleTranslation | undefined =>
  useBibleStore.getState().translations.find((translation) => translation.id === id);

before(async () => {
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
  importTimeAudioSyncs = doubles.remote.syncedTranslationIds.map((ids) => [...ids]);
});

beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
});

after(() => {
  mock.reset();
});

test('a persisted reading position is restored on launch', () => {
  const state = useBibleStore.getState();

  assert.deepEqual(
    {
      currentBook: state.currentBook,
      currentChapter: state.currentChapter,
      hasReaderHistory: state.hasReaderHistory,
      preferredChapterLaunchMode: state.preferredChapterLaunchMode,
    },
    {
      currentBook: 'JHN',
      currentChapter: 3,
      hasReaderHistory: true,
      preferredChapterLaunchMode: 'read',
    }
  );
});

test('a persisted translation id is normalised before it is trusted', () => {
  assert.equal(useBibleStore.getState().currentTranslation, 'asv');
});

test('a persisted language preference is trimmed on launch', () => {
  assert.equal(useBibleStore.getState().preferredTranslationLanguage, 'Nepali');
});

test('a bundled translation takes its catalog copy from the app, not from storage', () => {
  const asv = findTranslation('asv');

  assert.equal(asv?.name, 'American Standard Version');
  assert.equal(asv?.description, 'A revision of the KJV published in 1901, pre-installed text');
  assert.deepEqual(asv?.downloadedBooks, ['GEN']);
});

test('a persisted runtime translation is restored with its catalog and installed pack', () => {
  const runtime = findTranslation('esv1');

  assert.deepEqual(
    {
      source: runtime?.source,
      isDownloaded: runtime?.isDownloaded,
      installState: runtime?.installState,
      textPackLocalPath: runtime?.textPackLocalPath,
      activeTextPackVersion: runtime?.activeTextPackVersion,
      downloadedBooks: runtime?.downloadedBooks,
      downloadUrl: runtime?.catalog?.text?.downloadUrl,
    },
    {
      source: 'runtime',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
      activeTextPackVersion: '3',
      downloadedBooks: ['GEN'],
      downloadUrl: 'https://media.example/esv1.db',
    }
  );
});

test('an unusable persisted runtime row is dropped on launch', () => {
  assert.equal(findTranslation('not-a-translation'), undefined);
});

test('every bundled translation is present after hydrating a partial payload', () => {
  assert.deepEqual(
    useBibleStore.getState().translations.map((translation) => translation.id),
    ['bsb', 'web', 'kjv', 'asv', 'bbe', 'sparv1909', 'hincv', 'npiulb', 'esv1']
  );
});

test('the hydrated list, including restored cloud translations, reaches the audio resolver', () => {
  assert.deepEqual(importTimeAudioSyncs, [
    ['bsb', 'web', 'kjv', 'asv', 'bbe', 'sparv1909', 'hincv', 'npiulb', 'esv1'],
  ]);
});

test('a persisted selection of an unreadable translation falls back to the Berean text', async () => {
  await rehydrateWith({ currentTranslation: 'kjv', currentBook: 'GEN', currentChapter: 1 });

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('a persisted selection of an unknown translation falls back to the Berean text', async () => {
  await rehydrateWith({ currentTranslation: 'ghost' });

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('a runtime translation persisted as installed without a pack file is walked back', async () => {
  await rehydrateWith({
    currentTranslation: 'esv1',
    translations: [
      makeRuntimeTranslation({
        id: 'esv1',
        isDownloaded: true,
        installState: 'installed',
        textPackLocalPath: null,
      }),
    ],
  });

  const runtime = findTranslation('esv1');
  assert.equal(runtime?.installState, 'remote-only');
  assert.equal(runtime?.isDownloaded, false);
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('the legacy Hindi row seeded as bundled text is walked back to remote-only', async () => {
  await rehydrateWith({
    translations: [{ id: 'hincv', isDownloaded: true, installState: 'seeded', hasText: true }],
  });

  const hindi = findTranslation('hincv');
  assert.equal(hindi?.isDownloaded, false);
  assert.equal(hindi?.installState, 'remote-only');
});

test('a download job persisted as running is hydrated as failed so no phantom progress shows', async () => {
  await rehydrateWith({
    translations: [
      {
        id: 'bsb',
        isDownloaded: true,
        downloadedBooks: [],
        downloadedAudioBooks: [],
        installState: 'seeded',
        activeDownloadJob: {
          id: 'job-1',
          kind: 'audio-book',
          state: 'running',
          progress: 30,
          startedAt: 1,
          updatedAt: 2,
        },
      },
    ],
  });

  assert.equal(findTranslation('bsb')?.activeDownloadJob?.state, 'failed');
});

test('an out-of-range persisted reading position falls back to Genesis 1', async () => {
  await rehydrateWith({ currentBook: 'NOPE', currentChapter: 0 });

  const state = useBibleStore.getState();
  assert.equal(state.currentBook, 'GEN');
  assert.equal(state.currentChapter, 1);
  assert.equal(state.hasReaderHistory, false);
});

test('a persisted chapter its book does not have falls back to chapter 1', async () => {
  // The chapter used to be checked only for >= 1, and was kept even when the book itself
  // was dropped: Jude 2 restored as Jude 2, and an unknown book with chapter 50 as Genesis 50.
  for (const [persisted, expected] of [
    [
      { currentBook: 'JUD', currentChapter: 2 },
      { book: 'JUD', chapter: 1, hasReaderHistory: false },
    ],
    [
      { currentBook: 'NOPE', currentChapter: 50 },
      { book: 'GEN', chapter: 1, hasReaderHistory: false },
    ],
  ] as const) {
    await rehydrateWith(persisted);

    const state = useBibleStore.getState();
    assert.deepEqual(
      {
        book: state.currentBook,
        chapter: state.currentChapter,
        hasReaderHistory: state.hasReaderHistory,
      },
      expected,
      JSON.stringify(persisted)
    );
  }
});

test('an install the app was killed during is not restored as still in progress', async () => {
  // downloadTranslation persists installState 'downloading' before the transfer starts. A
  // process kill leaves it there; no transfer can be running in a fresh process, so every
  // transient phase settles to what is actually on disk.
  await rehydrateWith({
    translations: [
      { id: 'bsb', isDownloaded: true, installState: 'verifying' },
      { id: 'kjv', isDownloaded: false, installState: 'downloading' },
      makeRuntimeTranslation({
        id: 'esv1',
        isDownloaded: true,
        installState: 'installing',
        activeTextPackVersion: '3',
        textPackLocalPath: 'file:///packs/esv1.db',
      }),
      makeRuntimeTranslation({ id: 'nlt9', isDownloaded: false, installState: 'verifying' }),
    ],
  });

  assert.deepEqual(
    ['bsb', 'kjv', 'esv1', 'nlt9'].map((id) => [id, findTranslation(id)?.installState]),
    [
      ['bsb', 'seeded'],
      ['kjv', 'remote-only'],
      ['esv1', 'installed'],
      ['nlt9', 'remote-only'],
    ]
  );
  assert.equal(findTranslation('esv1')?.textPackLocalPath, 'file:///packs/esv1.db');
});

test('a progress banner or error from a running download is never written to storage', () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'esv1', progress: 0, status: 'downloading' },
    error: 'Translation download failed with HTTP 500.',
  });

  // A killed process must not bring "Loading… 0%" or a stale failure back on the next launch.
  const persisted = JSON.parse(mmkv.store.get(STORAGE_KEY) ?? '{}') as {
    state: Record<string, unknown>;
  };
  assert.equal('downloadProgress' in persisted.state, false);
  assert.equal('error' in persisted.state, false);
  useBibleStore.setState({ downloadProgress: null, error: null });
});

test('settled install states are restored exactly as persisted', async () => {
  await rehydrateWith({
    translations: [
      makeRuntimeTranslation({
        id: 'esv1',
        isDownloaded: true,
        installState: 'rollback-available',
        textPackLocalPath: 'file:///packs/esv1.db',
      }),
      makeRuntimeTranslation({
        id: 'nlt9',
        isDownloaded: false,
        installState: 'failed',
        lastInstallError: 'Translation download failed with HTTP 500.',
      }),
    ],
  });

  assert.equal(findTranslation('esv1')?.installState, 'rollback-available');
  assert.equal(findTranslation('nlt9')?.installState, 'failed');
  assert.equal(
    findTranslation('nlt9')?.lastInstallError,
    'Translation download failed with HTTP 500.'
  );
});

test('an unreadable persisted payload leaves the store usable and is replaced by the next write', async (t) => {
  t.mock.method(console, 'error', () => {});
  useBibleStore.setState(useBibleStore.getInitialState(), true);
  mmkv.store.set(STORAGE_KEY, '{"state":{"currentBook":"JHN","transl');

  await assert.doesNotReject(async () => useBibleStore.persist.rehydrate());

  const state = useBibleStore.getState();
  assert.equal(state.currentTranslation, 'bsb');
  assert.ok(state.translations.some((translation) => translation.id === 'bsb'));
  state.setError(null);
  const rewritten = JSON.parse(mmkv.store.get(STORAGE_KEY) ?? 'null') as {
    state: { currentTranslation: string };
  };
  assert.equal(rewritten.state.currentTranslation, 'bsb');
});

for (const [label, raw] of [
  ['a JSON null', 'null'],
  ['a null state', '{"state":null,"version":1}'],
  ['a list state', '{"state":[1,2,3],"version":1}'],
  ['a string state', '{"state":"garbage","version":1}'],
  ['an unknown old version', '{"state":{"translations":{}},"version":-2}'],
] as const) {
  test(`${label} in storage hydrates the default Bible without throwing`, async () => {
    useBibleStore.setState(useBibleStore.getInitialState(), true);
    mmkv.store.set(STORAGE_KEY, raw);

    await useBibleStore.persist.rehydrate();

    assert.equal(useBibleStore.persist.hasHydrated(), true, 'migrate and merge must not throw');
    const state = useBibleStore.getState();
    assert.equal(state.currentTranslation, 'bsb');
    assert.equal(state.currentBook, 'GEN');
    assert.ok(Array.isArray(state.translations));
    assert.ok(state.translations.some((translation) => translation.id === 'bsb'));
  });
}

test('a corrupt persisted payload hydrates to the default translation list', async () => {
  await rehydrateWith({ translations: 'not-an-array', currentTranslation: 42 });

  assert.deepEqual(
    useBibleStore.getState().translations.map((translation) => translation.id),
    ['bsb', 'web', 'kjv', 'asv', 'bbe', 'sparv1909', 'hincv', 'npiulb']
  );
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('a persisted payload from a newer store version is kept, not thrown away', async (t) => {
  const error = t.mock.method(console, 'error', () => {});

  // The migration only steps a payload forward; anything at or past the current
  // version is already in the delta format and is handed through untouched, so a
  // downgraded build does not wipe the reading position.
  await rehydrateWith({ currentBook: 'REV', currentChapter: 22 }, 7);

  assert.equal(useBibleStore.getState().currentBook, 'REV');
  assert.equal(useBibleStore.getState().currentChapter, 22);
  assert.equal(error.mock.callCount(), 0);
});

test('a legacy version 0 payload moves its inline catalog metadata into the snapshot key', async () => {
  mmkv.store.delete('bible-runtime-catalog-v1');

  await rehydrateWith(
    {
      currentBook: 'JHN',
      currentChapter: 3,
      translations: [
        makeRuntimeTranslation({
          id: 'esv1',
          isDownloaded: true,
          installState: 'installed',
          textPackLocalPath: 'file:///packs/esv1.db',
        }),
      ],
    },
    0
  );

  // The download survives the upgrade with its real name, not a placeholder.
  const restored = findTranslation('esv1');
  assert.equal(restored?.name, makeRuntimeTranslation({ id: 'esv1' }).name);
  assert.equal(restored?.textPackLocalPath, 'file:///packs/esv1.db');

  const snapshot = JSON.parse(mmkv.store.get('bible-runtime-catalog-v1') ?? '[]');
  assert.deepEqual(
    snapshot.map((entry: { id: string }) => entry.id),
    ['esv1']
  );
});

test('rehydrating mid-session keeps the loaded chapter text, which is never persisted', async () => {
  const verses = [{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning' }];
  useBibleStore.setState({ verses });

  await rehydrateWith({ currentBook: 'ROM', currentChapter: 8 });

  assert.deepEqual(useBibleStore.getState().verses, verses);
  assert.equal(useBibleStore.getState().currentBook, 'ROM');
});
