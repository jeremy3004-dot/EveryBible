import type { AudioReturnTarget } from '../../../types/audio';
import type { PlanSessionKey, RhythmSessionContext } from '../../../services/plans/types';
import type { AudioStatus } from '../../../types/audio';
import { useEffect } from 'react';

export interface UseAudioReturnTargetInput {
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
  activeAudioTranslationId: string | null;
  bookId: string;
  chapter: number;
  chapterSessionMode: 'listen' | 'read';
  currentTranslation: string;
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
  setAudioReturnTarget: (target: AudioReturnTarget) => void;
  status: AudioStatus;
}

/** Keeps the audio store's return target on the chapter being played, so the mini player can bring the listener back to it (and to its plan or rhythm session). */
export function useAudioReturnTarget({
  activeAudioBookId,
  activeAudioChapter,
  activeAudioTranslationId,
  bookId,
  chapter,
  chapterSessionMode,
  currentTranslation,
  resolvePlanSessionRouteParams,
  setAudioReturnTarget,
  status,
}: UseAudioReturnTargetInput) {
  useEffect(() => {
    const resolvedBookId = activeAudioBookId ?? bookId;
    const resolvedChapter = activeAudioChapter ?? chapter;
    const hasActivePlaybackTarget =
      resolvedBookId != null &&
      resolvedChapter != null &&
      (status === 'playing' || status === 'paused' || status === 'loading');

    if (!hasActivePlaybackTarget) {
      return;
    }

    setAudioReturnTarget({
      translationId: activeAudioTranslationId ?? currentTranslation,
      bookId: resolvedBookId,
      chapter: resolvedChapter,
      preferredMode: chapterSessionMode,
      ...resolvePlanSessionRouteParams(resolvedBookId, resolvedChapter),
    });
  }, [
    activeAudioBookId,
    activeAudioChapter,
    activeAudioTranslationId,
    bookId,
    chapter,
    chapterSessionMode,
    currentTranslation,
    resolvePlanSessionRouteParams,
    setAudioReturnTarget,
    status,
  ]);

  return {};
}
