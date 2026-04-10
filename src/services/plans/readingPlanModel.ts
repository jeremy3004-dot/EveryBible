import type { ReadingPlan, UserReadingPlanProgress } from './types';

const UNSYNCED_LOCAL_PROGRESS_GRACE_MS = 5 * 60 * 1000;
const UUID_PLAN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ---------------------------------------------------------------------------
// Pure model functions for reading plan progress — no Supabase dependency.
// These are extracted so they can be unit-tested without network or auth.
// ---------------------------------------------------------------------------

export function canSyncReadingPlanRemotely(planId: string): boolean {
  return UUID_PLAN_ID_PATTERN.test(planId.trim());
}

export function isCalendarDayOfMonthPlan(
  plan?: Pick<ReadingPlan, 'scheduleMode'> | null
): boolean {
  return plan?.scheduleMode === 'calendar-day-of-month';
}

export function getActivePlanDayNumber(
  plan: Pick<ReadingPlan, 'duration_days' | 'scheduleMode'>,
  progress?: Pick<UserReadingPlanProgress, 'current_day'> | null,
  today: Date = new Date()
): number {
  if (isCalendarDayOfMonthPlan(plan)) {
    const maxDay = plan.duration_days > 0 ? plan.duration_days : today.getDate();
    return Math.min(Math.max(today.getDate(), 1), maxDay);
  }

  return Math.max(progress?.current_day ?? 1, 1);
}

export function getPlanCompletionEntryKey(
  plan: Pick<ReadingPlan, 'scheduleMode'>,
  dayNumber: number,
  today: Date = new Date()
): string {
  return isCalendarDayOfMonthPlan(plan) ? formatLocalDateKey(today) : String(dayNumber);
}

/**
 * Computes the next current_day after completing dayNumber.
 * Always moves forward: the new current_day is max(current_day, dayNumber + 1).
 */
export function computeNextDay(currentDay: number, dayNumber: number): number {
  return Math.max(currentDay, dayNumber + 1);
}

/**
 * Determines whether all days of a plan have been completed.
 * Returns true when durationDays > 0 and completedCount >= durationDays.
 */
export function isPlanCompleted(durationDays: number, completedCount: number): boolean {
  return durationDays > 0 && completedCount >= durationDays;
}

/**
 * Merges a local UserReadingPlanProgress row with a remote one.
 *
 * Merge rules (mirrors syncPlanProgress in readingPlanService.ts):
 * - completed_entries: union of both (local wins on same key)
 * - current_day: highest of the two
 * - is_completed: true if either side is completed
 * - completed_at: local value when present, otherwise remote
 * - synced_at: caller-supplied timestamp
 *
 * Returns a new object — inputs are not mutated.
 */
export function mergePlanProgress(
  local: UserReadingPlanProgress,
  remote: UserReadingPlanProgress,
  syncedAt: string
): UserReadingPlanProgress {
  const mergedEntries: Record<string, string> = {
    ...remote.completed_entries,
    ...local.completed_entries,
  };

  return {
    ...remote,
    completed_entries: mergedEntries,
    current_day: Math.max(local.current_day, remote.current_day),
    is_completed: local.is_completed || remote.is_completed,
    completed_at: local.completed_at ?? remote.completed_at,
    synced_at: syncedAt,
  };
}

function isRecentUnsyncedLocalProgress(
  progress: UserReadingPlanProgress,
  fetchedAt: string,
  graceMs: number
): boolean {
  if (progress.user_id) {
    return false;
  }

  const localTimestamp = Date.parse(progress.synced_at || progress.started_at || '');
  const fetchedTimestamp = Date.parse(fetchedAt);
  if (Number.isNaN(localTimestamp) || Number.isNaN(fetchedTimestamp)) {
    return false;
  }

  return fetchedTimestamp - localTimestamp <= graceMs;
}

/**
 * Reconciles a full remote progress fetch against the local store snapshot.
 *
 * Rules:
 * - matching plan rows are merged so local completion work is not lost
 * - recent unsynced local-only rows survive temporarily when the remote read is stale
 * - older local-only rows are dropped so the signed-in server snapshot can still clear stale state
 */
export function reconcileFetchedPlanProgress(
  localProgressList: UserReadingPlanProgress[],
  remoteProgressList: UserReadingPlanProgress[],
  fetchedAt: string,
  graceMs: number = UNSYNCED_LOCAL_PROGRESS_GRACE_MS
): UserReadingPlanProgress[] {
  const localByPlanId = new Map(localProgressList.map((progress) => [progress.plan_id, progress]));
  const remoteByPlanId = new Map(
    remoteProgressList.map((progress) => [progress.plan_id, progress])
  );

  const reconciledProgress = remoteProgressList.map((remoteProgress) => {
    const localProgress = localByPlanId.get(remoteProgress.plan_id);
    return localProgress
      ? mergePlanProgress(localProgress, remoteProgress, fetchedAt)
      : remoteProgress;
  });

  const recentUnsyncedLocalProgress = localProgressList.filter(
    (localProgress) =>
      !remoteByPlanId.has(localProgress.plan_id) &&
      isRecentUnsyncedLocalProgress(localProgress, fetchedAt, graceMs)
  );

  return [...reconciledProgress, ...recentUnsyncedLocalProgress].sort((left, right) =>
    right.started_at.localeCompare(left.started_at)
  );
}

/**
 * Returns a percentage (0–100) representing how far through a plan the user is.
 * Returns 0 when durationDays is 0 or negative.
 */
export function planCompletionPercent(completedCount: number, durationDays: number): number {
  if (durationDays <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((completedCount / durationDays) * 100));
}
