import {
  getPlanSeason,
  isPlanOfferedToday,
  isSeasonalPlan,
  type PlanSeason,
} from '../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

/** How many days into its season Home still offers a plan; after that, Find plans does. */
export const HOME_SEASON_CARD_LAST_DAY = 3;

export interface HomeSeasonPlan {
  plan: ReadingPlan;
  season: PlanSeason;
  /** Days from today to day 1: positive before the season, 0 on day 1, negative after. */
  daysUntilStart: number;
}

const getLocalDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      (24 * 60 * 60 * 1000)
  );

/**
 * The seasonal plan Home offers today, if any: one the reader has not joined,
 * from the weeks before its first day (when it appears in Find plans) through
 * its first few days. A season already under way comes before one still ahead,
 * and the sooner start before the later.
 */
export function selectHomeSeasonPlan({
  plans,
  progressByPlanId,
  today,
}: {
  plans: ReadingPlan[];
  progressByPlanId: Record<string, UserReadingPlanProgress>;
  today: Date;
}): HomeSeasonPlan | null {
  const candidates = plans
    .filter(
      (plan) =>
        plan.is_active &&
        isSeasonalPlan(plan) &&
        isPlanOfferedToday(plan, today) &&
        !progressByPlanId[plan.id]
    )
    .flatMap((plan) => {
      const season = getPlanSeason(plan, today);
      if (!season) return [];
      const daysUntilStart = getLocalDaysBetween(today, season.start);
      return daysUntilStart > -HOME_SEASON_CARD_LAST_DAY ? [{ plan, season, daysUntilStart }] : [];
    });

  const started = candidates.filter(({ daysUntilStart }) => daysUntilStart <= 0);
  const pool = started.length > 0 ? started : candidates;
  return pool.reduce<HomeSeasonPlan | null>(
    (best, item) =>
      !best || item.season.start.getTime() < best.season.start.getTime() ? item : best,
    null
  );
}
