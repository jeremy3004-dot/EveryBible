import type {
  CurrentPlanDaySummary,
  PlanChapterListenStatus,
} from '../../../services/plans/readingPlanActivity';
import type { ReadingPlanEntry } from '../../../services/plans/types';
import type { Dispatch, SetStateAction } from 'react';
import type { PlanSessionKey, ReadingPlanProgress } from '../../../services/plans/types';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getTranslatedBookName } from '../../../constants';
import { getPlanStepReadChapters } from '../../../services/plans/readingPlanActivity';
import {
  markDayComplete,
  markPlanSessionComplete,
} from '../../../services/plans/readingPlanService';
import { rootNavigationRef } from '../../../navigation/rootNavigation';

export interface UsePlanDayCompletionInput {
  activeChapterKey: string;
  activePlanChapterIndex: number;
  activePlanDaySummary: CurrentPlanDaySummary | null;
  activePlanId: string | undefined;
  activePlanIsMultiSession: boolean;
  activePlanProgress: ReadingPlanProgress | null;
  activePlanSessionEntries: ReadingPlanEntry[];
  activePlanSessionKey: PlanSessionKey | null;
  activePlanSessionSummary: CurrentPlanDaySummary['sessionSummaries'][number] | null;
  bookId: string;
  chapter: number;
  chapterSessionMode: 'listen' | 'read';
  clearAudioPlaybackSequence: () => void;
  clearPlanDayResume: (planId: string, dayNumber: number) => void;
  currentChapterListenStatus: PlanChapterListenStatus | null;
  isLastPlanChapter: boolean;
  markChapterRead: (bookId: string, chapter: number) => void;
  planDayNumber: number | undefined;
  returnToPlanOnComplete: boolean;
  setAudioTrack: (
    translationId: string | null,
    bookId: string | null,
    chapter: number | null
  ) => void;
  setListenCountedNotice: Dispatch<SetStateAction<string | null>>;
  stop: () => Promise<void>;
}

/** Finishing a plan day or session from the reader, and the 'counted for today' notice when listening completes a plan chapter. */
export function usePlanDayCompletion({
  activeChapterKey,
  activePlanChapterIndex,
  activePlanDaySummary,
  activePlanId,
  activePlanIsMultiSession,
  activePlanProgress,
  activePlanSessionEntries,
  activePlanSessionKey,
  activePlanSessionSummary,
  bookId,
  chapter,
  chapterSessionMode,
  clearAudioPlaybackSequence,
  clearPlanDayResume,
  currentChapterListenStatus,
  isLastPlanChapter,
  markChapterRead,
  planDayNumber,
  returnToPlanOnComplete,
  setAudioTrack,
  setListenCountedNotice,
  stop,
}: UsePlanDayCompletionInput) {
  const listenCountedBaselineRef = useRef<{ key: string; alreadyCountedForPlan: boolean } | null>(
    null
  );
  const planDayCompletionGuardRef = useRef<string | null>(null);
  const listenCountedNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastListenCountedNoticeKeyRef = useRef<string | null>(null);
  const { t } = useTranslation();
  const handleCompletePlanDay = useCallback(async () => {
    if (
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      !returnToPlanOnComplete ||
      !activePlanProgress ||
      activePlanProgress.is_completed
    ) {
      return;
    }

    if (activePlanChapterIndex < 0 || !isLastPlanChapter) {
      return;
    }

    const completionKey = `${activePlanId}:${planDayNumber}:${activePlanSessionKey ?? 'day'}:${activeChapterKey}`;
    if (planDayCompletionGuardRef.current === completionKey) {
      return;
    }

    planDayCompletionGuardRef.current = completionKey;
    try {
      // Ticking the step is the read: record it today even for chapters read on
      // an earlier day (a weekly Kathisma, a second year through the Bible), or
      // the streak and reading calendar would never see a plan reader's day.
      if (chapterSessionMode === 'read') {
        for (const read of getPlanStepReadChapters(activePlanSessionEntries)) {
          markChapterRead(read.bookId, read.chapter);
        }
      }

      // L20: both service calls apply the completion to the local plan store
      // synchronously and push to Supabase in the background, so this await resolves
      // immediately without gating navigation on an un-timed network round-trip.
      const completionResult =
        activePlanIsMultiSession && activePlanSessionKey
          ? await markPlanSessionComplete(activePlanId, planDayNumber, activePlanSessionKey)
          : await markDayComplete(activePlanId, planDayNumber);

      if (!completionResult.success) {
        return;
      }

      const shouldReturnToPlanDetail =
        activePlanIsMultiSession && Boolean(completionResult.data?.current_session);

      await stop();
      clearAudioPlaybackSequence();
      setAudioTrack(null, null, null);

      clearPlanDayResume(activePlanId, planDayNumber);

      if (!rootNavigationRef.isReady()) {
        return;
      }

      rootNavigationRef.navigate(
        'Plans',
        shouldReturnToPlanDetail
          ? {
              screen: 'PlanDetail',
              params: { planId: activePlanId },
            }
          : {
              screen: 'PlansHome',
            }
      );
    } finally {
      planDayCompletionGuardRef.current = null;
    }
  }, [
    activeChapterKey,
    activePlanChapterIndex,
    activePlanId,
    activePlanProgress,
    activePlanIsMultiSession,
    activePlanSessionEntries,
    activePlanSessionKey,
    chapterSessionMode,
    clearAudioPlaybackSequence,
    clearPlanDayResume,
    isLastPlanChapter,
    markChapterRead,
    planDayNumber,
    returnToPlanOnComplete,
    setAudioTrack,
    stop,
  ]);

  useEffect(
    () => () => {
      if (listenCountedNoticeTimeoutRef.current) {
        clearTimeout(listenCountedNoticeTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const activePlanListenTargetKeys =
      activePlanSessionSummary?.targetChapterKeys ?? activePlanDaySummary?.targetChapterKeys ?? [];

    if (
      chapterSessionMode !== 'listen' ||
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      !activePlanListenTargetKeys.includes(activeChapterKey)
    ) {
      listenCountedBaselineRef.current = null;
      setListenCountedNotice(null);
      return;
    }

    const noticeKey = `${activePlanId}:${planDayNumber}:${activeChapterKey}`;
    if (listenCountedBaselineRef.current?.key === noticeKey) {
      return;
    }

    listenCountedBaselineRef.current = {
      key: noticeKey,
      alreadyCountedForPlan:
        currentChapterListenStatus?.currentChapterListenCountedAt !== null ||
        currentChapterListenStatus?.alreadyCountedForPlan === true,
    };
    setListenCountedNotice(null);
  }, [
    activeChapterKey,
    activePlanDaySummary?.targetChapterKeys,
    activePlanSessionSummary?.targetChapterKeys,
    activePlanId,
    chapterSessionMode,
    currentChapterListenStatus,
    planDayNumber,
    listenCountedBaselineRef,
    setListenCountedNotice,
  ]);

  useEffect(() => {
    if (
      chapterSessionMode !== 'listen' ||
      !activePlanId ||
      typeof planDayNumber !== 'number' ||
      currentChapterListenStatus?.currentChapterListenCountedAt === null
    ) {
      return;
    }

    const noticeKey = `${activePlanId}:${planDayNumber}:${activeChapterKey}`;
    const baseline = listenCountedBaselineRef.current;
    if (
      !baseline ||
      baseline.key !== noticeKey ||
      baseline.alreadyCountedForPlan ||
      lastListenCountedNoticeKeyRef.current === noticeKey
    ) {
      return;
    }

    lastListenCountedNoticeKeyRef.current = noticeKey;
    const chapterReference = `${getTranslatedBookName(bookId, t)} ${chapter}`;
    setListenCountedNotice(
      t('readingPlans.listenChapterCounted', {
        reference: chapterReference,
        defaultValue: `${chapterReference} counted for today's plan`,
      })
    );

    if (listenCountedNoticeTimeoutRef.current) {
      clearTimeout(listenCountedNoticeTimeoutRef.current);
    }

    listenCountedNoticeTimeoutRef.current = setTimeout(() => {
      setListenCountedNotice((currentNotice) => (currentNotice === null ? currentNotice : null));
      listenCountedNoticeTimeoutRef.current = null;
    }, 2200);
  }, [
    activeChapterKey,
    activePlanId,
    bookId,
    chapter,
    chapterSessionMode,
    currentChapterListenStatus,
    planDayNumber,
    t,
    listenCountedBaselineRef,
    setListenCountedNotice,
  ]);

  useEffect(
    () => () => {
      if (listenCountedNoticeTimeoutRef.current) {
        clearTimeout(listenCountedNoticeTimeoutRef.current);
        listenCountedNoticeTimeoutRef.current = null;
      }
    },
    []
  );

  return { handleCompletePlanDay };
}
