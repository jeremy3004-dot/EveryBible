import type { AudioChapterMap } from '../../../services/bible/contentAvailability';
import type { AudioPlaybackSequenceEntry } from '../../../types/audio';
import type { ChapterPresentationMode } from '../../../services/bible/presentation';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { PlanSessionKey, RhythmSessionContext } from '../../../services/plans/types';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdjacentBibleChapter, getTranslatedBookName } from '../../../constants';
import { findAdjacentAvailableChapter } from '../../../services/bible/contentAvailability';
import { useAudioStore } from '../../../stores/audioStore';
import { getAdjacentAudioPlaybackSequenceEntry } from '../../../stores/audioPlaybackSequenceModel';
import { announceForAccessibility } from '../../../utils/a11y';
import type { ReaderAudioPositionSnapshot } from '../ReaderAudioPositionParts';
import {
  buildReaderChapterRouteParams,
  getPlanSessionTrailingActionState,
  isActiveAudioTrackMatch,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
} from '../bibleReaderModel';
import { navigateListenChapter } from '../readerListenNavigation';
import { useReaderSwipeNavigation } from './useReaderSwipeNavigation';
import type { NavigationProp } from './readerConstants';

export interface UseReaderChapterNavigationInput {
  activeAudioBookId: string | null;
  activePlanId: string | undefined;
  activePlanPlaybackSequenceEntries: AudioPlaybackSequenceEntry[];
  activeRhythmSession: RhythmSessionContext | null;
  audioChapterMap: AudioChapterMap | undefined;
  audioPositionRef: RefObject<ReaderAudioPositionSnapshot>;
  bookId: string;
  canShowTranslationSheet: true;
  chapter: number;
  chapterPresentationMode: ChapterPresentationMode;
  chapterSessionMode: 'listen' | 'read';
  currentTranslation: string;
  handleCompletePlanDay: () => Promise<void>;
  hasOtherIncompletePlanSessions: boolean;
  isCurrentAudioChapter: boolean;
  isLastPlanChapter: boolean;
  lastPlayedBookId: string | null;
  lastPlayedChapter: number | null;
  lastPlayedTranslationId: string | null;
  navigation: NavigationProp;
  nextChapter: () => Promise<AudioPlaybackSequenceEntry | null>;
  playChapter: (bookId: string, chapter: number, verse?: number | undefined) => Promise<void>;
  previousChapter: () => Promise<AudioPlaybackSequenceEntry | null>;
  resetFollowAlongClamp: () => void;
  resolvePlanSessionRouteParams: (
    nextBookId: string,
    nextChapter: number
  ) =>
    | {
        planId?: undefined;
        planDayNumber?: undefined;
        returnToPlanOnComplete?: undefined;
        sessionContext?: undefined;
      }
    | {
        planId: string | undefined;
        planDayNumber: number | undefined;
        returnToPlanOnComplete: boolean;
        sessionContext: RhythmSessionContext;
      }
    | {
        returnToPlanOnComplete: boolean;
        planSessionKey?: PlanSessionKey | undefined;
        planId: string;
        planDayNumber: number;
        sessionContext?: undefined;
      };
  seekTo: (requestedPositionMs: number) => Promise<void>;
  setShowChapterActionsSheet: Dispatch<SetStateAction<boolean>>;
  setShowFontSizeSheet: Dispatch<SetStateAction<boolean>>;
  setShowTranslationSheet: Dispatch<SetStateAction<boolean>>;
  showPlanSessionChrome: boolean;
  togglePlayPause: () => Promise<void>;
}

/** Moving between chapters: the previous and next targets (within a plan or rhythm session, or over the chapters the translation covers), the read-mode arrows, swipes and listen transport, and the player bar's next action. */
export function useReaderChapterNavigation({
  activeAudioBookId,
  activePlanId,
  activePlanPlaybackSequenceEntries,
  activeRhythmSession,
  audioChapterMap,
  audioPositionRef,
  bookId,
  canShowTranslationSheet,
  chapter,
  chapterPresentationMode,
  chapterSessionMode,
  currentTranslation,
  handleCompletePlanDay,
  hasOtherIncompletePlanSessions,
  isCurrentAudioChapter,
  isLastPlanChapter,
  lastPlayedBookId,
  lastPlayedChapter,
  lastPlayedTranslationId,
  navigation,
  nextChapter,
  playChapter,
  previousChapter,
  resetFollowAlongClamp,
  resolvePlanSessionRouteParams,
  seekTo,
  setShowChapterActionsSheet,
  setShowFontSizeSheet,
  setShowTranslationSheet,
  showPlanSessionChrome,
  togglePlayPause,
}: UseReaderChapterNavigationInput) {
  const { t } = useTranslation();
  const previousSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    activePlanPlaybackSequenceEntries,
    bookId,
    chapter,
    -1
  );
  const nextSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    activePlanPlaybackSequenceEntries,
    bookId,
    chapter,
    1
  );
  const shouldConstrainChapterNavigationToSession =
    activeRhythmSession != null || showPlanSessionChrome;
  // With an exact chapter map the chevrons skip past everything the translation does not
  // cover — Bhujel runs Joshua 2 past Judges and Ruth to 1 Samuel 1 — and go dead at the ends
  // instead of walking the reader into a chapter with nothing to show.
  const resolveChapterNavigationTarget = (direction: -1 | 1) => {
    if (shouldConstrainChapterNavigationToSession) {
      return null;
    }

    return audioChapterMap
      ? findAdjacentAvailableChapter(bookId, chapter, direction, audioChapterMap)
      : getAdjacentBibleChapter(bookId, chapter, direction);
  };
  const previousNavigationTarget = previousSequenceEntry ?? resolveChapterNavigationTarget(-1);
  const nextNavigationTarget = nextSequenceEntry ?? resolveChapterNavigationTarget(1);
  const hasPrevChapter = previousNavigationTarget != null;
  const hasNextChapter = nextNavigationTarget != null;
  const shouldFillReaderCanvas = chapterPresentationMode === 'audio-first';
  const syncReaderReference = (nextBookId: string, nextChapter: number) => {
    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: nextBookId,
        chapter: nextChapter,
        preferredMode: chapterSessionMode,
        ...resolvePlanSessionRouteParams(nextBookId, nextChapter),
      })
    );
  };

  const handlePlayDisplayedChapter = () => {
    // After a relaunch nothing is loaded and only the persisted last track remains.
    // togglePlayPause resumes it from its saved offset; playChapter would restart it.
    const resumesLastPlayedChapter =
      activeAudioBookId == null &&
      isActiveAudioTrackMatch({
        translationId: currentTranslation,
        bookId,
        chapter,
        activeAudioTranslationId: lastPlayedTranslationId,
        activeAudioBookId: lastPlayedBookId,
        activeAudioChapter: lastPlayedChapter,
      });
    if (!isCurrentAudioChapter && !resumesLastPlayedChapter) {
      void playChapter(bookId, chapter);
      return;
    }

    void togglePlayPause();
  };

  const handleListenModeSeek = useCallback(
    (positionMs: number) => {
      const { duration: liveDurationMs } = audioPositionRef.current;
      if (liveDurationMs <= 0 || !isCurrentAudioChapter) {
        return;
      }

      // Allow the verse highlight to jump backward after a user seek
      resetFollowAlongClamp();
      void seekTo(Math.max(0, Math.min(liveDurationMs, positionMs)));
    },
    [isCurrentAudioChapter, resetFollowAlongClamp, seekTo, audioPositionRef]
  );

  const listenNavigation = {
    isCurrentAudioChapter,
    getAudioStatus: () => useAudioStore.getState().status,
    playChapter,
    syncReaderReference,
    // The arrows keep focus while the chapter swaps under them; say where they went,
    // as the read-mode swipe does.
    announceTarget: (target: { bookId: string; chapter: number }) => {
      announceForAccessibility(`${getTranslatedBookName(target.bookId, t)} ${target.chapter}`);
    },
  };

  const handlePreviousListenChapter = () => {
    return navigateListenChapter({
      ...listenNavigation,
      stepPlayer: previousChapter,
      fallbackTarget: previousNavigationTarget,
    });
  };

  const handleNextListenChapter = () => {
    return navigateListenChapter({
      ...listenNavigation,
      stepPlayer: nextChapter,
      fallbackTarget: nextNavigationTarget,
    });
  };

  const handleReadChapterNavigation = async (
    target: { bookId: string; chapter: number } | null
  ) => {
    if (!target) {
      return;
    }

    // chapter_completed was a write-only event (no RPC/admin consumer) gated on
    // this fragile read-mode navigation path; chapter completion is derived from
    // reading_ended instead (see P1 S7). Emission removed.

    setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'chapterChange'));
    setShowTranslationSheet((current) =>
      getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
    );
    setShowChapterActionsSheet(false);

    syncReaderReference(target.bookId, target.chapter);
  };

  const handlePreviousReadChapter = async () => {
    if (isCurrentAudioChapter) {
      const target = await previousChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    await handleReadChapterNavigation(previousNavigationTarget);
  };

  const handleNextReadChapter = async () => {
    if (
      showPlanSessionChrome &&
      chapterSessionMode === 'read' &&
      planReadDockTrailingActionState?.showCompletionAction &&
      hasPlanReadDockNextAction
    ) {
      await handleCompletePlanDay();
      return;
    }

    if (isCurrentAudioChapter) {
      const target = await nextChapter();
      if (target) {
        syncReaderReference(target.bookId, target.chapter);
      }
      return;
    }

    await handleReadChapterNavigation(nextNavigationTarget);
  };
  const { handleExitPlanSession, swipeGesture, swipeStyle } = useReaderSwipeNavigation({
    activePlanId,
    activeRhythmSession,
    handleNextReadChapter,
    handlePreviousReadChapter,
    hasNextChapter,
    hasPrevChapter,
    nextNavigationTarget,
    previousNavigationTarget,
    showPlanSessionChrome,
  });

  // In a read-mode plan session the player bar's next control becomes the day's
  // (or session's) completion step on its last chapter.
  const planReadDockTrailingActionState =
    showPlanSessionChrome && chapterSessionMode === 'read'
      ? getPlanSessionTrailingActionState({
          isLastPlanChapter,
          hasNextChapter,
        })
      : null;
  const hasPlanReadDockNextAction = Boolean(
    planReadDockTrailingActionState?.showCompletionAction &&
    planReadDockTrailingActionState.isEnabled
  );
  const showPlanReadDockSessionCompletionCopy = hasOtherIncompletePlanSessions;
  const readerBarNextIsCompletion = planReadDockTrailingActionState?.iconName === 'checkmark';
  const readerBarNextAccessibilityLabel =
    showPlanSessionChrome &&
    chapterSessionMode === 'read' &&
    planReadDockTrailingActionState?.showCompletionAction
      ? showPlanReadDockSessionCompletionCopy
        ? t('readingPlans.completeSessionCta', {
            defaultValue: 'Complete session',
          })
        : t('readingPlans.completeDayCta', {
            defaultValue: 'Complete day',
          })
      : t('bible.nextChapterHint');
  const readerBarNextAccessibilityHint =
    showPlanSessionChrome &&
    chapterSessionMode === 'read' &&
    planReadDockTrailingActionState?.showCompletionAction
      ? showPlanReadDockSessionCompletionCopy
        ? t('readingPlans.completeSessionHint')
        : t('readingPlans.completeDayHint')
      : null;
  const hasReaderBarNextChapter =
    showPlanSessionChrome && chapterSessionMode === 'read'
      ? hasNextChapter || hasPlanReadDockNextAction
      : hasNextChapter;

  return {
    handleExitPlanSession,
    handleListenModeSeek,
    handleNextListenChapter,
    handleNextReadChapter,
    handlePlayDisplayedChapter,
    handlePreviousListenChapter,
    handlePreviousReadChapter,
    hasNextChapter,
    hasPrevChapter,
    hasReaderBarNextChapter,
    readerBarNextAccessibilityHint,
    readerBarNextAccessibilityLabel,
    readerBarNextIsCompletion,
    shouldFillReaderCanvas,
    swipeGesture,
    swipeStyle,
  };
}
