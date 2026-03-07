import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bibleTranslations } from '../constants';
import type { Verse, BibleTranslation, TranslationDownloadProgress } from '../types';

interface BibleState {
  currentBook: string;
  currentChapter: number;
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
  setVerses: (verses: Verse[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Translation actions
  setCurrentTranslation: (translationId: string) => void;
  getAvailableTranslations: () => BibleTranslation[];
  getCurrentTranslationInfo: () => BibleTranslation | undefined;
  downloadTranslation: (translationId: string, bookId?: string) => Promise<void>;
  downloadAllBooks: (translationId: string) => Promise<void>;
  cancelDownload: () => void;
  deleteTranslation: (translationId: string) => void;
  isBookDownloaded: (translationId: string, bookId: string) => boolean;
}

export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      currentBook: 'GEN',
      currentChapter: 1,
      verses: [],
      isLoading: false,
      error: null,
      currentTranslation: 'bsb',
      translations: bibleTranslations,
      downloadProgress: null,

      setCurrentBook: (bookId) => set({ currentBook: bookId }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
      setVerses: (verses) => set({ verses }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      setCurrentTranslation: (translationId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (translation && translation.isDownloaded) {
          set({ currentTranslation: translationId });
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
    }),
    {
      name: 'bible-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        currentTranslation: state.currentTranslation,
        translations: state.translations,
      }),
    }
  )
);
