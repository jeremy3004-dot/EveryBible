import type { TFunction } from 'i18next';

interface PlanProgressTallyInput {
  done: number;
  missed: number;
  totalDays: number;
}

/**
 * The value under the plan card's "Completed" eyebrow: finished days out of the
 * plan's length ("12 of 365 days"), plus missed days when there are any.
 */
export function formatPlanProgressTally(
  t: TFunction,
  { done, missed, totalDays }: PlanProgressTallyInput
): string {
  const days = t('readingPlans.durationDays', { count: totalDays });

  return missed > 0
    ? t('readingPlans.daysReadMissedSummary', { read: done, days, missed })
    : t('readingPlans.daysReadSummary', { read: done, days });
}
