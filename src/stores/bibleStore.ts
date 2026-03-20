import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bibleBooks, bibleTranslations, config, getBookById } from '../constants';
import type { Verse, BibleTranslation, TranslationDownloadProgress } from '../types';
import {
  AUDIO_DOWNLOAD_ROOT_URI,
  downloadAudioBook,
  downloadAudioTranslation,
  expoAudioFileSystemAdapter,
  fetchRemoteChapterAudio,
  getAudioAvailability,
  isRemoteAudioAvailable,
} from '../services/audio';
import { sanitizePersistedBibleState } from './persistedStateSanitizers';

interface BibleState {
  currentBook: string;
  currentChapter: number;
  preferredChapterLaunchMode: 'listen' | 'read';
  verses: Verse[];
  isLoading: boolean;
  error: string | null;

  // Translation state
  currentTranslation: string;
  translations: BibleTranslation[];
  downloadProgress: TranslationDownloadProgress | null;

  // Basic actions
  setCurrentBook: (bookId: string) => void;
  setCurrentChapter: (chapter: number) => void;
  setPreferredChapterLaunchMode: (mode: 'listen' | 'read') => void;
  applySyncedReadingPosition: (readingPosition: { bookId: string; chapter: number }) => void;
  setVerses: (verses: Verse[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Translation actions
  setCurrentTranslation: (translationId: string) => void;
  getAvailableTranslations: () => BibleTranslation[];
  getCurrentTranslationInfo: () => BibleTranslation | undefined;
  downloadTranslation: (translationId: string, bookId?: string) => Promise<void>;
  downloadAllBooks: (translationId: string) => Promise<void>;
  downloadAudioForBook: (translationId: string, bookId: string) => Promise<void>;
  downloadAudioForTranslation: (translationId: string) => Promise<void>;
  cancelDownload: () => void;
  deleteTranslation: (translationId: string) => void;
  isBookDownloaded: (translationId: string, bookId: string) => boolean;
  isAudioBookDownloaded: (translationId: string, bookId: string) => boolean;
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      currentBook: 'GEN',
      currentChapter: 1,
      preferredChapterLaunchMode: 'read',
      verses: [],
      isLoading: false,
      error: null,
      currentTranslation: 'bsb',
      translations: bibleTranslations,
      downloadProgress: null,

      setCurrentBook: (bookId) => set({ currentBook: bookId }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setPreferredChapterLaunchMode: (preferredChapterLaunchMode) =>
        set({ preferredChapterLaunchMode }),
      applySyncedReadingPosition: ({ bookId, chapter }) => {
        const { currentBook, currentChapter } = get();

        if (currentBook === bookId && currentChapter === chapter) {
          return;
        }

        set({
          currentBook: bookId,
          currentChapter: chapter,
        });
      },
      setVerses: (verses) => set({ verses }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      setCurrentTranslation: (translationId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (!translation) {
          return;
        }

        if (translation.isDownloaded) {
          set({ currentTranslation: translationId });
          return;
        }

        if (!translation.hasText && translation.hasAudio) {
          const availability = getAudioAvailability({
            featureEnabled: config.features.audioEnabled,
            translationHasAudio: translation.hasAudio,
            remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
            downloadedAudioBooks: translation.downloadedAudioBooks,
          });

          if (availability.canPlayAudio) {
            set({ currentTranslation: translationId });
          }
        }
      },

      getAvailableTranslations: () => get().translations,

      getCurrentTranslationInfo: () => {
        return get().translations.find((t) => t.id === get().currentTranslation);
      },

      downloadTranslation: async (_translationId: string, _bookId?: string) => {
        // Translation downloads are not yet implemented
        // Only BSB is currently bundled with the app
        throw new Error('Translation downloads coming soon! Currently only BSB is available.');
      },

      downloadAllBooks: async (translationId: string) => {
        await get().downloadTranslation(translationId);
      },

      downloadAudioForBook: async (translationId: string, bookId: string) => {
        const translation = get().translations.find((item) => item.id === translationId);
        const book = getBookById(bookId);

        if (!translation?.hasAudio || !book) {
          throw new Error('Audio downloads are not available for this book.');
        }

        await downloadAudioBook({
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
          translationId,
          book,
          fileSystem: expoAudioFileSystemAdapter,
          resolveRemoteAudio: fetchRemoteChapterAudio,
        });

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? {
                  ...item,
                  downloadedAudioBooks: Array.from(
                    new Set([...item.downloadedAudioBooks, bookId])
                  ),
                }
              : item
          ),
        }));
      },

      downloadAudioForTranslation: async (translationId: string) => {
        const translation = get().translations.find((item) => item.id === translationId);
        if (!translation?.hasAudio) {
          throw new Error('Audio downloads are not available for this translation.');
        }

        const result = await downloadAudioTranslation({
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
          translationId,
          books: bibleBooks,
          fileSystem: expoAudioFileSystemAdapter,
          resolveRemoteAudio: fetchRemoteChapterAudio,
        });

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? {
                  ...item,
                  downloadedAudioBooks: Array.from(
                    new Set([...item.downloadedAudioBooks, ...result.downloadedBookIds])
                  ),
                }
              : item
          ),
        }));
      },

      cancelDownload: () => {
        set({ downloadProgress: null });
      },

      deleteTranslation: (translationId) => {
        if (translationId === 'bsb') {
          return; // Can't delete the default translation
        }

        set((state) => ({
          translations: state.translations.map((t) => {
            if (t.id === translationId) {
              return {
                ...t,
                isDownloaded: false,
                downloadedBooks: [],
                downloadedAudioBooks: [],
              };
            }
            return t;
          }),
          currentTranslation:
            state.currentTranslation === translationId ? 'bsb' : state.currentTranslation,
        }));
      },

      isBookDownloaded: (translationId, bookId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (!translation) return false;
        if (translation.isDownloaded) return true;
        return translation.downloadedBooks.includes(bookId);
      },

      isAudioBookDownloaded: (translationId, bookId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        return translation?.downloadedAudioBooks.includes(bookId) ?? false;
      },
    }),
    {
      name: 'bible-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        preferredChapterLaunchMode: state.preferredChapterLaunchMode,
        currentTranslation: state.currentTranslation,
        translations: state.translations,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedBibleState(persistedState),
      }),
    }
  )
);
