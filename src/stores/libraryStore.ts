import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  addChapterToPlaylist,
  appendListeningHistoryEntry,
  toggleFavoriteChapter,
  type FavoriteChapter,
  type LibraryPlaylist,
  type ListeningHistoryEntry,
} from './libraryModel';
import { sanitizePersistedLibraryState } from './persistedStateSanitizers';

const DEFAULT_PLAYLIST_ID = 'saved-chapters';
const DEFAULT_PLAYLIST_TITLE = 'Saved Chapters';

interface LibraryState {
  favorites: FavoriteChapter[];
  playlists: LibraryPlaylist[];
  history: ListeningHistoryEntry[];
  toggleFavorite: (bookId: string, chapter: number) => void;
  isFavorite: (bookId: string, chapter: number) => boolean;
  createPlaylist: (title: string) => string;
  addChapterToPlaylist: (playlistId: string, bookId: string, chapter: number) => void;
  addChapterToDefaultPlaylist: (bookId: string, chapter: number) => string;
  recordHistory: (bookId: string, chapter: number, progress: number) => void;
  clearHistory: () => void;
}

const buildChapterId = (bookId: string, chapter: number) => `${bookId}:${chapter}`;

const createPlaylistRecord = (id: string, title: string, createdAt: number): LibraryPlaylist => ({
  id,
  title,
  createdAt,
  updatedAt: createdAt,
  entries: [],
});

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      playlists: [],
      history: [],

      toggleFavorite: (bookId, chapter) => {
        const nextFavorite: FavoriteChapter = {
          id: buildChapterId(bookId, chapter),
          bookId,
          chapter,
          addedAt: Date.now(),
        };

        set((state) => ({
          favorites: toggleFavoriteChapter(state.favorites, nextFavorite),
        }));
      },

      isFavorite: (bookId, chapter) =>
        get().favorites.some((favorite) => favorite.id === buildChapterId(bookId, chapter)),

      createPlaylist: (title) => {
        const createdAt = Date.now();
        const id = `playlist-${createdAt}`;

        set((state) => ({
          playlists: [...state.playlists, createPlaylistRecord(id, title.trim() || 'Untitled', createdAt)],
        }));

        return id;
      },

      addChapterToPlaylist: (playlistId, bookId, chapter) => {
        const addedAt = Date.now();

        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? addChapterToPlaylist(playlist, {
                  id: buildChapterId(bookId, chapter),
                  bookId,
                  chapter,
                  addedAt,
                })
              : playlist
          ),
        }));
      },

      addChapterToDefaultPlaylist: (bookId, chapter) => {
        const existingPlaylist = get().playlists.find((playlist) => playlist.id === DEFAULT_PLAYLIST_ID);

        if (!existingPlaylist) {
          set((state) => ({
            playlists: [
              ...state.playlists,
              createPlaylistRecord(DEFAULT_PLAYLIST_ID, DEFAULT_PLAYLIST_TITLE, Date.now()),
            ],
          }));
        }

        get().addChapterToPlaylist(DEFAULT_PLAYLIST_ID, bookId, chapter);
        return DEFAULT_PLAYLIST_ID;
      },

      recordHistory: (bookId, chapter, progress) => {
        const nextEntry: ListeningHistoryEntry = {
          id: buildChapterId(bookId, chapter),
          bookId,
          chapter,
          listenedAt: Date.now(),
          progress: Math.max(0, Math.min(progress, 1)),
        };

        set((state) => ({
          history: appendListeningHistoryEntry(state.history, nextEntry),
        }));
      },

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'library-storage',
      storage: createJSONStorage(() => zustandStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedLibraryState(persistedState),
      }),
    }
  )
);
