import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addChapterToPlaylist,
  appendListeningHistoryEntry,
  toggleFavoriteChapter,
  type FavoriteChapter,
  type LibraryPlaylist,
  type ListeningHistoryEntry,
  type PlaylistChapterEntry,
} from './libraryModel';

test('toggleFavoriteChapter adds and removes a chapter favorite idempotently', () => {
  const initial: FavoriteChapter[] = [];
  const added = toggleFavoriteChapter(initial, {
    id: 'MAT:5',
    bookId: 'MAT',
    chapter: 5,
    addedAt: 10,
  });

  assert.deepEqual(added, [
    {
      id: 'MAT:5',
      bookId: 'MAT',
      chapter: 5,
      addedAt: 10,
    },
  ]);

  assert.deepEqual(
    toggleFavoriteChapter(added, {
      id: 'MAT:5',
      bookId: 'MAT',
      chapter: 5,
      addedAt: 20,
    }),
    []
  );
});

test('addChapterToPlaylist deduplicates chapters and keeps newest additions at the front', () => {
  const playlist: LibraryPlaylist = {
    id: 'saved',
    title: 'Saved Chapters',
    createdAt: 1,
    updatedAt: 1,
    entries: [
      { id: 'MAT:5', bookId: 'MAT', chapter: 5, addedAt: 1 },
      { id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 2 },
    ],
  };

  const updated = addChapterToPlaylist(playlist, {
    id: 'MAT:5',
    bookId: 'MAT',
    chapter: 5,
    addedAt: 3,
  });

  assert.deepEqual(
    updated.entries.map((entry: PlaylistChapterEntry) => `${entry.bookId}:${entry.chapter}`),
    ['MAT:5', 'JHN:3']
  );
  assert.equal(updated.updatedAt, 3);
});

test('appendListeningHistoryEntry keeps the newest unique chapters first and caps the list', () => {
  const seed = Array.from({ length: 256 }, (_, index) => ({
    id: `MAT:${index + 1}`,
    bookId: 'MAT',
    chapter: index + 1,
    listenedAt: index + 1,
    progress: 0.5,
  })) satisfies ListeningHistoryEntry[];

  const updated = appendListeningHistoryEntry(seed, {
    id: 'JHN:3',
    bookId: 'JHN',
    chapter: 3,
    listenedAt: 500,
    progress: 0.25,
  });

  assert.equal(updated.length, 256);
  assert.deepEqual(updated[0], {
    id: 'JHN:3',
    bookId: 'JHN',
    chapter: 3,
    listenedAt: 500,
    progress: 0.25,
  });
  assert.equal(updated.at(-1)?.id, 'MAT:255');
});
