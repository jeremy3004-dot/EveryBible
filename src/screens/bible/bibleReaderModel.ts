import type { Verse } from '../../types';

export type FontSizeSheetAction =
  | 'toggleButton'
  | 'readerContentTap'
  | 'scrollStart'
  | 'chapterChange';

export type TranslationSheetAction = 'toggleChip' | 'selectTranslation' | 'dismiss';
export type ChapterSessionMode = 'listen' | 'read';
export type BibleTabBarVisibilityAction = 'enter' | 'scrollStart' | 'scrollEndDrag';

interface ReaderChapterRouteParamsInput {
  bookId: string;
  chapter: number;
  preferredMode: ChapterSessionMode;
}

export const READER_HERO_COLLAPSE_DISTANCE = 72;
export const READER_TOP_CHROME_DISMISS_DISTANCE = 220;
export const READER_BOTTOM_CHROME_COLLAPSE_DISTANCE = 156;
export const READER_VERSE_LINE_HEIGHT_MULTIPLIER = 1.5;
export const FOLLOW_ALONG_VERSE_LINE_HEIGHT = 32;

interface InitialChapterSessionModeInput {
  translationId?: string | null;
  audioEnabled: boolean;
  hasText: boolean;
  autoplayAudio: boolean;
  preferredMode: ChapterSessionMode | null;
  bookId: string;
  chapter: number;
  activeAudioTranslationId?: string | null;
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
}

interface NextChapterSessionModeInput {
  requestedMode: ChapterSessionMode;
  audioEnabled: boolean;
  hasText: boolean;
}

interface EstimatedFollowAlongVerseInput {
  verses: Verse[];
  currentPosition: number;
  duration: number;
  fallbackVerse?: number;
  /** Exact verse start times from aeneas alignment. When provided, used instead of word-weight estimation. */
  timestamps?: Record<number, number> | null;
}

interface NextFollowAlongVisibilityInput {
  currentlyVisible: boolean;
  nextSessionMode: ChapterSessionMode;
  hasText: boolean;
}

interface BibleTabBarVisibilityInput {
  sessionMode: ChapterSessionMode;
  action: BibleTabBarVisibilityAction;
  previousScrollOffsetY?: number;
  currentScrollOffsetY?: number;
  velocityY?: number;
}

interface ShouldAutoplayChapterAudioInput {
  translationId?: string | null;
  autoplayAudio: boolean;
  audioEnabled: boolean;
  isLoading: boolean;
  bookId: string;
  chapter: number;
  activeAudioTranslationId?: string | null;
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
}

interface ActiveAudioTrackMatchInput {
  translationId?: string | null;
  bookId: string;
  chapter: number;
  activeAudioTranslationId?: string | null;
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
}

interface ShouldReplayActiveAudioForTranslationChangeInput {
  currentTranslationId: string;
  nextTranslationId: string;
  audioEnabled: boolean;
  bookId: string;
  chapter: number;
  activeAudioTranslationId?: string | null;
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
}

interface ShouldTransferActiveAudioOnChapterChangeInput {
  audioEnabled: boolean;
  isCurrentAudioChapter: boolean;
}

interface ShouldSyncReaderToActiveAudioChapterInput {
  audioEnabled: boolean;
  bookId: string;
  chapter: number;
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
  previousActiveAudioBookId: string | null;
  previousActiveAudioChapter: number | null;
}

export const getNextFontSizeSheetVisibility = (
  isVisible: boolean,
  action: FontSizeSheetAction
): boolean => {
  if (action === 'toggleButton') {
    return !isVisible;
  }

  return false;
};

export const getNextTranslationSheetVisibility = (
  isVisible: boolean,
  canShowTranslationSheet: boolean,
  action: TranslationSheetAction
): boolean => {
  if (!canShowTranslationSheet) {
    return false;
  }

  if (action === 'toggleChip') {
    return !isVisible;
  }

  return false;
};

export const buildReaderChapterRouteParams = ({
  bookId,
  chapter,
  preferredMode,
}: ReaderChapterRouteParamsInput) => ({
  bookId,
  chapter,
  focusVerse: undefined,
  preferredMode,
  autoplayAudio: false,
});

export const getReaderChromeAnimationProgress = (
  offsetY: number,
  collapseDistance: number
): number => {
  if (collapseDistance <= 0) {
    return 1;
  }

  const clampedOffset = Math.max(offsetY, 0);
  return Math.max(0, Math.min(clampedOffset / collapseDistance, 1));
};

export const getReaderVerseLineHeight = (verseFontSize: number): number =>
  Math.round(verseFontSize * READER_VERSE_LINE_HEIGHT_MULTIPLIER);

export const isReaderChromeCollapsed = (offsetY: number): boolean =>
  getReaderChromeAnimationProgress(offsetY, READER_BOTTOM_CHROME_COLLAPSE_DISTANCE) >= 1;

export const isActiveAudioTrackMatch = ({
  translationId,
  bookId,
  chapter,
  activeAudioTranslationId,
  activeAudioBookId,
  activeAudioChapter,
}: ActiveAudioTrackMatchInput): boolean => {
  if (activeAudioBookId !== bookId || activeAudioChapter !== chapter) {
    return false;
  }

  if (translationId == null || activeAudioTranslationId == null) {
    return true;
  }

  return activeAudioTranslationId === translationId;
};

export const getInitialChapterSessionMode = ({
  translationId,
  audioEnabled,
  hasText,
  autoplayAudio,
  preferredMode,
  bookId,
  chapter,
  activeAudioTranslationId,
  activeAudioBookId,
  activeAudioChapter,
}: InitialChapterSessionModeInput): ChapterSessionMode => {
  if (!hasText && audioEnabled) {
    return 'listen';
  }

  if (!audioEnabled) {
    return 'read';
  }

  if (preferredMode === 'listen' && audioEnabled) {
    return 'listen';
  }

  if (preferredMode === 'read' && hasText) {
    return 'read';
  }

  if (autoplayAudio) {
    return 'listen';
  }

  if (
    isActiveAudioTrackMatch({
      translationId,
      bookId,
      chapter,
      activeAudioTranslationId,
      activeAudioBookId,
      activeAudioChapter,
    })
  ) {
    return 'listen';
  }

  return 'read';
};

export const getNextChapterSessionMode = (
  currentMode: ChapterSessionMode,
  { requestedMode, audioEnabled, hasText }: NextChapterSessionModeInput
): ChapterSessionMode => {
  if (!hasText && audioEnabled) {
    return 'listen';
  }

  if (requestedMode === 'listen' && !audioEnabled) {
    return 'read';
  }

  if (requestedMode === 'read' && !hasText) {
    return audioEnabled ? 'listen' : currentMode;
  }

  return requestedMode;
};

export const getEstimatedFollowAlongVerse = ({
  verses,
  currentPosition,
  duration,
  fallbackVerse,
  timestamps,
}: EstimatedFollowAlongVerseInput): number | null => {
  if (verses.length === 0) {
    return fallbackVerse ?? null;
  }

  if (duration <= 0 || Number.isNaN(currentPosition) || currentPosition < 0) {
    return fallbackVerse ?? verses[0]?.verse ?? null;
  }

  // When exact timestamps are available, use them directly instead of word-weight estimation.
  // NOTE: timestamps are in SECONDS; currentPosition from expo-av is in MILLISECONDS.
  if (timestamps) {
    const verseNums = (Object.keys(timestamps) as string[]).map(Number).sort((a, b) => a - b);
    if (verseNums.length > 0) {
      const currentPositionSeconds = currentPosition / 1000;
      let current = verseNums[0];
      for (const vn of verseNums) {
        if (timestamps[vn] <= currentPositionSeconds) {
          current = vn;
        } else {
          break;
        }
      }
      return current;
    }
  }

  const totalWeight = verses.reduce((sum, verse) => sum + getVerseWeight(verse), 0);
  if (totalWeight <= 0) {
    return fallbackVerse ?? verses[0]?.verse ?? null;
  }

  // Apply a fixed 200ms lag (time-based, not proportion-based) so text does not
  // advance ahead of audio. At 1x speed this is ~200ms; scales naturally with rate.
  const laggedProgress = Math.max(0, (currentPosition - 200) / duration);
  const weightedProgress = laggedProgress * totalWeight;

  let cumulativeWeight = 0;
  for (const verse of verses) {
    cumulativeWeight += getVerseWeight(verse);
    if (weightedProgress < cumulativeWeight) {
      return verse.verse;
    }
  }

  return verses[verses.length - 1]?.verse ?? fallbackVerse ?? null;
};

export const getNextFollowAlongVisibility = ({
  currentlyVisible,
  nextSessionMode,
  hasText,
}: NextFollowAlongVisibilityInput): boolean =>
  currentlyVisible && nextSessionMode === 'listen' && hasText;

export const getNextBibleTabBarVisibility = ({
  sessionMode,
  action,
  previousScrollOffsetY = 0,
  currentScrollOffsetY = 0,
  velocityY = 0,
}: BibleTabBarVisibilityInput): boolean => {
  if (sessionMode === 'listen') {
    return true;
  }

  switch (action) {
    case 'enter':
      return true;
    case 'scrollStart':
      return false;
    case 'scrollEndDrag':
      return (
        currentScrollOffsetY <= 0 &&
        currentScrollOffsetY < previousScrollOffsetY &&
        Math.abs(velocityY) >= SWIPE_VELOCITY_MIN
      );
  }
};

export const shouldAutoplayChapterAudio = ({
  translationId,
  autoplayAudio,
  audioEnabled,
  isLoading,
  bookId,
  chapter,
  activeAudioTranslationId,
  activeAudioBookId,
  activeAudioChapter,
}: ShouldAutoplayChapterAudioInput): boolean => {
  if (!autoplayAudio || !audioEnabled || isLoading) {
    return false;
  }

  return !isActiveAudioTrackMatch({
    translationId,
    bookId,
    chapter,
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
  });
};

export const shouldReplayActiveAudioForTranslationChange = ({
  currentTranslationId,
  nextTranslationId,
  audioEnabled,
  bookId,
  chapter,
  activeAudioTranslationId,
  activeAudioBookId,
  activeAudioChapter,
}: ShouldReplayActiveAudioForTranslationChangeInput): boolean => {
  if (!audioEnabled || currentTranslationId === nextTranslationId) {
    return false;
  }

  return isActiveAudioTrackMatch({
    translationId: currentTranslationId,
    bookId,
    chapter,
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
  });
};

export const shouldTransferActiveAudioOnChapterChange = ({
  audioEnabled,
  isCurrentAudioChapter,
}: ShouldTransferActiveAudioOnChapterChangeInput): boolean => audioEnabled && isCurrentAudioChapter;

export const shouldSyncReaderToActiveAudioChapter = ({
  audioEnabled,
  bookId,
  chapter,
  activeAudioBookId,
  activeAudioChapter,
  previousActiveAudioBookId,
  previousActiveAudioChapter,
}: ShouldSyncReaderToActiveAudioChapterInput): boolean => {
  if (!audioEnabled || activeAudioBookId == null || activeAudioChapter == null) {
    return false;
  }

  if (activeAudioBookId === bookId && activeAudioChapter === chapter) {
    return false;
  }

  return previousActiveAudioBookId === bookId && previousActiveAudioChapter === chapter;
};

// --- Swipe chapter navigation ---

export const SWIPE_THRESHOLD = 80;
export const SWIPE_VELOCITY_MIN = 600;

interface SwipeChapterNavigationInput {
  translationX: number;
  velocityX: number;
  hasNextChapter: boolean;
  hasPrevChapter: boolean;
}

export type SwipeNavigationResult = 'next' | 'prev' | null;

export const resolveSwipeChapterNavigation = ({
  translationX,
  velocityX,
  hasNextChapter,
  hasPrevChapter,
}: SwipeChapterNavigationInput): SwipeNavigationResult => {
  const wantsNext = translationX < -SWIPE_THRESHOLD || velocityX < -SWIPE_VELOCITY_MIN;
  const wantsPrev = translationX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY_MIN;

  if (wantsNext && hasNextChapter) return 'next';
  if (wantsPrev && hasPrevChapter) return 'prev';
  return null;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function getVerseWeight(verse: Verse): number {
  const headingWords = verse.heading ? countWords(verse.heading) : 0;
  const textWords = countWords(verse.text);
  return Math.max(textWords + headingWords, 1);
}
