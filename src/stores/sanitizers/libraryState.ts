/** Sanitizer for the persisted audio library: favorites, playlists and listening history. */
import { getBookById } from '../../constants/books';
import { isRecord } from './guards';

export const sanitizePersistedLibraryState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const favorites = Array.isArray(persisted.favorites)
    ? persisted.favorites.filter(
        (entry): entry is { id: string; bookId: string; chapter: number; addedAt: number } =>
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.bookId === 'string' &&
          Boolean(getBookById(entry.bookId)) &&
          typeof entry.chapter === 'number' &&
          Number.isInteger(entry.chapter) &&
          entry.chapter > 0 &&
          typeof entry.addedAt === 'number' &&
          Number.isFinite(entry.addedAt)
      )
    : [];

  const playlists = Array.isArray(persisted.playlists)
    ? persisted.playlists.filter(isRecord).map((playlist) => ({
        id: typeof playlist.id === 'string' ? playlist.id : `playlist-${Date.now()}`,
        title:
          typeof playlist.title === 'string' && playlist.title.trim().length > 0
            ? playlist.title
            : 'Untitled',
        createdAt:
          typeof playlist.createdAt === 'number' && Number.isFinite(playlist.createdAt)
            ? playlist.createdAt
            : Date.now(),
        updatedAt:
          typeof playlist.updatedAt === 'number' && Number.isFinite(playlist.updatedAt)
            ? playlist.updatedAt
            : Date.now(),
        entries: Array.isArray(playlist.entries)
          ? playlist.entries.filter(
              (entry): entry is { id: string; bookId: string; chapter: number; addedAt: number } =>
                isRecord(entry) &&
                typeof entry.id === 'string' &&
                typeof entry.bookId === 'string' &&
                Boolean(getBookById(entry.bookId)) &&
                typeof entry.chapter === 'number' &&
                Number.isInteger(entry.chapter) &&
                entry.chapter > 0 &&
                typeof entry.addedAt === 'number' &&
                Number.isFinite(entry.addedAt)
            )
          : [],
      }))
    : [];

  const history = Array.isArray(persisted.history)
    ? persisted.history.filter(
        (
          entry
        ): entry is {
          id: string;
          bookId: string;
          chapter: number;
          listenedAt: number;
          progress: number;
        } =>
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.bookId === 'string' &&
          Boolean(getBookById(entry.bookId)) &&
          typeof entry.chapter === 'number' &&
          Number.isInteger(entry.chapter) &&
          entry.chapter > 0 &&
          typeof entry.listenedAt === 'number' &&
          Number.isFinite(entry.listenedAt) &&
          typeof entry.progress === 'number' &&
          Number.isFinite(entry.progress)
      )
    : [];

  return {
    favorites,
    playlists,
    history,
  };
};
