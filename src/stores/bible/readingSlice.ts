import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';

type ReadingSlice = Pick<
  BibleState,
  | 'currentBook'
  | 'currentChapter'
  | 'readingPositionUpdatedAt'
  | 'hasReaderHistory'
  | 'preferredChapterLaunchMode'
  | 'verses'
  | 'isLoading'
  | 'error'
  | 'setCurrentBook'
  | 'setCurrentChapter'
  | 'setReadingPosition'
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
  readingPositionUpdatedAt: null,
  hasReaderHistory: false,
  preferredChapterLaunchMode: 'listen',
  verses: [],
  isLoading: false,
  error: null,

  setCurrentBook: (bookId) => get().setReadingPosition({ bookId, chapter: get().currentChapter }),
  setCurrentChapter: (chapter) => get().setReadingPosition({ bookId: get().currentBook, chapter }),
  setReadingPosition: ({ bookId, chapter }) => {
    const current = get();
    if (
      current.hasReaderHistory &&
      current.readingPositionUpdatedAt !== null &&
      Number.isSafeInteger(current.readingPositionUpdatedAt) &&
      current.readingPositionUpdatedAt > 0 &&
      current.currentBook === bookId &&
      current.currentChapter === chapter
    )
      return;
    const now = Date.now();
    const prior = current.readingPositionUpdatedAt;
    const bound = now + 86_400_000;
    // An ahead-of-clock stamp cannot keep every later local choice in the future.
    const boundedPrior =
      prior !== null && Number.isSafeInteger(prior) && prior > 0 && prior <= bound ? prior : 0;
    set({
      currentBook: bookId,
      currentChapter: chapter,
      hasReaderHistory: true,
      readingPositionUpdatedAt: Math.min(bound, Math.max(now, boundedPrior + 1)),
    });
  },
  setPreferredChapterLaunchMode: (preferredChapterLaunchMode) =>
    set({ preferredChapterLaunchMode }),
  applySyncedReadingPosition: ({ bookId, chapter, updatedAt }) => {
    const { currentBook, currentChapter, readingPositionUpdatedAt } = get();

    if (
      currentBook === bookId &&
      currentChapter === chapter &&
      readingPositionUpdatedAt === updatedAt
    ) {
      return;
    }

    set({
      currentBook: bookId,
      currentChapter: chapter,
      readingPositionUpdatedAt: updatedAt,
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
      readingPositionUpdatedAt: null,
      hasReaderHistory: false,
      preferredChapterLaunchMode: 'listen',
      verses: [],
      isLoading: false,
      error: null,
      downloadProgress: null,
    });
  },
});
