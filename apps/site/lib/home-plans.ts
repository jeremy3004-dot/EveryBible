import planTitlesJson from '../data/plan-titles.json';
import type { SitePlan } from './plan-snapshot';

/** Always-available starters: a short life-situation plan, a gospel, the psalms, the whole Bible. */
export const STARTER_PLAN_SLUGS = [
  'life-anxiety-7-days',
  'gospels-30-days',
  'psalms-30-days',
  'bible-in-1-year',
] as const;

/** The church-year plans, led with from Advent through Epiphany. */
export const SEASON_PLAN_SLUGS = ['advent', 'twelve-days-of-christmas'] as const;

/** Every plan the homepage shelf can show. */
export const HOME_PLAN_SLUGS = [...SEASON_PLAN_SLUGS, ...STARTER_PLAN_SLUGS] as const;

export const HOME_PLAN_COUNT = 4;

/** Nov 1 through Jan 6 (UTC, so the server's timezone never decides the season). */
export function isChurchYearSeason(today: Date): boolean {
  const month = today.getUTCMonth();
  if (month >= 10) return true;
  return month === 0 && today.getUTCDate() <= 6;
}

/**
 * The four plans the homepage shelf shows. In the church-year season it leads
 * with Advent and the Twelve Days of Christmas; the rest of the shelf, and the
 * whole shelf at other times, is the fixed starter set. Slugs missing from
 * the data are skipped.
 */
export function selectHomePlans(
  plans: readonly SitePlan[],
  today: Date
): { seasonal: boolean; plans: SitePlan[] } {
  const seasonal = isChurchYearSeason(today);
  const bySlug = new Map(plans.map((plan) => [plan.slug, plan]));
  const slugs: readonly string[] = seasonal
    ? [...SEASON_PLAN_SLUGS, ...STARTER_PLAN_SLUGS]
    : STARTER_PLAN_SLUGS;
  const picked = slugs
    .map((slug) => bySlug.get(slug))
    .filter((plan): plan is SitePlan => plan !== undefined)
    .slice(0, HOME_PLAN_COUNT);
  return { seasonal, plans: picked };
}

const planTitles = planTitlesJson as Record<string, Record<string, string> | undefined>;

/**
 * A plan's title in the page's language, from the app's locale files (see
 * scripts/build-plan-pages.ts). `lang` is set only when the title falls back
 * to English on a non-English page, so the browser picks the right font.
 */
export function homePlanTitle(
  plan: Pick<SitePlan, 'slug' | 'title'>,
  code: string
): { title: string; lang?: 'en' } {
  if (code === 'en') return { title: plan.title };
  const translated = planTitles[plan.slug]?.[code];
  return translated ? { title: translated } : { title: plan.title, lang: 'en' };
}
