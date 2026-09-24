import { computeNextDay, isPlanCompleted } from '../../services/plans/readingPlanModel';
import type {
  PlanSessionKey,
  ReadingPlanProgress,
  ReadingPlansPersistedState,
  ReadingPlansStoreState,
} from '../../services/plans/types';

export type SessionCompletionOptions = Parameters<ReadingPlansStoreState['markSessionComplete']>[3];

type ProgressCollections = Pick<
  ReadingPlansStoreState,
  'enrolledPlanIds' | 'completedPlanIds' | 'progressByPlanId'
>;

export const createEmptyState = (): ReadingPlansPersistedState => ({
  enrolledPlanIds: [],
  savedPlanIds: [],
  completedPlanIds: [],
  progressByPlanId: {},
  planDayResumeByKey: {},
  groupPlansByGroupId: {},
  rhythmsById: {},
  rhythmOrder: [],
  pendingUnenrollPlanIds: [],
  pendingUnenrollAtByPlanId: {},
  serverLeftAtByPlanId: {},
});

/** The record without `key`, or the same record when it has no such key. */
export const withoutKey = (record: Record<string, string>, key: string): Record<string, string> => {
  if (!(key in record)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
};

export const buildPlanDayResumeKey = (planId: string, dayNumber: number): string =>
  `${planId}:${dayNumber}`;

/**
 * The earliest a re-join may start: 1 ms past the latest of the leaves it follows (the queued
 * one on this phone's clock, the confirmed one on the server's), or undefined with neither.
 */
export const getRejoinNotBeforeMs = (...leftAts: Array<string | undefined>): number | undefined => {
  const leftMs = leftAts
    .map((leftAt) => Date.parse(leftAt ?? ''))
    .filter((ms) => Number.isFinite(ms));
  return leftMs.length > 0 ? Math.max(...leftMs) + 1 : undefined;
};

/**
 * A fresh enrolment row, started now or, when given, no earlier than `notBeforeMs` (a re-join
 * must start strictly after the leave it follows).
 */
export const createProgressRecord = (planId: string, notBeforeMs?: number): ReadingPlanProgress => {
  const now = new Date(Math.max(Date.now(), notBeforeMs ?? 0)).toISOString();

  return {
    id: `reading-plan-progress-${planId}`,
    plan_id: planId,
    started_at: now,
    completed_entries: {},
    completed_sessions: {},
    current_day: 1,
    current_session: null,
    is_completed: false,
    completed_at: null,
    synced_at: now,
  };
};

export const normalizeProgressRecord = (progress: ReadingPlanProgress): ReadingPlanProgress => ({
  ...progress,
  completed_sessions: progress.completed_sessions ?? {},
  current_session: progress.current_session ?? null,
});

/** Stores one plan's row, enrolling the plan and keeping completedPlanIds in step with it. */
export const applyProgressUpdate = (
  state: ProgressCollections,
  progress: ReadingPlanProgress
): ProgressCollections => {
  const normalizedProgress = normalizeProgressRecord(progress);
  const enrolledPlanIds = state.enrolledPlanIds.includes(normalizedProgress.plan_id)
    ? state.enrolledPlanIds
    : [...state.enrolledPlanIds, normalizedProgress.plan_id];

  const completedPlanIds = normalizedProgress.is_completed
    ? state.completedPlanIds.includes(normalizedProgress.plan_id)
      ? state.completedPlanIds
      : [...state.completedPlanIds, normalizedProgress.plan_id]
    : state.completedPlanIds.filter((planId) => planId !== normalizedProgress.plan_id);

  return {
    enrolledPlanIds,
    completedPlanIds,
    progressByPlanId: {
      ...state.progressByPlanId,
      [normalizedProgress.plan_id]: normalizedProgress,
    },
  };
};

export const removePlanFromCollections = (
  state: ProgressCollections,
  planId: string
): ProgressCollections => ({
  enrolledPlanIds: state.enrolledPlanIds.filter((id) => id !== planId),
  completedPlanIds: state.completedPlanIds.filter((id) => id !== planId),
  progressByPlanId: Object.fromEntries(
    Object.entries(state.progressByPlanId).filter(([id]) => id !== planId)
  ),
});

export const removePlanDayResumeEntries = (
  state: Pick<ReadingPlansStoreState, 'planDayResumeByKey'>,
  planId: string
): Pick<ReadingPlansStoreState, 'planDayResumeByKey'> => ({
  planDayResumeByKey: Object.fromEntries(
    Object.entries(state.planDayResumeByKey).filter(([key]) => !key.startsWith(`${planId}:`))
  ),
});

/** The progress collections rebuilt from exactly these rows, in their order. */
export const replaceProgressCollections = (
  progressList: ReadingPlanProgress[]
): ProgressCollections => {
  const normalizedProgressList = progressList.map(normalizeProgressRecord);
  const progressByPlanId = Object.fromEntries(
    normalizedProgressList.map((progress) => [progress.plan_id, progress])
  );

  return {
    enrolledPlanIds: normalizedProgressList.map((progress) => progress.plan_id),
    completedPlanIds: normalizedProgressList
      .filter((progress) => progress.is_completed)
      .map((progress) => progress.plan_id),
    progressByPlanId,
  };
};

/** The row after completing a numbered day of a fixed-length plan at `now`. */
export const completeDay = (
  existing: ReadingPlanProgress,
  dayNumber: number,
  totalDays: number,
  now: string
): ReadingPlanProgress => {
  const completed_entries: Record<string, string> = {
    ...existing.completed_entries,
    [String(dayNumber)]: now,
  };

  return {
    ...existing,
    completed_entries,
    current_session: null,
    current_day: computeNextDay(existing.current_day, dayNumber),
    is_completed: isPlanCompleted(totalDays, Object.keys(completed_entries).length),
    completed_at: isPlanCompleted(totalDays, Object.keys(completed_entries).length) ? now : null,
    synced_at: now,
  };
};

/**
 * The row after ticking one session of a day at `now`. The final session also completes the
 * day; only a fixed-length plan advances its day and can finish.
 */
export const completeSession = (
  existing: ReadingPlanProgress,
  dayNumber: number,
  sessionKey: PlanSessionKey,
  options: SessionCompletionOptions,
  now: string
): ReadingPlanProgress => {
  const completed_sessions: Record<string, string> = {
    ...(existing.completed_sessions ?? {}),
    [options.completionKey]: now,
  };
  const completed_entries = options.isFinalSession
    ? {
        ...existing.completed_entries,
        [options.dayCompletionKey]: now,
      }
    : existing.completed_entries;
  const completedDayCount = Object.keys(completed_entries).length;
  const isCompleted =
    options.isFinalSession && options.advanceDayOnCompletion
      ? isPlanCompleted(options.totalDays, completedDayCount)
      : false;

  return {
    ...existing,
    completed_entries,
    completed_sessions,
    current_day:
      options.isFinalSession && options.advanceDayOnCompletion
        ? computeNextDay(existing.current_day, dayNumber)
        : Math.max(dayNumber, 1),
    current_session: options.isFinalSession ? null : (options.nextSessionKey ?? sessionKey),
    is_completed: isCompleted,
    completed_at: isCompleted ? now : null,
    synced_at: now,
  };
};

/** The row after completing a recurring plan's dated entry at `now`; it never finishes. */
export const completeRecurringDay = (
  existing: ReadingPlanProgress,
  completionKey: string,
  dayNumber: number,
  now: string
): ReadingPlanProgress => ({
  ...existing,
  completed_entries: {
    ...existing.completed_entries,
    [completionKey]: now,
  },
  current_day: Math.max(dayNumber, 1),
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: now,
});
