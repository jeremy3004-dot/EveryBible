import type { Verse } from '../../types';

export type FontSizeSheetAction =
  | 'toggleButton'
  | 'readerContentTap'
  | 'scrollStart'
  | 'chapterChange';

export type TranslationSheetAction = 'toggleChip' | 'selectTranslation' | 'dismiss';
export type ChapterSessionMode = 'listen' | 'read';

interface InitialChapterSessionModeInput {
  audioEnabled: boolean;
  hasText: boolean;
  autoplayAudio: boolean;
  preferredMode: ChapterSessionMode | null;
  bookId: string;
  chapter: number;
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
}

interface ShouldAutoplayChapterAudioInput {
  autoplayAudio: boolean;
  audioEnabled: boolean;
  isLoading: boolean;
  bookId: string;
  chapter: number;
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

export const getInitialChapterSessionMode = ({
  audioEnabled,
  hasText,
  autoplayAudio,
  preferredMode,
  bookId,
  chapter,
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

  if (activeAudioBookId === bookId && activeAudioChapter === chapter) {
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
}: EstimatedFollowAlongVerseInput): number | null => {
  if (verses.length === 0) {
    return fallbackVerse ?? null;
  }

  if (duration <= 0 || Number.isNaN(currentPosition) || currentPosition < 0) {
    return fallbackVerse ?? verses[0]?.verse ?? null;
  }

  const totalWeight = verses.reduce((sum, verse) => sum + getVerseWeight(verse), 0);
  if (totalWeight <= 0) {
    return fallbackVerse ?? verses[0]?.verse ?? null;
  }

  const progressRatio = Math.max(0, Math.min(currentPosition / duration, 0.999999));
  const weightedProgress = progressRatio * totalWeight;

  let cumulativeWeight = 0;
  for (const verse of verses) {
    cumulativeWeight += getVerseWeight(verse);
    if (weightedProgress < cumulativeWeight) {
      return verse.verse;
    }
  }

  return verses[verses.length - 1]?.verse ?? fallbackVerse ?? null;
};

export const shouldAutoplayChapterAudio = ({
  autoplayAudio,
  audioEnabled,
  isLoading,
  bookId,
  chapter,
  activeAudioBookId,
  activeAudioChapter,
}: ShouldAutoplayChapterAudioInput): boolean => {
  if (!autoplayAudio || !audioEnabled || isLoading) {
    return false;
  }

  return !(activeAudioBookId === bookId && activeAudioChapter === chapter);
};

export const shouldTransferActiveAudioOnChapterChange = ({
  audioEnabled,
  isCurrentAudioChapter,
}: ShouldTransferActiveAudioOnChapterChangeInput): boolean =>
  audioEnabled && isCurrentAudioChapter;

export const shouldSyncReaderToActiveAudioChapter = ({
  audioEnabled,
  bookId,
  chapter,
  activeAudioBookId,
  activeAudioChapter,
  previousActiveAudioBookId,
  previousActiveAudioChapter,
}: ShouldSyncReaderToActiveAudioChapterInput): boolean => {
  if (!audioEnabled || activeAudioBookId !== bookId || activeAudioChapter == null) {
    return false;
  }

  if (activeAudioChapter === chapter) {
    return false;
  }

  return previousActiveAudioBookId === bookId && previousActiveAudioChapter === chapter;
};

function getVerseWeight(verse: Verse): number {
  const headingWeight = verse.heading?.trim().length ?? 0;
  const textWeight = verse.text.trim().length;
  return Math.max(textWeight + headingWeight, 1);
}
