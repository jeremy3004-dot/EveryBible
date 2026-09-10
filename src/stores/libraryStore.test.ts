import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// One mock configuration per file: the library store only needs MMKV. Its model
// (./libraryModel) and its hydration sanitizer (./persistedStateSanitizers) are
// pure and run for real.
const mmkv = mockMmkvStorage(mock);

let useLibraryStore: typeof import('./libraryStore').useLibraryStore;

before(async () => {
  ({ useLibraryStore } = await import('./libraryStore'));
});

const state = () => useLibraryStore.getState();
const readPersisted = () => JSON.parse(mmkv.store.get('library-storage') ?? '{}');

const seedStorage = (persistedState: unknown) => {
  mmkv.store.set('library-storage', JSON.stringify({ state: persistedState, version: 0 }));
};

beforeEach(() => {
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
  mmkv.store.clear();
});

// ---------------------------------------------------------------------------
// favorites
// ---------------------------------------------------------------------------

test('favouriting a chapter stores it keyed by book and chapter', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().toggleFavorite('GEN', 3);

  assert.deepEqual(state().favorites, [
    { id: 'GEN:3', bookId: 'GEN', chapter: 3, addedAt: 1_700_000_000_000 },
  ]);
});

test('favouriting the same chapter again removes it', () => {
  state().toggleFavorite('GEN', 3);
  state().toggleFavorite('GEN', 3);

  assert.deepEqual(state().favorites, []);
});

test('the newest favourite is placed at the head of the list', () => {
  state().toggleFavorite('GEN', 1);
  state().toggleFavorite('JHN', 3);

  assert.deepEqual(
    state().favorites.map((favorite) => favorite.id),
    ['JHN:3', 'GEN:1']
  );
});

test('isFavorite answers per book and chapter', () => {
  state().toggleFavorite('GEN', 3);

  assert.equal(state().isFavorite('GEN', 3), true);
  assert.equal(state().isFavorite('GEN', 4), false);
  assert.equal(state().isFavorite('JHN', 3), false);
});

test('favourites are persisted to MMKV', () => {
  state().toggleFavorite('GEN', 3);

  assert.deepEqual(
    readPersisted().state.favorites.map((favorite: { id: string }) => favorite.id),
    ['GEN:3']
  );
});

// ---------------------------------------------------------------------------
// playlists
// ---------------------------------------------------------------------------

test('creating a playlist returns a timestamped id and stores an empty playlist', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  const id = state().createPlaylist('Advent');

  assert.equal(id, 'playlist-1700000000000');
  assert.deepEqual(state().playlists, [
    {
      id: 'playlist-1700000000000',
      title: 'Advent',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      entries: [],
    },
  ]);
});

test('a blank playlist title falls back to Untitled', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().createPlaylist('   ');

  assert.equal(state().playlists[0].title, 'Untitled');
});

test('a playlist title is trimmed before it is stored', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().createPlaylist('  Advent  ');

  assert.equal(state().playlists[0].title, 'Advent');
});

test('adding a chapter to a playlist puts it at the head and bumps updatedAt', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  const id = state().createPlaylist('Advent');

  t.mock.timers.setTime(1_700_000_060_000);
  state().addChapterToPlaylist(id, 'GEN', 1);
  t.mock.timers.setTime(1_700_000_120_000);
  state().addChapterToPlaylist(id, 'JHN', 3);

  const [playlist] = state().playlists;
  assert.deepEqual(
    playlist.entries.map((entry) => entry.id),
    ['JHN:3', 'GEN:1']
  );
  assert.equal(playlist.updatedAt, 1_700_000_120_000);
});

test('re-adding a chapter moves it back to the head instead of duplicating it', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  const id = state().createPlaylist('Advent');
  state().addChapterToPlaylist(id, 'GEN', 1);
  state().addChapterToPlaylist(id, 'JHN', 3);

  t.mock.timers.setTime(1_700_000_300_000);
  state().addChapterToPlaylist(id, 'GEN', 1);

  assert.deepEqual(
    state().playlists[0].entries.map((entry) => entry.id),
    ['GEN:1', 'JHN:3']
  );
  assert.equal(state().playlists[0].entries[0].addedAt, 1_700_000_300_000);
});

test('adding to an unknown playlist leaves every playlist unchanged', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  const id = state().createPlaylist('Advent');

  state().addChapterToPlaylist('playlist-does-not-exist', 'GEN', 1);

  assert.deepEqual(state().playlists.find((playlist) => playlist.id === id)?.entries, []);
  assert.equal(state().playlists.length, 1);
});

test('the first save to the default playlist creates the Saved Chapters playlist', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  const id = state().addChapterToDefaultPlaylist('GEN', 1);

  assert.equal(id, 'saved-chapters');
  assert.deepEqual(
    state().playlists.map((playlist) => [playlist.id, playlist.title]),
    [['saved-chapters', 'Saved Chapters']]
  );
  assert.deepEqual(
    state().playlists[0].entries.map((entry) => entry.id),
    ['GEN:1']
  );
});

test('later saves reuse the existing default playlist rather than creating a second one', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().addChapterToDefaultPlaylist('GEN', 1);
  state().addChapterToDefaultPlaylist('JHN', 3);

  assert.equal(state().playlists.length, 1);
  assert.deepEqual(
    state().playlists[0].entries.map((entry) => entry.id),
    ['JHN:3', 'GEN:1']
  );
});

test('saving to the default playlist leaves other playlists alone', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  const custom = state().createPlaylist('Advent');

  state().addChapterToDefaultPlaylist('GEN', 1);

  assert.deepEqual(
    state().playlists.map((playlist) => playlist.id),
    [custom, 'saved-chapters']
  );
  assert.deepEqual(state().playlists[0].entries, []);
});

test('playlists are persisted to MMKV', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().addChapterToDefaultPlaylist('GEN', 1);

  assert.deepEqual(
    readPersisted().state.playlists[0].entries.map((entry: { id: string }) => entry.id),
    ['GEN:1']
  );
});

// ---------------------------------------------------------------------------
// listening history
// ---------------------------------------------------------------------------

test('recording history stores the chapter with its clamped progress', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  state().recordHistory('GEN', 1, 0.5);

  assert.deepEqual(state().history, [
    { id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 1_700_000_000_000, progress: 0.5 },
  ]);
});

test('progress above one is clamped to one', () => {
  state().recordHistory('GEN', 1, 4);

  assert.equal(state().history[0].progress, 1);
});

test('negative progress is clamped to zero', () => {
  state().recordHistory('GEN', 1, -3);

  assert.equal(state().history[0].progress, 0);
});

test('the newest listen is at the head and replaces the previous entry for that chapter', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  state().recordHistory('GEN', 1, 0.2);
  state().recordHistory('JHN', 3, 0.4);

  t.mock.timers.setTime(1_700_000_600_000);
  state().recordHistory('GEN', 1, 0.9);

  assert.deepEqual(
    state().history.map((entry) => [entry.id, entry.progress]),
    [
      ['GEN:1', 0.9],
      ['JHN:3', 0.4],
    ]
  );
  assert.equal(state().history[0].listenedAt, 1_700_000_600_000);
});

test('history is capped at 256 entries, keeping the most recent', () => {
  for (let chapter = 1; chapter <= 260; chapter += 1) {
    state().recordHistory('PSA', chapter, 1);
  }

  assert.equal(state().history.length, 256);
  assert.equal(state().history[0].id, 'PSA:260');
  assert.equal(state().history[255].id, 'PSA:5');
});

test('clearing history empties the list and the persisted snapshot', () => {
  state().recordHistory('GEN', 1, 0.5);

  state().clearHistory();

  assert.deepEqual(state().history, []);
  assert.deepEqual(readPersisted().state.history, []);
});

test('clearing history leaves favourites and playlists intact', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  state().toggleFavorite('GEN', 3);
  state().addChapterToDefaultPlaylist('JHN', 3);
  state().recordHistory('GEN', 1, 0.5);

  state().clearHistory();

  assert.equal(state().favorites.length, 1);
  assert.equal(state().playlists.length, 1);
});

// ---------------------------------------------------------------------------
// hydration through sanitizePersistedLibraryState
// ---------------------------------------------------------------------------

test('a well-formed snapshot hydrates favourites, playlists and history', async () => {
  seedStorage({
    favorites: [{ id: 'GEN:3', bookId: 'GEN', chapter: 3, addedAt: 1 }],
    playlists: [
      {
        id: 'saved-chapters',
        title: 'Saved Chapters',
        createdAt: 1,
        updatedAt: 2,
        entries: [{ id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 2 }],
      },
    ],
    history: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 3, progress: 0.5 }],
  });

  await useLibraryStore.persist.rehydrate();

  assert.equal(state().isFavorite('GEN', 3), true);
  assert.deepEqual(
    state().playlists[0].entries.map((entry) => entry.id),
    ['JHN:3']
  );
  assert.deepEqual(
    state().history.map((entry) => entry.id),
    ['GEN:1']
  );
});

test('favourites naming a book that no longer exists are dropped on hydration', async () => {
  seedStorage({
    favorites: [
      { id: 'GEN:3', bookId: 'GEN', chapter: 3, addedAt: 1 },
      { id: 'XYZ:1', bookId: 'XYZ', chapter: 1, addedAt: 1 },
    ],
  });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(
    state().favorites.map((favorite) => favorite.id),
    ['GEN:3']
  );
});

test('favourites with a non-integer or non-positive chapter are dropped on hydration', async () => {
  seedStorage({
    favorites: [
      { id: 'GEN:0', bookId: 'GEN', chapter: 0, addedAt: 1 },
      { id: 'GEN:1.5', bookId: 'GEN', chapter: 1.5, addedAt: 1 },
      { id: 'GEN:2', bookId: 'GEN', chapter: 2, addedAt: 1 },
    ],
  });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(
    state().favorites.map((favorite) => favorite.id),
    ['GEN:2']
  );
});

test('a playlist with a missing title and timestamps hydrates with safe defaults', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  seedStorage({ playlists: [{ id: 'saved-chapters', entries: [] }] });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(state().playlists, [
    {
      id: 'saved-chapters',
      title: 'Untitled',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      entries: [],
    },
  ]);
});

test('playlist entries pointing at an unknown book are dropped while the playlist survives', async () => {
  seedStorage({
    playlists: [
      {
        id: 'saved-chapters',
        title: 'Saved Chapters',
        createdAt: 1,
        updatedAt: 2,
        entries: [
          { id: 'XYZ:1', bookId: 'XYZ', chapter: 1, addedAt: 1 },
          { id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 2 },
        ],
      },
    ],
  });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(
    state().playlists[0].entries.map((entry) => entry.id),
    ['GEN:1']
  );
});

test('history entries with a non-finite progress are dropped on hydration', async () => {
  seedStorage({
    history: [
      { id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 1, progress: 'half' },
      { id: 'GEN:2', bookId: 'GEN', chapter: 2, listenedAt: 2, progress: 0.5 },
    ],
  });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(
    state().history.map((entry) => entry.id),
    ['GEN:2']
  );
});

test('a snapshot whose collections are not arrays hydrates to empty collections', async () => {
  seedStorage({ favorites: 'nope', playlists: null, history: 42 });

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(
    { favorites: state().favorites, playlists: state().playlists, history: state().history },
    { favorites: [], playlists: [], history: [] }
  );
});

test('a snapshot that is not an object at all hydrates to empty collections', async () => {
  seedStorage('corrupted');

  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(state().favorites, []);
  assert.deepEqual(state().playlists, []);
  assert.deepEqual(state().history, []);
});

test('hydration keeps the store actions callable', async () => {
  seedStorage({ favorites: [{ id: 'GEN:3', bookId: 'GEN', chapter: 3, addedAt: 1 }] });

  await useLibraryStore.persist.rehydrate();
  state().toggleFavorite('JHN', 3);

  assert.deepEqual(
    state().favorites.map((favorite) => favorite.id),
    ['JHN:3', 'GEN:3']
  );
});

test('an empty storage slot leaves every collection empty', async () => {
  await useLibraryStore.persist.rehydrate();

  assert.deepEqual(state().favorites, []);
  assert.deepEqual(state().playlists, []);
  assert.deepEqual(state().history, []);
});
