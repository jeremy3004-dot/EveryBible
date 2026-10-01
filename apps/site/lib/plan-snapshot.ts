/**
 * The reading-plan snapshot the /plans pages render from (data/plans.json).
 * The mobile app's bundled catalog is the source of truth;
 * scripts/build-plan-pages.ts turns it into this shape with the English text,
 * and plan-snapshot.test.ts fails when the committed file no longer matches.
 * Kept free of app imports so page code never pulls the app catalog in.
 */
import { bibleBookById } from './bible-books';

/**
 * How a plan's days map onto the calendar, mirroring the app's schedule modes:
 * `sequential` starts on the day you join, `monthly` reads the day matching
 * the date (calendar-day-of-month), `weekly` the day matching the weekday,
 * with day 1 on Sunday (calendar-day-of-week). Every other mode is a dated
 * season that comes round each year (the app's calendar-advent, calendar-lent
 * and so on): see SEASONAL_SCHEDULES and the app's churchCalendar.ts for when
 * each one runs.
 */
export type PlanSchedule =
  | 'sequential'
  | 'monthly'
  | 'weekly'
  | 'advent'
  | 'christmas'
  | 'hard-christmas'
  | 'new-year'
  | 'epiphany'
  | 'lent'
  | 'holy-week'
  | 'orthodox-holy-week'
  | 'easter'
  | 'pentecost'
  | 'translation-week'
  | 'all-saints'
  | 'persecuted-church';

/** The dated seasons, in the order of the church year from Advent. */
export const SEASONAL_SCHEDULES = [
  'advent',
  'christmas',
  'hard-christmas',
  'new-year',
  'epiphany',
  'lent',
  'holy-week',
  'orthodox-holy-week',
  'easter',
  'pentecost',
  'translation-week',
  'all-saints',
  'persecuted-church',
] as const satisfies readonly PlanSchedule[];

export function isSeasonalSchedule(schedule: PlanSchedule): boolean {
  return (SEASONAL_SCHEDULES as readonly PlanSchedule[]).includes(schedule);
}

/** The app's scheduleMode for each dated season. */
const SEASONAL_MODES: Readonly<Record<string, PlanSchedule>> = {
  'calendar-advent': 'advent',
  'calendar-christmas': 'christmas',
  'calendar-hard-christmas': 'hard-christmas',
  'calendar-new-year': 'new-year',
  'calendar-epiphany': 'epiphany',
  'calendar-lent': 'lent',
  'calendar-holy-week': 'holy-week',
  'calendar-orthodox-holy-week': 'orthodox-holy-week',
  'calendar-easter': 'easter',
  'calendar-pentecost': 'pentecost',
  'calendar-translation-week': 'translation-week',
  'calendar-all-saints': 'all-saints',
  'calendar-persecuted-church': 'persecuted-church',
};

/** One passage. Omitted fields mean a whole chapter; `toChapter` ends a chapter range. */
export interface PlanReading {
  /** USFM book id, as in lib/bible-books.ts. */
  book: string;
  chapter: number;
  toChapter?: number;
  verse?: number;
  toVerse?: number;
}

/** A day's readings; multi-session plans split a day into labelled sessions. */
export interface PlanSession {
  label: string | null;
  readings: PlanReading[];
}

export interface PlanDay {
  day: number;
  sessions: PlanSession[];
}

export interface SitePlan {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** The app's catalog category, e.g. `chronological` or `life-situation`. */
  category: string;
  durationDays: number;
  schedule: PlanSchedule;
  /** "Morning", "Evening" for a multi-session plan, in order; empty otherwise. */
  sessions: string[];
  /** File stem of the cover under public/plans/covers/<cover>.webp. */
  cover: string;
  days: PlanDay[];
}

export interface PlanSnapshot {
  /** Section headings as the app shows them, keyed by category or `daily-rhythms`. */
  groupLabels: Record<string, string>;
  /** Catalog order (the app's sort_order). */
  plans: SitePlan[];
}

/* The app's catalog types, reduced to the fields read here. */

export interface AppPlan {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: string | null;
  sort_order: number;
  coverKey: string;
  scheduleMode?:
    | 'relative'
    | 'calendar-day-of-month'
    | 'calendar-day-of-week'
    | 'calendar-advent'
    | 'calendar-christmas'
    | 'calendar-hard-christmas'
    | 'calendar-new-year'
    | 'calendar-epiphany'
    | 'calendar-lent'
    | 'calendar-holy-week'
    | 'calendar-orthodox-holy-week'
    | 'calendar-easter'
    | 'calendar-pentecost'
    | 'calendar-translation-week'
    | 'calendar-all-saints'
    | 'calendar-persecuted-church';
  format?: 'single-session' | 'multi-session';
  sessionOrder?: string[];
}

export interface AppPlanEntry {
  day_number: number;
  session_key?: string | null;
  session_title?: string | null;
  book: string;
  chapter_start: number;
  chapter_end: number | null;
  verse_start?: number | null;
  verse_end?: number | null;
}

export interface PlanSnapshotSource {
  plans: readonly AppPlan[];
  entriesByPlanId: Readonly<Record<string, readonly AppPlanEntry[]>>;
  /** English text for an i18n key (src/i18n/locales/en.ts), or undefined. */
  text: (key: string) => string | undefined;
  /** Cover key to its PNG file stem, from the app's cover map. */
  coverFiles: Readonly<Record<string, string>>;
}

/** Group id of the app's "Daily rhythms" section: every recurring plan. */
export const DAILY_RHYTHMS_GROUP = 'daily-rhythms';

/** Group id of the dated plans: the app's "In season" grid, here one section for all of them. */
export const SEASONAL_GROUP = 'seasonal';

/**
 * The app's section heading keys (plansHomeModel.ts and FindPlansSection.tsx).
 * `church-year` stays labelled because it is a catalog category, though the site
 * lists church-year and other dated plans together under the `seasonal` group.
 */
const GROUP_LABEL_KEYS: Record<string, string> = {
  [SEASONAL_GROUP]: 'readingPlans.inSeason',
  'church-year': 'readingPlans.churchYear.heading',
  [DAILY_RHYTHMS_GROUP]: 'readingPlans.dailyRhythms',
  'life-situation': 'readingPlans.categoryLifeSituations',
  chronological: 'readingPlans.categoryChronological',
  'book-study': 'readingPlans.categoryBookStudy',
  topical: 'readingPlans.categoryTopical',
  devotional: 'readingPlans.categoryDevotional',
};

const SESSION_LABEL_KEYS: Record<string, string> = {
  morning: 'readingPlans.morningLabel',
  midday: 'readingPlans.middayLabel',
  evening: 'readingPlans.eveningLabel',
};

function required(source: PlanSnapshotSource, key: string): string {
  const value = source.text(key);
  if (!value) throw new Error(`Missing English text for ${key}`);
  return value;
}

function schedule(plan: AppPlan): PlanSchedule {
  if (plan.scheduleMode === 'calendar-day-of-month') return 'monthly';
  if (plan.scheduleMode === 'calendar-day-of-week') return 'weekly';
  return (plan.scheduleMode && SEASONAL_MODES[plan.scheduleMode]) || 'sequential';
}

/** Whole numbers only; a chapter or verse outside the book is a catalog bug. */
function reading(planId: string, entry: AppPlanEntry): PlanReading {
  const book = bibleBookById(entry.book);
  const where = `${planId} day ${entry.day_number} ${entry.book} ${entry.chapter_start}`;
  if (!book) throw new Error(`Unknown book in ${where}`);
  const last = entry.chapter_end ?? entry.chapter_start;
  const inBook = (chapter: number) =>
    Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
  if (!inBook(entry.chapter_start) || !inBook(last) || last < entry.chapter_start)
    throw new Error(`Chapter out of range in ${where}`);
  const result: PlanReading = { book: book.id, chapter: entry.chapter_start };
  if (last !== entry.chapter_start) result.toChapter = last;
  if (entry.verse_start != null) {
    result.verse = entry.verse_start;
    if (entry.verse_end != null && entry.verse_end !== entry.verse_start)
      result.toVerse = entry.verse_end;
  }
  return result;
}

/**
 * A multi-session day is split by session in the plan's session order, each
 * labelled as the app labels it: the entry's own title (Morning Kathismata),
 * else the session's name. Entries keep catalog order within a session.
 */
function planDays(plan: AppPlan, entries: readonly AppPlanEntry[], source: PlanSnapshotSource) {
  const multiSession = plan.format === 'multi-session';
  const byDay = new Map<number, AppPlanEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day_number) ?? [];
    list.push(entry);
    byDay.set(entry.day_number, list);
  }
  return [...byDay.keys()]
    .sort((left, right) => left - right)
    .map((day): PlanDay => {
      const dayEntries = byDay.get(day)!;
      if (!multiSession)
        return {
          day,
          sessions: [{ label: null, readings: dayEntries.map((entry) => reading(plan.id, entry)) }],
        };
      return {
        day,
        sessions: (plan.sessionOrder ?? [])
          .map((key) => dayEntries.filter((entry) => entry.session_key === key))
          .filter((sessionEntries) => sessionEntries.length > 0)
          .map((sessionEntries) => ({
            label:
              sessionEntries[0].session_title?.trim() ||
              required(source, SESSION_LABEL_KEYS[sessionEntries[0].session_key!]),
            readings: sessionEntries.map((entry) => reading(plan.id, entry)),
          })),
      };
    });
}

export function buildPlanSnapshot(source: PlanSnapshotSource): PlanSnapshot {
  const plans = [...source.plans]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((plan): SitePlan => {
      const entries = source.entriesByPlanId[plan.id] ?? [];
      const cover = source.coverFiles[plan.coverKey];
      if (!cover) throw new Error(`No cover file for ${plan.id} (${plan.coverKey})`);
      if (!plan.category) throw new Error(`No category for ${plan.id}`);
      if (!plan.description_key) throw new Error(`No description for ${plan.id}`);
      const days = planDays(plan, entries, source);
      if (days.length !== plan.duration_days)
        throw new Error(`${plan.id} lists ${days.length} of its ${plan.duration_days} days`);
      const multiSession = plan.format === 'multi-session';
      const sessions = multiSession
        ? (plan.sessionOrder ?? []).map((key) => required(source, SESSION_LABEL_KEYS[key]))
        : [];
      if (multiSession && days.some((day) => day.sessions.length === 0))
        throw new Error(`${plan.id} has a day with no session`);
      return {
        id: plan.id,
        slug: plan.slug,
        title: required(source, plan.title_key),
        description: required(source, plan.description_key),
        category: plan.category,
        durationDays: plan.duration_days,
        schedule: schedule(plan),
        sessions,
        cover,
        days,
      };
    });
  const slugs = new Set(plans.map((plan) => plan.slug));
  if (slugs.size !== plans.length) throw new Error('Plan slugs are not unique');
  for (const slug of slugs)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Bad plan slug ${slug}`);

  const groupLabels = Object.fromEntries(
    Object.entries(GROUP_LABEL_KEYS).map(([group, key]) => [group, required(source, key)])
  );
  const unlabelled = plans.find((plan) => !groupLabels[plan.category]);
  if (unlabelled) throw new Error(`No heading for category ${unlabelled.category}`);
  return { groupLabels, plans };
}

/**
 * The committed JSON: readable at plan level, one line per day so the
 * 365-day plans stay a few hundred lines rather than several thousand.
 */
export function formatPlanSnapshot(snapshot: PlanSnapshot): string {
  const days: string[] = [];
  const skeleton = {
    ...snapshot,
    plans: snapshot.plans.map((plan) => {
      days.push(
        `[\n${plan.days.map((day) => `        ${JSON.stringify(day)}`).join(',\n')}\n      ]`
      );
      return { ...plan, days: `@@days${days.length - 1}@@` };
    }),
  };
  return `${JSON.stringify(skeleton, null, 2).replace(/"@@days(\d+)@@"/g, (_, index) => days[Number(index)])}\n`;
}
