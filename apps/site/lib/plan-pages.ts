/**
 * What the /plans pages say about a plan: reading labels and links, day
 * labels, the catalog's sections, plain-language summaries, and the SEO
 * metadata, structured data and sitemap. Reads only the committed snapshot
 * (data/plans.json), which is small enough to bundle with the prerendered pages.
 */
import type { Metadata, MetadataRoute } from 'next';

import snapshotJson from '../data/plans.json';
import {
  bibleBookById,
  bibleChapterPath,
  SITE_BIBLE_BOOKS,
  type SiteBibleBook,
} from './bible-books';
import {
  DAILY_RHYTHMS_GROUP,
  type PlanDay,
  type PlanReading,
  type PlanSnapshot,
  type SitePlan,
} from './plan-snapshot';
import { EVERYBIBLE_SITE_URL } from './site-links';
import { pageMetadata, SITE_NAME } from './site-metadata';

export const PLANS_PATH = '/plans';

export const planSnapshot = snapshotJson as PlanSnapshot;

export function getPlans(): readonly SitePlan[] {
  return planSnapshot.plans;
}

export function getPlanBySlug(slug: string): SitePlan | undefined {
  return planSnapshot.plans.find((plan) => plan.slug === slug);
}

export function planPath(slug: string): `/${string}` {
  return `${PLANS_PATH}/${slug}`;
}

export function planUrl(slug: string): string {
  return `${EVERYBIBLE_SITE_URL}${planPath(slug)}`;
}

/** Covers are 4:3 plates, 800 × 600 on the web. */
export const PLAN_COVER_SIZE = { width: 800, height: 600 } as const;

export function planCoverPath(plan: Pick<SitePlan, 'cover'>): `/${string}` {
  return `${PLANS_PATH}/covers/${plan.cover}.webp`;
}

/* ── Readings ───────────────────────────────────────────────────── */

function book(id: string): SiteBibleBook {
  const found = bibleBookById(id);
  if (!found) throw new Error(`Unknown Bible book ${id}`);
  return found;
}

/** "Psalm 23" for one psalm, "Psalms 1–4" for several. */
function bookName(id: string, oneChapter: boolean): string {
  return id === 'PSA' && oneChapter ? 'Psalm' : book(id).name;
}

/**
 * "Genesis 1–3", "Psalm 23", "John 3:16–21", "Matthew 5–7", "Jude". A whole
 * one-chapter book is named alone, as it is usually cited.
 */
export function readingLabel(reading: PlanReading): string {
  const { chapter, toChapter, verse, toVerse } = reading;
  const oneChapter = toChapter === undefined || toChapter === chapter;
  const name = bookName(reading.book, oneChapter);
  if (verse !== undefined) {
    const start = `${name} ${chapter}:${verse}`;
    if (toVerse === undefined) return start;
    return oneChapter ? `${start}–${toVerse}` : `${start}–${toChapter}:${toVerse}`;
  }
  if (!oneChapter) return `${name} ${chapter}–${toChapter}`;
  return book(reading.book).chapters === 1 ? name : `${name} ${chapter}`;
}

/** The chapter the reading starts in, at its first verse when it starts mid-chapter. */
export function readingPath(reading: PlanReading): `/${string}` {
  return bibleChapterPath(book(reading.book), reading.chapter, reading.verse);
}

/** Every chapter a reading opens, in order, as "BOOK chapter" keys. */
function readingChapters(reading: PlanReading): string[] {
  const last = reading.toChapter ?? reading.chapter;
  return Array.from(
    { length: last - reading.chapter + 1 },
    (_, index) => `${reading.book} ${reading.chapter + index}`
  );
}

function dayReadings(day: PlanDay): PlanReading[] {
  return day.sessions.flatMap((session) => session.readings);
}

/* ── Days and length ────────────────────────────────────────────── */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A weekly plan's day 1 is Sunday, as in the app; every other plan counts days. */
export function dayLabel(plan: Pick<SitePlan, 'schedule'>, day: number): string {
  return plan.schedule === 'weekly' ? WEEKDAYS[day - 1] : `Day ${day}`;
}

/**
 * "7 days", "365 days". A recurring plan runs by the calendar and never ends,
 * so it says how it repeats instead of a count: a monthly plan lists 31 days
 * but a shorter month reads fewer of them (the app's getPlanDayCount).
 */
export function planLengthLabel(plan: Pick<SitePlan, 'schedule' | 'durationDays'>): string {
  if (plan.schedule === 'monthly') return 'Every month';
  if (plan.schedule === 'weekly') return 'Every week';
  return `${plan.durationDays} ${plan.durationDays === 1 ? 'day' : 'days'}`;
}

/** "7 days", or "Every week · Morning + Evening" for a multi-session rhythm. */
export function planMetaLabel(plan: Pick<SitePlan, 'schedule' | 'durationDays' | 'sessions'>) {
  return [planLengthLabel(plan), plan.sessions.join(' + ')].filter(Boolean).join(' · ');
}

/** How the plan's days meet the calendar, in the app's terms. */
export function planScheduleSentence(plan: Pick<SitePlan, 'schedule' | 'sessions'>): string {
  const sessions =
    plan.sessions.length > 1
      ? ` Readings are set for the ${listNames(plan.sessions.map((name) => name.toLowerCase()))}.`
      : '';
  if (plan.schedule === 'monthly')
    return (
      'This plan follows the calendar rather than a start date: on the 14th of any month you read Day 14, ' +
      'and it begins again on the 1st. In a month with fewer than 31 days, it ends on the month’s last day.' +
      sessions
    );
  if (plan.schedule === 'weekly')
    return (
      'This plan follows the days of the week: each Sunday you read Sunday’s reading, and it begins again every week.' +
      sessions
    );
  return (
    'Day 1 is the day you start. EveryBible keeps your place, marks each day you read and opens every reading in the Bible reader.' +
    sessions
  );
}

/* ── Summaries ──────────────────────────────────────────────────── */

/** "Matthew, Mark, Luke and John". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const formatCount = (value: number) => new Intl.NumberFormat('en').format(value);

export interface PlanScope {
  /** Book ids in canonical order. */
  books: string[];
  /** Distinct chapters opened; a verse range counts its chapter. */
  chapters: number;
  /** Every chapter of each of its books is read. */
  wholeBooks: boolean;
  /** Some reading is a verse range rather than whole chapters. */
  passages: boolean;
}

export function planScope(plan: Pick<SitePlan, 'days'>): PlanScope {
  const readings = plan.days.flatMap(dayReadings);
  const chapters = new Set(readings.flatMap(readingChapters));
  const ids = new Set(readings.map((reading) => reading.book));
  const books = SITE_BIBLE_BOOKS.map(({ id }) => id).filter((id) => ids.has(id));
  return {
    books,
    chapters: chapters.size,
    wholeBooks: chapters.size === books.reduce((sum, id) => sum + book(id).chapters, 0),
    passages: readings.some((reading) => reading.verse !== undefined),
  };
}

/** Up to five books by name; beyond that a count. */
const MAX_NAMED_BOOKS = 5;

/**
 * What the plan reads, counted from its schedule: "Every chapter of the Bible:
 * 66 books, 1,189 chapters.", "All of Psalms: 150 chapters.", "15 chapters
 * from 9 books of the Bible."
 */
export function planScopeSentence(plan: Pick<SitePlan, 'days'>): string {
  const scope = planScope(plan);
  const names = scope.books.map((id) => book(id).name);
  const named = names.length <= MAX_NAMED_BOOKS;
  const chapters = `${formatCount(scope.chapters)} chapter${scope.chapters === 1 ? '' : 's'}`;
  if (scope.wholeBooks) {
    if (names.length === 66) return `Every chapter of the Bible: 66 books, ${chapters}.`;
    if (named) return `All of ${listNames(names)}: ${chapters}.`;
    return `${names.length} whole books, ${names[0]} to ${names.at(-1)}: ${chapters}.`;
  }
  const from = named ? listNames(names) : `${names.length} books of the Bible`;
  return scope.passages ? `Selected passages from ${from}.` : `${chapters} from ${from}.`;
}

/**
 * Chapters a day for a plan of whole chapters: exact when every day reads the
 * same number, otherwise the average. Null for passages and recurring plans,
 * where a count would mislead.
 */
export function planPaceSentence(plan: Pick<SitePlan, 'days' | 'schedule'>): string | null {
  if (plan.schedule !== 'sequential' || planScope(plan).passages) return null;
  const counts = plan.days.map((day) => dayReadings(day).flatMap(readingChapters).length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (min === max) return `${min} chapter${min === 1 ? '' : 's'} a day.`;
  const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  const rounded = Math.round(average);
  return rounded <= 1 ? `1 or 2 chapters a day.` : `About ${rounded} chapters a day.`;
}

/* ── Long schedules ─────────────────────────────────────────────── */

/** Plans longer than a month are shown in collapsible blocks of 30 days. */
export const DAY_BLOCK_SIZE = 30;

export function shouldBlockDays(plan: Pick<SitePlan, 'days'>): boolean {
  return plan.days.length > 31;
}

export interface DayBlock {
  first: number;
  last: number;
  days: PlanDay[];
}

export function dayBlocks(days: readonly PlanDay[], size = DAY_BLOCK_SIZE): DayBlock[] {
  const blocks: DayBlock[] = [];
  for (let index = 0; index < days.length; index += size) {
    const slice = days.slice(index, index + size);
    blocks.push({ first: slice[0].day, last: slice.at(-1)!.day, days: slice });
  }
  return blocks;
}

/** Where a block starts and ends: "Genesis 1 – Exodus 12", or "Psalms 1–60" within one book. */
export function blockSpanLabel(days: readonly PlanDay[]): string {
  const readings = days.flatMap(dayReadings);
  const first = readings[0];
  const last = readings.at(-1)!;
  const end = last.toChapter ?? last.chapter;
  const place = (id: string, chapter: number) =>
    book(id).chapters === 1 ? book(id).name : `${bookName(id, true)} ${chapter}`;
  if (first.book === last.book)
    return first.chapter === end
      ? place(first.book, end)
      : `${bookName(first.book, false)} ${first.chapter}–${end}`;
  return `${place(first.book, first.chapter)} – ${place(last.book, end)}`;
}

/* ── Catalog sections ───────────────────────────────────────────── */

export interface PlanGroup {
  id: string;
  label: string;
  plans: SitePlan[];
}

/** Recurring plans all sit in the app's "Daily rhythms" section, whatever their category. */
export function planGroupId(plan: Pick<SitePlan, 'schedule' | 'category'>): string {
  return plan.schedule === 'sequential' ? plan.category : DAILY_RHYTHMS_GROUP;
}

/**
 * The app's Find plans layout (plansHomeModel.groupCatalogPlans): Daily
 * rhythms, then Seasons of life, then each other category in catalog order.
 */
export function groupPlans(
  plans: readonly SitePlan[],
  labels: Readonly<Record<string, string>> = planSnapshot.groupLabels
): PlanGroup[] {
  const groups = new Map<string, SitePlan[]>([
    [DAILY_RHYTHMS_GROUP, []],
    ['life-situation', []],
  ]);
  for (const plan of plans) {
    const id = planGroupId(plan);
    groups.set(id, [...(groups.get(id) ?? []), plan]);
  }
  return [...groups]
    .filter(([, members]) => members.length > 0)
    .map(([id, members]) => ({ id, label: labels[id] ?? id, plans: members }));
}

/**
 * Other plans from the same section, starting with the ones after this plan
 * and wrapping round, so neighbouring pages link to different plans.
 */
export function relatedPlans(
  plan: SitePlan,
  plans: readonly SitePlan[] = getPlans(),
  limit = 4
): SitePlan[] {
  const group = plans.filter((other) => planGroupId(other) === planGroupId(plan));
  const index = group.findIndex((other) => other.id === plan.id);
  return [...group.slice(index + 1), ...group.slice(0, index)].slice(0, limit);
}

/* ── SEO ────────────────────────────────────────────────────────── */

/** Search results cut titles at about 60 characters and descriptions at about 160. */
export const TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 160;

function firstThatFits(candidates: readonly string[], limit: number): string {
  return candidates.find((candidate) => candidate.length <= limit) ?? candidates.at(-1)!;
}

/**
 * The page heading. "Seasons of life" plans are named for the feeling alone
 * (Anxiety), which only reads in the app's section; the page names the plan.
 */
export function planHeading(plan: Pick<SitePlan, 'title' | 'category'>): string {
  return plan.category === 'life-situation' ? `Bible Reading Plan for ${plan.title}` : plan.title;
}

/** "365-Day", "Monthly", "Weekly". */
function planKind(plan: Pick<SitePlan, 'schedule' | 'durationDays'>): string {
  if (plan.schedule === 'monthly') return 'Monthly';
  if (plan.schedule === 'weekly') return 'Weekly';
  return `${plan.durationDays}-Day`;
}

export function planPageTitle(
  plan: Pick<SitePlan, 'title' | 'category' | 'schedule' | 'durationDays'>
): string {
  const heading = planHeading(plan);
  const kind = planKind(plan);
  const candidates =
    plan.category === 'life-situation'
      ? [`${heading} — ${plan.durationDays} Days | ${SITE_NAME}`, heading]
      : [
          `${heading} — ${kind} Bible Reading Plan | ${SITE_NAME}`,
          `${heading} — ${kind} Reading Plan | ${SITE_NAME}`,
          `${heading} — ${kind} Reading Plan`,
          `${heading} | ${SITE_NAME}`,
          heading,
        ];
  return firstThatFits(candidates, TITLE_MAX_LENGTH);
}

/** The plan's own description stays; the invitation shortens or goes to fit. */
export function planPageDescription(
  plan: Pick<SitePlan, 'title' | 'description' | 'category' | 'schedule' | 'durationDays'>
): string {
  const noun =
    plan.category === 'life-situation'
      ? `Bible reading plan for ${plan.title.toLowerCase()}`
      : `${planKind(plan).toLowerCase()} Bible reading plan`;
  const article = /^[aeiou8]/i.test(noun) ? 'An' : 'A';
  return firstThatFits(
    [
      `${plan.description} ${article} free ${noun} with every day’s readings, in the EveryBible app.`,
      `${plan.description} ${article} free ${noun} in the EveryBible app.`,
      `${plan.description} Free in the EveryBible app.`,
      plan.description,
    ],
    DESCRIPTION_MAX_LENGTH
  );
}

/** Shares show the plan's own cover plate rather than the site card. */
export function planPageMetadata(plan: SitePlan): Metadata {
  const metadata = pageMetadata({
    title: planPageTitle(plan),
    description: planPageDescription(plan),
    path: planPath(plan.slug),
  });
  const image = {
    url: planCoverPath(plan),
    ...PLAN_COVER_SIZE,
    type: 'image/webp',
    alt: `Cover artwork for ${plan.title}`,
  };
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, images: [image] },
    twitter: { ...metadata.twitter, images: [image] },
  };
}

export const PLANS_HUB_TITLE = `Free Bible Reading Plans | ${SITE_NAME}`;

export function plansHubDescription(count = getPlans().length): string {
  return `${count} free Bible reading plans: the whole Bible in a year, the Gospels and Psalms, and seven-day plans for anxiety, loss, fear and more. Start one in EveryBible.`;
}

function breadcrumb(url: string, trail: readonly { name: string; item: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      ...entry,
    })),
  };
}

const website = {
  '@type': 'WebSite',
  '@id': `${EVERYBIBLE_SITE_URL}/#website`,
  name: SITE_NAME,
  url: `${EVERYBIBLE_SITE_URL}/`,
};

const HOME_CRUMB = { name: 'Home', item: `${EVERYBIBLE_SITE_URL}/` };
const PLANS_CRUMB = { name: 'Reading plans', item: `${EVERYBIBLE_SITE_URL}${PLANS_PATH}` };

/** schema.org JSON-LD for a plan page: the page, its cover and its breadcrumb trail. */
export function planPageStructuredData(plan: SitePlan) {
  const url = planUrl(plan.slug);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: planPageTitle(plan),
        description: planPageDescription(plan),
        inLanguage: 'en',
        isPartOf: website,
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${EVERYBIBLE_SITE_URL}${planCoverPath(plan)}`,
          ...PLAN_COVER_SIZE,
        },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      breadcrumb(url, [HOME_CRUMB, PLANS_CRUMB, { name: plan.title, item: url }]),
    ],
  };
}

/** The catalog page as a collection with every plan listed in order. */
export function plansHubStructuredData(plans: readonly SitePlan[] = getPlans()) {
  const url = `${EVERYBIBLE_SITE_URL}${PLANS_PATH}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url,
        name: PLANS_HUB_TITLE,
        description: plansHubDescription(plans.length),
        inLanguage: 'en',
        isPartOf: website,
        mainEntity: { '@id': `${url}#plans` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#plans`,
        numberOfItems: plans.length,
        itemListElement: plans.map((plan, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: plan.title,
          url: planUrl(plan.slug),
        })),
      },
      breadcrumb(url, [HOME_CRUMB, PLANS_CRUMB]),
    ],
  };
}

/** /plans/sitemap.xml: the catalog and every plan. Plans change with app releases, not dates, so no lastModified. */
export function buildPlansSitemap(plans: readonly SitePlan[] = getPlans()): MetadataRoute.Sitemap {
  return [
    { url: `${EVERYBIBLE_SITE_URL}${PLANS_PATH}`, changeFrequency: 'monthly', priority: 0.8 },
    ...plans.map((plan) => ({
      url: planUrl(plan.slug),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
