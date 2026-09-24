import type { TFunction } from 'i18next';
import type { BibleStackParamList } from '../../../navigation/types';
import {
  type BuildRhythmReaderSessionResult,
  getCurrentPlanDaySummary,
  shouldAutoplayPlanDayLaunch,
} from '../../../services/plans/readingPlanActivity';
import { getLocalizedPassageTitle } from '../../../services/plans/rhythmLocalization';
import { inferRhythmSlotFromTitle, RHYTHM_SLOT_META } from '../../../services/plans/rhythmSlots';
import type {
  ReadingPlan,
  ReadingPlanEntry,
  ReadingPlanRhythm,
  ReadingPlanRhythmSessionSegment,
  UserReadingPlanProgress,
} from '../../../services/plans/types';
import type { ListeningHistoryEntry } from '../../../stores/libraryModel';
import type { AudioStatus } from '../../../types';

// The rhythm page's derivations, kept free of React so they can be locked by unit
// tests: which plans a rhythm holds, what each sequence card says, and where
// Continue Rhythm opens the reader.

export interface RhythmSegmentViewModel {
  segment: ReadingPlanRhythmSessionSegment;
  plan: ReadingPlan | null;
  entries: ReadingPlanEntry[];
  progress: UserReadingPlanProgress | null;
  currentDaySummary: ReturnType<typeof getCurrentPlanDaySummary> | null;
  title: string;
}

export type RhythmStatusPillVariant = 'neutral' | 'accent' | 'success';

/** The plan ids a rhythm holds, in sequence order. */
export function getRhythmPlanIds(rhythm: ReadingPlanRhythm | null): string[] {
  return rhythm?.items.flatMap((item) => (item.type === 'plan' ? [item.planId] : [])) ?? [];
}

export function buildPlanTitleById(plans: ReadingPlan[], t: TFunction): Record<string, string> {
  return Object.fromEntries(
    plans.map((plan) => [plan.id, t(plan.title_key as Parameters<TFunction>[0])])
  ) as Record<string, string>;
}

export interface BuildRhythmSegmentViewModelsInput {
  session: BuildRhythmReaderSessionResult;
  allPlans: ReadingPlan[];
  planEntriesById: Record<string, ReadingPlanEntry[]>;
  progressByPlanId: Record<string, UserReadingPlanProgress | null | undefined>;
  planTitleById: Record<string, string>;
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  today: Date;
  t: TFunction;
}

/** One card per segment of the session, each with today's progress when it is a plan. */
export function buildRhythmSegmentViewModels({
  session,
  allPlans,
  planEntriesById,
  progressByPlanId,
  planTitleById,
  chaptersRead,
  listeningHistory,
  today,
  t,
}: BuildRhythmSegmentViewModelsInput): RhythmSegmentViewModel[] {
  return session.sessionContext.segments.map((segment) => {
    const entries = segment.planId ? (planEntriesById[segment.planId] ?? []) : [];
    const progress = segment.planId ? (progressByPlanId[segment.planId] ?? null) : null;
    const segmentPlan = segment.planId
      ? (allPlans.find((plan) => plan.id === segment.planId) ?? null)
      : null;
    const currentDaySummary = progress
      ? getCurrentPlanDaySummary({
          plan: segmentPlan,
          entries,
          progress,
          chaptersRead,
          listeningHistory,
          dayNumber: segment.dayNumber,
          today,
        })
      : null;

    return {
      segment,
      plan: segmentPlan,
      entries,
      progress,
      currentDaySummary,
      title: getSegmentTitle(segment, planTitleById, t),
    };
  });
}

function getSegmentTitle(
  segment: ReadingPlanRhythmSessionSegment,
  planTitleById: Record<string, string>,
  t: TFunction
): string {
  if (segment.type === 'plan') {
    return planTitleById[segment.planId ?? ''] ?? segment.title;
  }
  if (!segment.bookId) {
    return segment.title;
  }
  return getLocalizedPassageTitle(
    segment.title,
    segment.bookId,
    segment.startChapter ?? 1,
    segment.endChapter ?? segment.startChapter ?? 1,
    t
  );
}

export interface RhythmPlanTally {
  completed: number;
  remaining: number;
}

export function tallyRhythmPlans(
  planIds: readonly string[],
  progressByPlanId: Record<string, UserReadingPlanProgress | null | undefined>
): RhythmPlanTally {
  const completed = planIds.filter((planId) => progressByPlanId[planId]?.is_completed).length;
  return { completed, remaining: Math.max(planIds.length - completed, 0) };
}

/** Whether Continue Rhythm has somewhere to go. */
export function hasActiveRhythmSegments(session: BuildRhythmReaderSessionResult | null): boolean {
  return Boolean(
    session &&
    session.playbackSequenceEntries.length > 0 &&
    session.startEntry &&
    session.startSegment
  );
}

export function getRhythmSlotPresentation(rhythm: ReadingPlanRhythm | null) {
  const slot = rhythm?.slot ?? inferRhythmSlotFromTitle(rhythm?.title);
  return slot ? RHYTHM_SLOT_META[slot] : null;
}

/**
 * The reader route Continue Rhythm opens: the session's first chapter with the
 * whole rhythm queued. Audio starts only for a listener who has not paused it.
 */
export function buildRhythmReaderParams(
  session: BuildRhythmReaderSessionResult | null,
  preferredMode: 'listen' | 'read',
  audioStatus: AudioStatus
): BibleStackParamList['BibleReader'] | null {
  if (!session || !session.startEntry || !session.startSegment) {
    return null;
  }

  const autoplayAudio = shouldAutoplayPlanDayLaunch({
    trigger: 'open',
    preferredMode,
    audioStatus,
  });
  const startsOnPlan = session.startSegment.type === 'plan';

  return {
    bookId: session.startEntry.bookId,
    chapter: session.startEntry.chapter,
    ...(autoplayAudio ? { autoplayAudio: true } : {}),
    preferredMode,
    playbackSequenceEntries: session.playbackSequenceEntries,
    planId: startsOnPlan ? session.startSegment.planId : undefined,
    planDayNumber: startsOnPlan ? session.startSegment.dayNumber : undefined,
    returnToPlanOnComplete: true,
    sessionContext: session.sessionContext,
  };
}

export interface RhythmSegmentCardCopy {
  statusLabel: string;
  statusVariant: RhythmStatusPillVariant;
  meta: string;
  chapterCountLabel: string;
  progressLabel: string;
  /** Today's target for a plan with progress, the chapter span for a passage. */
  body: string | null;
}

/** Everything a sequence card says, so the card itself only lays it out. */
export function getRhythmSegmentCardCopy(
  item: RhythmSegmentViewModel,
  t: TFunction
): RhythmSegmentCardCopy {
  const { segment, currentDaySummary } = item;
  const isPlan = segment.type === 'plan';
  const isCompletedPlan = isPlan && Boolean(item.progress?.is_completed);
  const completedCount = currentDaySummary?.completedChapterCount ?? 0;
  const targetCount = currentDaySummary?.targetChapterCount ?? segment.chapterKeys.length;

  const progressLabel = isPlan
    ? isCompletedPlan
      ? t('readingPlans.completed')
      : t('readingPlans.todayTargetProgress', {
          completed: completedCount,
          target: targetCount,
          defaultValue: `${completedCount}/${targetCount} chapters`,
        })
    : t('readingPlans.chapterCount', {
        count: targetCount,
        defaultValue: `${targetCount} chapters`,
      });

  let body: string | null = null;
  if (currentDaySummary) {
    body = t('readingPlans.todayTargetProgress', {
      completed: currentDaySummary.completedChapterCount,
      target: currentDaySummary.targetChapterCount,
      defaultValue: `Today's target: ${currentDaySummary.completedChapterCount}/${currentDaySummary.targetChapterCount} chapters`,
    });
  } else if (segment.type === 'passage') {
    body =
      segment.startChapter === segment.endChapter
        ? t('interface.chapterNumber', { chapter: segment.startChapter ?? 1 })
        : t('interface.chapterRange', {
            start: segment.startChapter ?? 1,
            end: segment.endChapter ?? segment.startChapter ?? 1,
          });
  }

  return {
    statusLabel: isCompletedPlan
      ? t('readingPlans.completed')
      : t('common.next', { defaultValue: 'Next' }),
    statusVariant: isCompletedPlan ? 'success' : 'accent',
    meta: isPlan
      ? t('readingPlans.dayOf', {
          current: segment.dayNumber,
          total: item.plan?.duration_days ?? segment.dayNumber,
        })
      : t('readingPlans.repeatablePassage', { defaultValue: 'Repeatable passage' }),
    chapterCountLabel: t('readingPlans.chapterCount', {
      count: segment.chapterKeys.length,
      defaultValue: `${segment.chapterKeys.length} chapters`,
    }),
    progressLabel,
    body,
  };
}
