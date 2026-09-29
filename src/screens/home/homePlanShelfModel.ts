import {
  getActivePlanDayNumber,
  getVisibleCompletedEntryCount,
} from '../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import { getPlanLedgerGridDayCount } from '../plans/planLedgerGridModel';
import { selectHomeContinuePlans } from './homeReadingPlansModel';

/** Enough to fill a swipe past the screen edge without making Home a catalogue. */
export const HOME_PLAN_SHELF_LIMIT = 6;

/**
 * What a newcomer is offered before joining anything: short, approachable plans
 * and two of the daily rhythms, so the first shelf is not a year-long commitment.
 * Ids missing from the catalogue are skipped and the gap filled in sort order.
 */
export const HOME_SUGGESTED_PLAN_IDS = [
  'proverbs-31-days',
  'psalms-30-days',
  'common-prayer-psalter',
  'gospels-30-days',
  'lords-prayer-week',
  'sermon-on-the-mount-7-days',
] as const;

export interface HomePlanShelfItem {
  plan: ReadingPlan;
  /** Null for a suggestion the reader has not joined. */
  progress: UserReadingPlanProgress | null;
  /** Today's day in the plan; 0 for a suggestion. */
  dayNumber: number;
  /** The plan's length as its day grid counts it (a monthly plan uses this month). */
  totalDays: number;
  /** Share of those days ticked, 0–1. */
  fraction: number;
}

export interface HomePlanShelf {
  kind: 'mine' | 'suggested';
  items: HomePlanShelfItem[];
}

/**
 * The plans Home shows as covers: the reader's own in-progress plans, best first
 * (see selectHomeContinuePlans), or suggestions when they have none.
 */
export function selectHomePlanShelf({
  plans,
  progressByPlanId,
  today,
  limit = HOME_PLAN_SHELF_LIMIT,
}: {
  plans: ReadingPlan[];
  progressByPlanId: Record<string, UserReadingPlanProgress>;
  today: Date;
  limit?: number;
}): HomePlanShelf {
  const mine = selectHomeContinuePlans(plans, progressByPlanId, limit, today);
  if (mine.length > 0) {
    return {
      kind: 'mine',
      items: mine.map(({ plan, progress }) => {
        const totalDays = getPlanLedgerGridDayCount(plan, today);
        const completed = getVisibleCompletedEntryCount(plan, progress.completed_entries, today);
        return {
          plan,
          progress,
          dayNumber: getActivePlanDayNumber(plan, progress, today),
          totalDays,
          fraction: totalDays > 0 ? Math.min(1, completed / totalDays) : 0,
        };
      }),
    };
  }

  const active = plans.filter((plan) => plan.is_active);
  const byId = new Map(active.map((plan) => [plan.id, plan]));
  const curated = HOME_SUGGESTED_PLAN_IDS.flatMap((id) => {
    const plan = byId.get(id);
    return plan ? [plan] : [];
  });
  const curatedIds = new Set(curated.map((plan) => plan.id));
  const rest = active
    .filter((plan) => !curatedIds.has(plan.id))
    .sort((left, right) => left.sort_order - right.sort_order);

  return {
    kind: 'suggested',
    items: [...curated, ...rest].slice(0, Math.max(0, limit)).map((plan) => ({
      plan,
      progress: null,
      dayNumber: 0,
      totalDays: getPlanLedgerGridDayCount(plan, today),
      fraction: 0,
    })),
  };
}
