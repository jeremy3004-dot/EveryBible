import type { UserReadingPlanProgress } from './types';

// ---------------------------------------------------------------------------
// Pure model functions for reading plan progress — no Supabase dependency.
// These are extracted so they can be unit-tested without network or auth.
// ---------------------------------------------------------------------------

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

/**
 * Returns a percentage (0–100) representing how far through a plan the user is.
 * Returns 0 when durationDays is 0 or negative.
 */
export function planCompletionPercent(
  completedCount: number,
  durationDays: number
): number {
  if (durationDays <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((completedCount / durationDays) * 100));
}
