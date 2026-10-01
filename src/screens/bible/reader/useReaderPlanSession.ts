import type { AudioPlaybackSequenceEntry } from '../../../types/audio';
import type { ListeningHistoryEntry } from '../../../stores/libraryModel';
import type {
  ReadingPlanProgress,
  ReadingPlansStoreState,
  PlanSessionKey,
  RhythmSessionContext,
} from '../../../services/plans/types';
import type { ViewStyle } from 'react-native';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  READING_PLAN_ENTRIES_BY_PLAN_ID,
  readingPlans,
} from '../../../data/readingPlans.generated';
import {
  buildPlanDayPlaybackSequenceEntries,
  getCurrentPlanDaySummary,
  getPlanChapterListenStatus,
  getRhythmSessionSegmentAtIndex,
  PLAN_LISTEN_COMPLETION_THRESHOLD,
  resolvePlaybackSequenceIndex,
} from '../../../services/plans/readingPlanActivity';
import { getPlanChapterFocusVerse } from '../../../services/plans';
import {
  buildPlanSessionCompletionKey,
  getPlanCompletionEntryKey,
  getDaySessionEntries,
  isRecurringPlan,
  isMultiSessionPlan,
} from '../../../services/plans/readingPlanModel';
import type { RootTabNavigationHandle } from './readerConstants';

export interface UseReaderPlanSessionInput {
  activeChapterKey: string;
  activePlanId: string | undefined;
  activePlanProgress: ReadingPlanProgress | null;
  bookId: string;
  chapter: number;
  chaptersRead: Record<string, number>;
  chaptersListened?: Record<string, number>;
  getRootTabBarStyle: (collapseProgress: number) => ViewStyle;
  getRootTabNavigation: () => RootTabNavigationHandle;
  listeningHistory: ListeningHistoryEntry[];
  planDayNumber: number | undefined;
  planSessionKey: PlanSessionKey | undefined;
  planOccurrenceKey?: string;
  playbackSequenceEntries: AudioPlaybackSequenceEntry[];
  requestedFocusVerse: number | undefined;
  returnToPlanOnComplete: boolean;
  sessionContext: RhythmSessionContext | undefined;
  setPlanDayResume: ReadingPlansStoreState['setPlanDayResume'];
  /** The screen's local "now", refreshed at midnight and on foreground (useLocalToday). */
  today: Date;
  /** `today` as a local date key. */
  todayDateKey: string;
}

/** Where the reader sits in a reading plan or rhythm session: the day's and session's chapters, titles and progress, the route params that keep the session while moving chapters, and the plan-mode tab bar and resume point. */
export function useReaderPlanSession({
  activeChapterKey,
  activePlanId,
  activePlanProgress,
  bookId,
  chapter,
  chaptersRead,
  chaptersListened,
  getRootTabBarStyle,
  getRootTabNavigation,
  listeningHistory,
  planDayNumber,
  planSessionKey,
  planOccurrenceKey,
  playbackSequenceEntries,
  requestedFocusVerse,
  returnToPlanOnComplete,
  sessionContext,
  setPlanDayResume,
  today,
  todayDateKey,
}: UseReaderPlanSessionInput) {
  const { t } = useTranslation();
  const activeRhythmSession = sessionContext?.type === 'rhythm' ? sessionContext : null;
  const activePlanEntries = useMemo(
    () => (activePlanId ? (READING_PLAN_ENTRIES_BY_PLAN_ID.get(activePlanId) ?? []) : []),
    [activePlanId]
  );
  const activePlanRecord = useMemo(
    () => (activePlanId ? (readingPlans.find((plan) => plan.id === activePlanId) ?? null) : null),
    [activePlanId]
  );
  const activePlanIsMultiSession = isMultiSessionPlan(activePlanRecord);
  // A mounted screen's date snapshot can retain its midnight hour after grace expires.
  // Use the same current clock as completion actions when saving the occurrence.
  const planDayResumeOccurrenceKey =
    activePlanRecord && isRecurringPlan(activePlanRecord) && typeof planDayNumber === 'number'
      ? getPlanCompletionEntryKey(activePlanRecord, planDayNumber, undefined, planOccurrenceKey)
      : undefined;
  const activePlanDayEntries = useMemo(
    () =>
      typeof planDayNumber === 'number'
        ? activePlanEntries.filter((entry) => entry.day_number === planDayNumber)
        : [],
    [activePlanEntries, planDayNumber]
  );
  const activePlanSessionGroups = useMemo(
    () =>
      typeof planDayNumber === 'number'
        ? getDaySessionEntries(activePlanEntries, planDayNumber)
        : [],
    [activePlanEntries, planDayNumber]
  );
  const activePlanSessionKey = useMemo(
    () =>
      activePlanIsMultiSession
        ? (planSessionKey ?? activePlanSessionGroups[0]?.sessionKey ?? null)
        : null,
    [activePlanIsMultiSession, activePlanSessionGroups, planSessionKey]
  );
  const activePlanSessionEntries = useMemo(() => {
    if (!activePlanIsMultiSession || !activePlanSessionKey) {
      return activePlanDayEntries;
    }

    return (
      activePlanSessionGroups.find((group) => group.sessionKey === activePlanSessionKey)?.entries ??
      activePlanDayEntries
    );
  }, [
    activePlanDayEntries,
    activePlanIsMultiSession,
    activePlanSessionGroups,
    activePlanSessionKey,
  ]);
  const activePlanDayChapterItems = useMemo(
    () =>
      activePlanSessionEntries.flatMap((entry) => {
        const endChapter = entry.chapter_end ?? entry.chapter_start;
        const chapterItems: Array<{ bookId: string; chapter: number; entryId: string }> = [];

        for (
          let chapterNumber = entry.chapter_start;
          chapterNumber <= endChapter;
          chapterNumber += 1
        ) {
          chapterItems.push({
            bookId: entry.book,
            chapter: chapterNumber,
            entryId: entry.id,
          });
        }

        return chapterItems;
      }),
    [activePlanSessionEntries]
  );
  const activePlanChapterIndex = useMemo(
    () =>
      activePlanDayChapterItems.findIndex(
        (item) => item.bookId === bookId && item.chapter === chapter
      ),
    [activePlanDayChapterItems, bookId, chapter]
  );
  // Route params outlive an account switch. Progress is read from the signed-in owner's
  // bucket, so no row means the plan is not this account's (a guest's plans are merged into
  // the account at sign-in, so their row, and the session, carry over): read as a plain reader.
  const isInActivePlanSession =
    Boolean(activePlanId) &&
    activePlanProgress != null &&
    typeof planDayNumber === 'number' &&
    returnToPlanOnComplete &&
    activePlanChapterIndex >= 0;
  const activePlanTitle = activePlanRecord
    ? t(activePlanRecord.title_key as Parameters<typeof t>[0], {
        defaultValue: activePlanRecord.title_key,
      })
    : null;
  const showPlanSessionChrome =
    isInActivePlanSession &&
    activePlanTitle != null &&
    typeof planDayNumber === 'number' &&
    activePlanDayChapterItems.length > 0;
  const isLastPlanChapter = activePlanChapterIndex === activePlanDayChapterItems.length - 1;
  const activePlanPlaybackSequenceEntries = useMemo(() => {
    if (showPlanSessionChrome && !activeRhythmSession) {
      return buildPlanDayPlaybackSequenceEntries(activePlanSessionEntries);
    }

    return playbackSequenceEntries;
  }, [
    activePlanSessionEntries,
    activeRhythmSession,
    playbackSequenceEntries,
    showPlanSessionChrome,
  ]);
  const playbackSequenceEntriesForAudio = useMemo(() => {
    if (activeRhythmSession) {
      const activeSegment =
        getRhythmSessionSegmentAtIndex(
          activeRhythmSession,
          resolvePlaybackSequenceIndex({
            playbackSequenceEntries,
            bookId,
            chapter,
            session: activeRhythmSession,
            preferredPlanId: activePlanId,
            preferredDayNumber: planDayNumber,
          })
        ) ??
        (activePlanId && typeof planDayNumber === 'number'
          ? (activeRhythmSession.segments.find(
              (segment) => segment.planId === activePlanId && segment.dayNumber === planDayNumber
            ) ?? null)
          : null);

      if (activeSegment) {
        return playbackSequenceEntries.slice(activeSegment.startIndex, activeSegment.endIndex);
      }
    }

    return activePlanPlaybackSequenceEntries;
  }, [
    activePlanId,
    activePlanPlaybackSequenceEntries,
    activeRhythmSession,
    bookId,
    chapter,
    planDayNumber,
    playbackSequenceEntries,
  ]);
  useEffect(() => {
    const rootTabNavigation = getRootTabNavigation();
    if (!rootTabNavigation) {
      return;
    }

    if (showPlanSessionChrome) {
      rootTabNavigation.setOptions({
        tabBarStyle: { display: 'none' },
      });

      return () => {
        rootTabNavigation.setOptions({
          tabBarStyle: getRootTabBarStyle(0),
        });
      };
    }

    return undefined;
  }, [getRootTabBarStyle, getRootTabNavigation, showPlanSessionChrome]);
  useEffect(() => {
    // No progress means this account is not in the plan: a reader left open across an
    // account switch still names the previous account's plan session.
    if (
      !activePlanId ||
      !activePlanProgress ||
      typeof planDayNumber !== 'number' ||
      activePlanChapterIndex < 0
    ) {
      return;
    }

    setPlanDayResume(activePlanId, planDayNumber, bookId, chapter, planDayResumeOccurrenceKey);
  }, [
    activePlanChapterIndex,
    activePlanId,
    activePlanProgress,
    bookId,
    chapter,
    planDayNumber,
    planDayResumeOccurrenceKey,
    setPlanDayResume,
  ]);
  const activePlanDaySummary = useMemo(() => {
    if (!activePlanId || typeof planDayNumber !== 'number' || !activePlanProgress) {
      return null;
    }

    return getCurrentPlanDaySummary({
      plan: activePlanRecord,
      entries: activePlanEntries,
      progress: activePlanProgress,
      chaptersRead,
      chaptersListened,
      listeningHistory,
      dayNumber: planDayNumber,
      occurrenceKey: planOccurrenceKey,
      today,
    });
  }, [
    activePlanEntries,
    activePlanId,
    activePlanRecord,
    activePlanProgress,
    chaptersRead,
    chaptersListened,
    listeningHistory,
    planDayNumber,
    planOccurrenceKey,
    today,
  ]);
  const activePlanSessionSummary = useMemo(
    () =>
      activePlanSessionKey
        ? (activePlanDaySummary?.sessionSummaries.find(
            (session) => session.sessionKey === activePlanSessionKey
          ) ?? null)
        : null,
    [activePlanDaySummary, activePlanSessionKey]
  );
  const focusVerse =
    requestedFocusVerse ?? getPlanChapterFocusVerse(activePlanSessionEntries, bookId, chapter);
  const hasOtherIncompletePlanSessions =
    activePlanRecord != null &&
    planDayNumber != null &&
    activePlanIsMultiSession &&
    activePlanSessionGroups.some(
      (group) =>
        group.sessionKey !== activePlanSessionKey &&
        !activePlanProgress?.completed_sessions?.[
          buildPlanSessionCompletionKey(
            activePlanRecord,
            planDayNumber,
            group.sessionKey,
            undefined,
            planOccurrenceKey
          )
        ]
    );
  const activePlanSessionTitle = activePlanSessionKey
    ? t(
        activePlanSessionKey === 'morning'
          ? 'readingPlans.morningLabel'
          : activePlanSessionKey === 'midday'
            ? 'readingPlans.middayLabel'
            : 'readingPlans.eveningLabel',
        {
          defaultValue:
            activePlanSessionKey.charAt(0).toUpperCase() + activePlanSessionKey.slice(1),
        }
      )
    : null;
  const resolvePlanSessionRouteParams = useCallback(
    (nextBookId: string, nextChapter: number) => {
      if (activeRhythmSession) {
        const nextPlaybackIndex = resolvePlaybackSequenceIndex({
          playbackSequenceEntries: activePlanPlaybackSequenceEntries,
          bookId: nextBookId,
          chapter: nextChapter,
          session: activeRhythmSession,
          preferredPlanId: activePlanId,
          preferredDayNumber: planDayNumber,
        });
        const nextSegment = getRhythmSessionSegmentAtIndex(activeRhythmSession, nextPlaybackIndex);

        if (!nextSegment) {
          return {};
        }

        return {
          planId: nextSegment.type === 'plan' ? nextSegment.planId : undefined,
          planDayNumber: nextSegment.type === 'plan' ? nextSegment.dayNumber : undefined,
          planOccurrenceKey: nextSegment.type === 'plan' ? nextSegment.occurrenceKey : undefined,
          returnToPlanOnComplete: true,
          sessionContext: activeRhythmSession,
        };
      }

      if (
        activePlanId &&
        activePlanProgress &&
        typeof planDayNumber === 'number' &&
        returnToPlanOnComplete
      ) {
        return {
          planId: activePlanId,
          planDayNumber,
          ...(planOccurrenceKey ? { planOccurrenceKey } : {}),
          ...(activePlanSessionKey ? { planSessionKey: activePlanSessionKey } : {}),
          returnToPlanOnComplete: true,
        };
      }

      return {};
    },
    [
      activePlanId,
      activePlanProgress,
      activePlanSessionKey,
      activeRhythmSession,
      planDayNumber,
      planOccurrenceKey,
      activePlanPlaybackSequenceEntries,
      returnToPlanOnComplete,
    ]
  );

  const currentChapterListenStatus = useMemo(() => {
    if (!activePlanDaySummary) {
      return null;
    }

    const targetSummary = activePlanSessionSummary ?? activePlanDaySummary;

    return getPlanChapterListenStatus({
      chapterKey: activeChapterKey,
      bookId,
      chapter,
      targetChapterKeys: targetSummary.targetChapterKeys,
      completedChapterKeys: targetSummary.completedChapterKeys,
      chaptersListened,
      listeningHistory,
      dateKey: todayDateKey,
      listenCompletionThreshold: PLAN_LISTEN_COMPLETION_THRESHOLD,
    });
  }, [
    activeChapterKey,
    activePlanDaySummary,
    activePlanSessionSummary,
    bookId,
    chapter,
    chaptersListened,
    listeningHistory,
    todayDateKey,
  ]);

  return {
    activePlanChapterIndex,
    activePlanDayChapterItems,
    activePlanDaySummary,
    activePlanIsMultiSession,
    activePlanPlaybackSequenceEntries,
    activePlanSessionEntries,
    activePlanSessionKey,
    activePlanSessionSummary,
    activePlanSessionTitle,
    activePlanTitle,
    activeRhythmSession,
    currentChapterListenStatus,
    focusVerse,
    hasOtherIncompletePlanSessions,
    isLastPlanChapter,
    playbackSequenceEntriesForAudio,
    resolvePlanSessionRouteParams,
    showPlanSessionChrome,
  };
}
