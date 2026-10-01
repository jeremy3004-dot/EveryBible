import planTitlesJson from '../data/plan-titles.json';
import type { SitePlan } from './plan-snapshot';

/** Always-available starters: a short life-situation plan, a gospel, the psalms, the whole Bible. */
export const STARTER_PLAN_SLUGS = [
  'life-anxiety-7-days',
  'gospels-30-days',
  'psalms-30-days',
  'bible-in-1-year',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Western Easter Sunday as a UTC midnight (the anonymous Gregorian computus, as in the app). */
function westernEaster(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/** The first `weekday` (0 = Sunday) on or after a UTC date. */
function sundayOnOrAfter(year: number, month: number, day: number): number {
  const date = Date.UTC(year, month - 1, day);
  return date + ((7 - new Date(date).getUTCDay()) % 7) * MS_PER_DAY;
}

interface HomeSeason {
  slug: string;
  /** Days the plan runs, and how many days ahead of day 1 the shelf starts showing it. */
  days: (year: number) => number;
  leadDays: number;
  /** Day 1 in `year`, as a UTC midnight. */
  start: (year: number) => number;
}

/**
 * The dated plans the shelf can lead with, in the app's terms (churchCalendar.ts):
 * the same dates and the same lead time, so the site offers a plan when the app
 * does. Christmas has always had the long run-up from 1 November, to keep the
 * pair with Advent. The Orthodox Holy Week plan is left to its own page.
 */
const HOME_SEASONS: readonly HomeSeason[] = [
  {
    slug: 'advent',
    start: (year) => sundayOnOrAfter(year, 11, 27),
    days: (year) => (Date.UTC(year, 11, 24) - sundayOnOrAfter(year, 11, 27)) / MS_PER_DAY + 1,
    leadDays: 28,
  },
  {
    slug: 'twelve-days-of-christmas',
    start: (y) => Date.UTC(y, 11, 25),
    days: () => 12,
    leadDays: 54,
  },
  {
    slug: 'when-christmas-is-hard',
    start: (y) => Date.UTC(y, 11, 18),
    days: () => 7,
    leadDays: 14,
  },
  { slug: 'new-year', start: (y) => Date.UTC(y, 0, 1), days: () => 7, leadDays: 10 },
  { slug: 'epiphany', start: (y) => Date.UTC(y, 0, 6), days: () => 7, leadDays: 7 },
  { slug: 'lent', start: (y) => westernEaster(y) - 46 * MS_PER_DAY, days: () => 39, leadDays: 21 },
  {
    slug: 'holy-week',
    start: (y) => westernEaster(y) - 7 * MS_PER_DAY,
    days: () => 8,
    leadDays: 14,
  },
  { slug: 'easter', start: (y) => westernEaster(y) + MS_PER_DAY, days: () => 38, leadDays: 7 },
  {
    slug: 'ascension-to-pentecost',
    start: (y) => westernEaster(y) + 39 * MS_PER_DAY,
    days: () => 11,
    leadDays: 10,
  },
  { slug: 'word-in-every-language', start: (y) => Date.UTC(y, 8, 24), days: () => 7, leadDays: 14 },
  { slug: 'all-saints', start: (y) => Date.UTC(y, 10, 1), days: () => 7, leadDays: 10 },
  {
    slug: 'persecuted-church',
    start: (y) => sundayOnOrAfter(y, 11, 8),
    days: () => 7,
    leadDays: 14,
  },
];

/** Every dated plan the shelf can lead with. */
export const SEASON_PLAN_SLUGS = HOME_SEASONS.map((season) => season.slug);

/** Every plan the homepage shelf can show. */
export const HOME_PLAN_SLUGS = [...SEASON_PLAN_SLUGS, ...STARTER_PLAN_SLUGS];

export const HOME_PLAN_COUNT = 4;

/** At most this many dated plans lead the shelf; the starters fill the rest. */
const SEASON_SLOTS = 2;

/**
 * The season running today or next (the app's getSeason), as its first day, when
 * it is inside the shelf's window: from `leadDays` before day 1 until its last
 * day. Null the rest of the year. Dates are UTC, so the server's timezone never
 * decides the season.
 */
function seasonStartInWindow(season: HomeSeason, today: Date): number | null {
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const year = today.getUTCFullYear();
  const start = [year - 1, year, year + 1]
    .map((candidate) => ({ first: season.start(candidate), days: season.days(candidate) }))
    .find(({ first, days }) => first + (days - 1) * MS_PER_DAY >= now)?.first;
  if (start === undefined) return null;
  return start - now <= season.leadDays * MS_PER_DAY ? start : null;
}

/**
 * The four plans the homepage shelf shows. Dated plans in their window (Advent
 * and Christmas from November, Lent before Ash Wednesday, All Saints at the
 * start of November, …) lead it, soonest first and at most two; the starter
 * set fills the rest, and is the whole shelf the rest of the year. Slugs
 * missing from the data are skipped.
 */
export function selectHomePlans(
  plans: readonly SitePlan[],
  today: Date
): { seasonal: boolean; plans: SitePlan[] } {
  const bySlug = new Map(plans.map((plan) => [plan.slug, plan]));
  const inSeason = HOME_SEASONS.flatMap((season) => {
    const start = seasonStartInWindow(season, today);
    return start === null ? [] : [{ slug: season.slug, start }];
  })
    .sort((left, right) => left.start - right.start)
    .map(({ slug }) => slug);
  const seasonal = inSeason.length > 0;
  const slugs: readonly string[] = [...inSeason.slice(0, SEASON_SLOTS), ...STARTER_PLAN_SLUGS];
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
