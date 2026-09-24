import type { TFunction } from 'i18next';

export type PlanDaySessionAccessibilityState = 'done' | 'next' | 'upcoming' | 'available';

interface PlanDayRowAccessibilityInput {
  dayNumber: number;
  dateLabel: string | null;
  /** The day's chapters, already formatted ("Genesis 1, Genesis 2"). */
  refs: string;
  isCurrent: boolean;
  isCompleted: boolean;
  isNext: boolean;
  /** Today card only: the target line under the chapters ("Today's target: 1/3 chapters"). */
  subtitle?: string | null;
}

export interface PlanDayRowAccessibility {
  label: string;
  /** The row's state, which the screen shows only as a tick or a trailing eyebrow. */
  value: { text: string } | undefined;
}

/**
 * The plan day row as one screen-reader stop. The row sets its own label, which
 * replaces the text inside it, so anything the row shows has to be restated here:
 * the Today card's target line used to be dropped, and a finished Today card never
 * said it was finished.
 */
export function getPlanDayRowAccessibility(
  t: TFunction,
  {
    dayNumber,
    dateLabel,
    refs,
    isCurrent,
    isCompleted,
    isNext,
    subtitle,
  }: PlanDayRowAccessibilityInput
): PlanDayRowAccessibility {
  const day = isCurrent
    ? t('interface.currentPlanDay', { day: dayNumber })
    : t('interface.planDay', { day: dayNumber });
  const heading = dateLabel ? `${day}, ${dateLabel}` : day;
  const label = [`${heading}: ${refs}`, subtitle || null].filter(Boolean).join(', ');

  const value = isCompleted
    ? { text: t('readingPlans.completed') }
    : isNext
      ? { text: t('readingPlans.tomorrow') }
      : undefined;

  return { label, value };
}

/**
 * A session pill's state ("Morning" filled in once read). The fill is the only
 * mark of a finished session, so a finished one says so.
 */
export function getPlanSessionAccessibilityValue(
  t: TFunction,
  state: PlanDaySessionAccessibilityState
): { text: string } | undefined {
  return state === 'done' ? { text: t('readingPlans.completed') } : undefined;
}
