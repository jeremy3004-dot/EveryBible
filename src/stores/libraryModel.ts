export interface FavoriteChapter {
  id: string;
  bookId: string;
  chapter: number;
  addedAt: number;
}

export interface PlaylistChapterEntry {
  id: string;
  bookId: string;
  chapter: number;
  addedAt: number;
}

export interface LibraryPlaylist {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  entries: PlaylistChapterEntry[];
}

export interface ListeningHistoryEntry {
  id: string;
  bookId: string;
  chapter: number;
  listenedAt: number;
  progress: number;
}

const HISTORY_LIMIT = 20;

export function toggleFavoriteChapter(
  favorites: FavoriteChapter[],
  favorite: FavoriteChapter
): FavoriteChapter[] {
  const exists = favorites.some((entry) => entry.id === favorite.id);

  if (exists) {
    return favorites.filter((entry) => entry.id !== favorite.id);
  }

  return [favorite, ...favorites];
}

export function addChapterToPlaylist(
  playlist: LibraryPlaylist,
  entry: PlaylistChapterEntry
): LibraryPlaylist {
  const remainingEntries = playlist.entries.filter((item) => item.id !== entry.id);

  return {
    ...playlist,
    updatedAt: entry.addedAt,
    entries: [entry, ...remainingEntries],
  };
}

export function appendListeningHistoryEntry(
  history: ListeningHistoryEntry[],
  entry: ListeningHistoryEntry
) {
  const dedupedHistory = history.filter((item) => item.id !== entry.id);
  return [entry, ...dedupedHistory].slice(0, HISTORY_LIMIT);
}
