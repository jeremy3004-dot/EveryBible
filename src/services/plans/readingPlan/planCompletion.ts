import type { ReadingPlansStoreApi } from '../../../stores/readingPlansStore';
import { getPlanCompletionEntryKey, isRecurringPlan } from '../readingPlanModel';
import type { PlanSessionKey, ReadingPlan, UserReadingPlanProgress } from '../types';
import { getBundledPlanEntries } from './planCatalog';
import { resolvePlanSessionCompletion } from './planSessionModel';

/**
 * Records a plan day as done in the store: a recurring plan by its dated entry, a fixed-length
 * plan by day number. Null when the reader is not enrolled.
 */
export function completePlanDayInStore(
  store: ReadingPlansStoreApi,
  plan: ReadingPlan,
  dayNumber: number
): UserReadingPlanProgress | null {
  return isRecurringPlan(plan)
    ? store
        .getState()
        .markRecurringDayComplete(plan.id, getPlanCompletionEntryKey(plan, dayNumber), dayNumber)
    : store.getState().markDayComplete(plan.id, dayNumber, plan.duration_days);
}

export type PlanSessionOutcome =
  | { found: false }
  | { found: true; progress: UserReadingPlanProgress | null };

/**
 * Ticks one session of a plan day in the store; the day's last open session also completes the
 * day. `found` is false when the day has no such session; `progress` is null when the reader is
 * not enrolled.
 */
export function completePlanSessionInStore(
  store: ReadingPlansStoreApi,
  plan: ReadingPlan,
  dayNumber: number,
  sessionKey: PlanSessionKey
): PlanSessionOutcome {
  const completion = resolvePlanSessionCompletion(
    plan,
    getBundledPlanEntries(plan.id),
    dayNumber,
    sessionKey,
    store.getState().getProgress(plan.id)?.completed_sessions ?? {}
  );
  if (!completion) {
    return { found: false };
  }

  return {
    found: true,
    progress: store.getState().markSessionComplete(plan.id, dayNumber, sessionKey, completion),
  };
}
