import {
  buildPlanSessionCompletionKey,
  getDaySessionEntries,
  getPlanCompletionEntryKey,
  isRecurringPlan,
} from '../readingPlanModel';
import type {
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanEntry,
  ReadingPlansStoreState,
} from '../types';

export type PlanSessionCompletion = Parameters<ReadingPlansStoreState['markSessionComplete']>[3];

/**
 * What ticking one session of a plan day records: its completion keys, and whether it is the
 * day's last open session (the next open one otherwise). Null when the day has no such session.
 * `today` defaults per key to the current date, as the completion keys of a recurring plan do.
 */
export function resolvePlanSessionCompletion(
  plan: ReadingPlan,
  entries: ReadingPlanEntry[],
  dayNumber: number,
  sessionKey: PlanSessionKey,
  completedSessions: Record<string, string>,
  today?: Date
): PlanSessionCompletion | null {
  const sessionGroups = getDaySessionEntries(entries, dayNumber);
  const sessionIndex = sessionGroups.findIndex((group) => group.sessionKey === sessionKey);
  if (sessionIndex < 0) {
    return null;
  }

  const nextSessionKey =
    sessionGroups.find(
      (group) =>
        group.sessionKey !== sessionKey &&
        !completedSessions[buildPlanSessionCompletionKey(plan, dayNumber, group.sessionKey, today)]
    )?.sessionKey ?? null;

  return {
    completionKey: buildPlanSessionCompletionKey(plan, dayNumber, sessionKey, today),
    dayCompletionKey: getPlanCompletionEntryKey(plan, dayNumber, today),
    totalDays: plan.duration_days,
    isFinalSession: nextSessionKey == null,
    advanceDayOnCompletion: !isRecurringPlan(plan),
    nextSessionKey,
  };
}
