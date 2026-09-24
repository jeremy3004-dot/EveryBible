import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';

type ReadingSlice = Pick<
  BibleState,
  | 'currentBook'
  | 'currentChapter'
  | 'hasReaderHistory'
  | 'preferredChapterLaunchMode'
  | 'verses'
  | 'isLoading'
  | 'error'
  | 'setCurrentBook'
  | 'setCurrentChapter'
  | 'setPreferredChapterLaunchMode'
  | 'applySyncedReadingPosition'
  | 'setVerses'
  | 'setLoading'
  | 'setError'
  | 'resetForSignOut'
>;

/** Reading position, the loaded chapter, and the per-account reading state cleared at sign-out. */
export const createReadingSlice: BibleSliceCreator<ReadingSlice> = (set, get) => ({
  currentBook: 'GEN',
  currentChapter: 1,
  hasReaderHistory: false,
  preferredChapterLaunchMode: 'listen',
  verses: [],
  isLoading: false,
  error: null,

  setCurrentBook: (bookId) => set({ currentBook: bookId, hasReaderHistory: true }),
  setCurrentChapter: (chapter) => set({ currentChapter: chapter, hasReaderHistory: true }),
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
      hasReaderHistory: true,
    });
  },
  setVerses: (verses) => set({ verses }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Clear per-user reading state on sign-out so a second account signing in on the same device
  // does not inherit the previous user's reading position or in-progress download UI (H2). Keeps
  // translation availability (bundled + installed packs and current translation) intact — that is
  // device-level, not user-level, and re-downloading installed Bibles on every account switch
  // would be hostile in the offline-first, metered-data markets this app targets.
  resetForSignOut: () => {
    set({
      // The next account's saved Bible wins over a choice stamped under this one.
      currentTranslationChosenAt: null,
      currentBook: 'GEN',
      currentChapter: 1,
      hasReaderHistory: false,
      preferredChapterLaunchMode: 'listen',
      verses: [],
      isLoading: false,
      error: null,
      downloadProgress: null,
    });
  },
});
