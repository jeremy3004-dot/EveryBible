import type { ReadingPlanScheduleMode } from './types';

/**
 * The dated seasons that seasonal reading plans follow, and when each plan shows
 * in the app. A season comes round every year: day 1 falls on `start` and the
 * plan runs `dayCount` days. Every date here is a local calendar date (midnight).
 *
 * Seasons tied to Easter move with it. Western Easter follows the Gregorian
 * calendar; Orthodox Pascha follows the Julian one and is converted to a
 * Gregorian date here. The two coincide in some years (2028, 2031, 2034).
 */

export type SeasonalScheduleMode = Extract<
  ReadingPlanScheduleMode,
  | 'calendar-advent'
  | 'calendar-christmas'
  | 'calendar-new-year'
  | 'calendar-epiphany'
  | 'calendar-lent'
  | 'calendar-holy-week'
  | 'calendar-orthodox-holy-week'
  | 'calendar-easter'
  | 'calendar-pentecost'
  | 'calendar-translation-week'
  | 'calendar-all-saints'
  | 'calendar-persecuted-church'
  | 'calendar-hard-christmas'
>;

/** One year's run of a seasonal plan: day 1 falls on `start`, and it lasts `dayCount` days. */
export interface PlanSeason {
  start: Date;
  dayCount: number;
}

interface SeasonRule {
  /** The season that starts in `year`. */
  forYear: (year: number) => PlanSeason;
  /** How many days before day 1 the plan appears in the catalog and on Home. */
  leadDays: number;
  /** A year whose season is better left to another plan (Orthodox Holy Week on Western dates). */
  isRedundant?: (year: number) => boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to `to`, immune to a daylight-saving hour. */
export const getLocalDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      MS_PER_DAY
  );

export const addLocalDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Western Easter Sunday (the anonymous Gregorian computus). */
export function getWesternEaster(year: number): Date {
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
  return new Date(year, month - 1, day);
}

/**
 * Orthodox Pascha as a Gregorian date (the Julian computus, then the calendars'
 * 13-day gap, which holds from 1900 to 2099).
 */
export function getOrthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return new Date(year, month - 1, day + 13);
}

/** The first `weekday` (0 = Sunday) on or after a date. */
const onOrAfter = (date: Date, weekday: number): Date =>
  addLocalDays(date, (7 - date.getDay() + weekday) % 7);

const fixed = (month: number, day: number, dayCount: number) => (year: number) => ({
  start: new Date(year, month - 1, day),
  dayCount,
});

const fromEaster =
  (easter: (year: number) => Date, offset: number, dayCount: number) => (year: number) => ({
    start: addLocalDays(easter(year), offset),
    dayCount,
  });

const sameDay = (left: Date, right: Date): boolean => getLocalDaysBetween(left, right) === 0;

const SEASON_RULES: Record<SeasonalScheduleMode, SeasonRule> = {
  // From the first Sunday of Advent (27 November to 3 December) to Christmas Eve: 22 to 28 days.
  'calendar-advent': {
    forYear: (year) => {
      const start = onOrAfter(new Date(year, 10, 27), 0);
      return { start, dayCount: getLocalDaysBetween(start, new Date(year, 11, 24)) + 1 };
    },
    leadDays: 28,
  },
  // The Twelve Days, 25 December to 5 January.
  'calendar-christmas': { forYear: fixed(12, 25, 12), leadDays: 14 },
  // 1 to 7 January.
  'calendar-new-year': { forYear: fixed(1, 1, 7), leadDays: 10 },
  // 6 to 12 January, from the feast of the Epiphany.
  'calendar-epiphany': { forYear: fixed(1, 6, 7), leadDays: 7 },
  // Ash Wednesday (46 days before Easter) to the eve of Palm Sunday: 39 days.
  'calendar-lent': { forYear: fromEaster(getWesternEaster, -46, 39), leadDays: 21 },
  // Palm Sunday to Easter Sunday.
  'calendar-holy-week': { forYear: fromEaster(getWesternEaster, -7, 8), leadDays: 14 },
  // Palm Sunday to Pascha on the Orthodox calendar, unless it falls on the Western dates.
  'calendar-orthodox-holy-week': {
    forYear: fromEaster(getOrthodoxEaster, -7, 8),
    leadDays: 14,
    isRedundant: (year) => sameDay(getOrthodoxEaster(year), getWesternEaster(year)),
  },
  // Easter Monday to the eve of Ascension Day (39 days after Easter): 38 days.
  'calendar-easter': { forYear: fromEaster(getWesternEaster, 1, 38), leadDays: 7 },
  // Ascension Day to Pentecost (49 days after Easter): 11 days.
  'calendar-pentecost': { forYear: fromEaster(getWesternEaster, 39, 11), leadDays: 10 },
  // 24 to 30 September, ending on International Translation Day (St Jerome's day).
  'calendar-translation-week': { forYear: fixed(9, 24, 7), leadDays: 14 },
  // 1 to 7 November, from All Saints' Day.
  'calendar-all-saints': { forYear: fixed(11, 1, 7), leadDays: 10 },
  // The week from the second Sunday of November, when many churches pray for the persecuted.
  'calendar-persecuted-church': {
    forYear: (year) => ({ start: onOrAfter(new Date(year, 10, 8), 0), dayCount: 7 }),
    leadDays: 14,
  },
  // 18 to 24 December, for those who find Christmas hard.
  'calendar-hard-christmas': { forYear: fixed(12, 18, 7), leadDays: 14 },
};

export function isSeasonalScheduleMode(
  mode: ReadingPlanScheduleMode | undefined
): mode is SeasonalScheduleMode {
  return mode !== undefined && Object.prototype.hasOwnProperty.call(SEASON_RULES, mode);
}

const getSeasonEnd = ({ start, dayCount }: PlanSeason): Date => addLocalDays(start, dayCount - 1);

/**
 * The season running today, or the next one when today falls outside it:
 * Advent 2026 from New Year to Christmas Eve 2026, then Advent 2027.
 * `seasonsBack` steps back whole years from that one.
 */
export function getSeason(mode: SeasonalScheduleMode, today: Date, seasonsBack = 0): PlanSeason {
  const { forYear } = SEASON_RULES[mode];
  const year = today.getFullYear();
  // A season can start the year before (Christmas runs into January), so look one back.
  const resolvedYear =
    [year - 1, year, year + 1].find(
      (candidate) => getLocalDaysBetween(today, getSeasonEnd(forYear(candidate))) >= 0
    ) ?? year + 1;
  return forYear(resolvedYear - seasonsBack);
}

/** Whether today falls from `leadDays` before a season's first day to its last. */
export function isWithinSeasonWindow(mode: SeasonalScheduleMode, today: Date): boolean {
  return getLocalDaysBetween(today, getSeason(mode, today).start) <= SEASON_RULES[mode].leadDays;
}

/**
 * Whether a seasonal plan is offered in the catalog and on Home today: within its
 * window, unless this year's run is better left to another plan (Orthodox Holy
 * Week on the Western dates). The rest of the year it is hidden.
 */
export function isSeasonInWindow(mode: SeasonalScheduleMode, today: Date): boolean {
  const season = getSeason(mode, today);
  if (SEASON_RULES[mode].isRedundant?.(season.start.getFullYear())) {
    return false;
  }
  return isWithinSeasonWindow(mode, today);
}

/** The last day of the season before the current-or-next one. */
export function getPreviousSeasonEnd(mode: SeasonalScheduleMode, today: Date): Date {
  return getSeasonEnd(getSeason(mode, today, 1));
}
