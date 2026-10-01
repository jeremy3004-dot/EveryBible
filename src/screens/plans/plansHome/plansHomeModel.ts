import type { TFunction } from 'i18next';
import {
  getPlanDayCount,
  getPlanSeason,
  isJoinedPlanShownToday,
  isMultiSessionPlan,
  isPlanInSeason,
  isRecurringPlan,
  isSeasonalPlan,
  type PlanSeason,
} from '../../../services/plans/readingPlanModel';
import type { CurrentPlanDaySummary } from '../../../services/plans/readingPlanActivity';
import type {
  PlanSessionKey,
  ReadingPlan,
  UserReadingPlanProgress,
} from '../../../services/plans/types';

export type PlanTab = 'my-plans' | 'find-plans' | 'completed';

/** The three segments of the Plans switch, in order. */
export const PLAN_TABS: readonly { key: PlanTab; labelKey: string }[] = [
  { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
  { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
  { key: 'completed', labelKey: 'readingPlans.completed' },
];

export type ActivePlanRow = { progress: UserReadingPlanProgress; plan: ReadingPlan };
export type CompletedPlanItem = UserReadingPlanProgress & { plan: ReadingPlan };

/** "0%" … "100%", clamping a ratio that ran past either end. */
export function formatProgressPercent(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

/** The reader's plans, most recently started first. */
export function sortProgressNewestFirst(
  progressByPlanId: Record<string, UserReadingPlanProgress>
): UserReadingPlanProgress[] {
  return Object.values(progressByPlanId).sort((left, right) =>
    right.started_at.localeCompare(left.started_at)
  );
}

/** Unfinished plans joined to their catalog entry; a plan missing from the catalog is dropped. */
export function getActivePlanRows(
  allPlans: ReadingPlan[],
  userProgress: UserReadingPlanProgress[],
  today: Date
): ActivePlanRow[] {
  return userProgress
    .filter((progress) => !progress.is_completed)
    .map((progress) => {
      const plan = allPlans.find((item) => item.id === progress.plan_id);
      return plan ? { progress, plan } : null;
    })
    .filter((item): item is ActivePlanRow => item !== null)
    .filter(({ plan, progress }) => isJoinedPlanShownToday(plan, progress, today));
}

/** Finished plans joined to their catalog entry; a plan missing from the catalog is dropped. */
export function getCompletedPlanItems(
  allPlans: ReadingPlan[],
  userProgress: UserReadingPlanProgress[]
): CompletedPlanItem[] {
  return userProgress
    .filter((progress) => progress.is_completed)
    .map((progress) => {
      const plan = allPlans.find((item) => item.id === progress.plan_id);
      return plan ? { ...progress, plan } : null;
    })
    .filter((item): item is CompletedPlanItem => item !== null);
}

/** My Plans' two groups: plans that run to an end, and calendar rhythms that repeat. */
export function splitActivePlanRows(rows: ActivePlanRow[]): {
  dailyReadings: ActivePlanRow[];
  dailyRhythms: ActivePlanRow[];
} {
  return {
    dailyReadings: rows.filter(({ plan }) => !isRecurringPlan(plan)),
    dailyRhythms: rows.filter(({ plan }) => isRecurringPlan(plan)),
  };
}

/**
 * How far through a plan the reader is. A plan that runs to an end counts the days
 * before today as done; a rhythm's day is the calendar's, so today itself counts.
 * A monthly rhythm is measured against this month's days (see getPlanDayCount).
 */
export function getActivePlanProgressRatio(
  plan: ReadingPlan,
  currentDay: number,
  today: Date
): number {
  const totalDays = getPlanDayCount(plan, today);
  // Advent joined in October has not begun: its waiting day 1 is not a day done.
  if (totalDays <= 0 || !isPlanInSeason(plan, today)) {
    return 0;
  }
  return isRecurringPlan(plan) ? currentDay / totalDays : (currentDay - 1) / totalDays;
}

/**
 * "2 ACTIVE · 1 COMPLETED" — drops whichever half is zero, and falls back to the
 * catalog size before anything is enrolled. The counts are of the rows the lists
 * show: progress for a plan the catalog no longer has is in neither list, so it is
 * not counted either.
 */
export function formatPlansHeaderEyebrow(
  counts: { activeCount: number; completedCount: number; catalogSize: number },
  t: TFunction
): string {
  const { activeCount, completedCount, catalogSize } = counts;
  const parts: string[] = [];
  if (activeCount > 0) {
    parts.push(t('readingPlans.activeCount', { count: activeCount }));
  }
  if (completedCount > 0) {
    parts.push(t('readingPlans.completedCount', { count: completedCount }));
  }
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return catalogSize > 0 ? t('readingPlans.plansCount', { count: catalogSize }) : '';
}

export function getLocalizedSessionLabel(sessionKey: PlanSessionKey, t: TFunction): string {
  const labelKey =
    sessionKey === 'morning'
      ? 'readingPlans.morningLabel'
      : sessionKey === 'midday'
        ? 'readingPlans.middayLabel'
        : 'readingPlans.eveningLabel';

  return t(labelKey, {
    defaultValue: sessionKey.charAt(0).toUpperCase() + sessionKey.slice(1),
  });
}

/** "29 Nov – 24 Dec": the dates a seasonal plan runs this year, in the in-app language. */
export function formatPlanSeasonDates({ start, dayCount }: PlanSeason, locale?: string): string {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayCount - 1);
  const format = (date: Date) =>
    date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
  return `${format(start)} – ${format(end)}`;
}

/** "Morning + Evening" for a multi-session plan; null for any other. */
export function formatPlanCadenceLabel(plan: ReadingPlan, t: TFunction): string | null {
  if (!isMultiSessionPlan(plan) || !plan.sessionOrder?.length) {
    return null;
  }

  return plan.sessionOrder.map((sessionKey) => getLocalizedSessionLabel(sessionKey, t)).join(' + ');
}

type SessionStatusTone = 'done' | 'next' | 'upcoming';

/** "Morning done • Evening next" for today's sessions; null when the day has none. */
export function formatSessionStatusSummary(
  summary: CurrentPlanDaySummary | null,
  t: TFunction
): string | null {
  if (!summary?.sessionSummaries.length) {
    return null;
  }

  return summary.sessionSummaries
    .map((session) => {
      const tone: SessionStatusTone = session.isComplete
        ? 'done'
        : summary.nextIncompleteSessionKey === session.sessionKey
          ? 'next'
          : 'upcoming';
      const toneLabel =
        tone === 'done'
          ? t('readingPlans.sessionDone')
          : tone === 'next'
            ? t('readingPlans.sessionNext')
            : t('readingPlans.sessionUpcoming');

      return `${getLocalizedSessionLabel(session.sessionKey, t)} ${toneLabel}`;
    })
    .join(' • ');
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  chronological: 'readingPlans.categoryChronological',
  'book-study': 'readingPlans.categoryBookStudy',
  topical: 'readingPlans.categoryTopical',
  devotional: 'readingPlans.categoryDevotional',
  'life-situation': 'readingPlans.categoryLifeSituations',
  'church-year': 'readingPlans.churchYear.heading',
  seasonal: 'readingPlans.inSeason',
};

/** A catalog category's heading; an unknown one is title-cased from its slug. */
export function getPlanCategoryLabel(category: string, t: TFunction): string {
  const labelKey = CATEGORY_LABEL_KEYS[category];
  return labelKey
    ? t(labelKey)
    : category
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export interface CatalogPlanGroups {
  seasonalPlans: ReadingPlan[];
  dailyRhythmPlans: ReadingPlan[];
  lifeSituationPlans: ReadingPlan[];
  categories: { category: string; plans: ReadingPlan[] }[];
}

/**
 * Section layout rule for Find plans:
 *   • "In season" plans (Advent, Lent, Easter, All Saints, …) come first as a
 *     cover grid, soonest first: each is in the catalog only around its own
 *     dates (see isPlanOfferedToday), and a reader looks for them by name.
 *   • Recurring plans — the calendar-driven ones that repeat forever instead of
 *     running to an end date — are the featured "Daily rhythms" group and get the
 *     two-up cover grid, because their covers are the browse hook.
 *   • "Seasons of life" plans get the same cover grid for the same reason: a
 *     reader looks for the one that names how they feel.
 *   • Every other catalog category ("Chronological", "Book study", …) renders as a
 *     compact row list inside one paper card, so a long catalog stays scannable
 *     instead of turning into a wall of artwork. Categories keep catalog order.
 */
export function groupCatalogPlans(plans: ReadingPlan[], today: Date): CatalogPlanGroups {
  const seasonStart = (plan: ReadingPlan) => getPlanSeason(plan, today)?.start.getTime() ?? 0;
  const seasonalPlans = plans
    .filter((plan) => isSeasonalPlan(plan))
    .sort((left, right) => seasonStart(left) - seasonStart(right));
  const rest = plans.filter((plan) => !isSeasonalPlan(plan));
  const dailyRhythmPlans = rest.filter((plan) => isRecurringPlan(plan));
  const lifeSituationPlans = rest.filter(
    (plan) => !isRecurringPlan(plan) && plan.category === 'life-situation'
  );
  const plansByCategory = rest
    .filter((plan) => !isRecurringPlan(plan) && plan.category !== 'life-situation')
    .reduce<Record<string, ReadingPlan[]>>((acc, plan) => {
      const category = plan.category ?? 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(plan);
      return acc;
    }, {});

  return {
    seasonalPlans,
    dailyRhythmPlans,
    lifeSituationPlans,
    categories: Object.entries(plansByCategory).map(([category, categoryPlans]) => ({
      category,
      plans: categoryPlans,
    })),
  };
}
