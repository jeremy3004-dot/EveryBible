/**
 * Times the pure functions the UI runs synchronously on user-facing navigation paths, on real
 * inputs (bundled BSB chapters, the real plan catalog, gather data, locale catalog).
 *
 *   node --import tsx scripts/bench-hotpaths.ts                  # print the table
 *   node --import tsx scripts/bench-hotpaths.ts --out before.json
 *   node --import tsx scripts/bench-hotpaths.ts --compare before.json
 *
 * Numbers are Node/V8 milliseconds (median of N after warmup). Hermes has no JIT and runs
 * roughly 5-10x slower on a low-end phone, so the table also shows an x7 estimate. Anything
 * above ~8 ms here is above ~50 ms on device, which is where a navigation starts to hitch.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

import { bibleBooks } from '../src/constants/books';
import { readingPlans, readingPlanEntriesByPlanId } from '../src/data/readingPlans.generated';
import { gatherFoundations } from '../src/data/gatherFoundations';
import { gatherWisdomCategories } from '../src/data/gatherWisdom';
import localeCatalog from '../src/data/localeCatalog.json';
import {
  normalizeClosingQuoteSpacing,
  normalizeVerseFormatting,
  normalizeVerseFormattingQuotes,
  reconcileVerseFormattingWithText,
} from '../src/services/bible/verseFormatting';
import {
  buildBibleFallbackSearchTerms,
  buildBibleSearchQuery,
  buildBibleSubstringSearchTerms,
} from '../src/services/bible/bibleDataModel';
import { buildReaderParagraphs } from '../src/screens/bible/bibleReaderModel';
import { buildReaderParagraphRenderSignature } from '../src/screens/bible/bibleReaderRenderModel';
import {
  buildTranslationLanguageFilters,
  buildTranslationLanguageSearchIndex,
  buildTranslationSearchIndex,
  filterTranslationsBySearchQuery,
  searchTranslationIndex,
} from '../src/screens/bible/bibleTranslationModel';
import {
  formatPlanSeasonDates,
  getActivePlanRows,
  getCompletedPlanItems,
  groupCatalogPlans,
  splitActivePlanRows,
} from '../src/screens/plans/plansHome/plansHomeModel';
import {
  buildSearchablePlans,
  createPlanSearchIndex,
  filterCatalogPlans,
} from '../src/screens/plans/plansHome/planCatalogSearchModel';
import {
  buildPlanDayViewModels,
  formatLedgerCycleDate,
  getLedgerCellStates,
  getNextLedgerDayNumber,
  groupEntriesByDay,
  orderLedgerRows,
} from '../src/screens/plans/planDetail/planDetailLedgerModel';
import {
  getActivePlanDayNumber,
  getPlanLedgerDayNumbers,
  isMultiSessionPlan,
  getPlanSeason,
  isPlanOfferedToday,
  isSeasonalPlan,
} from '../src/services/plans/readingPlanModel';
import { getCurrentPlanDaySummary } from '../src/services/plans/readingPlanActivity';
import { buildHomeReadingHeatmap } from '../src/screens/home/homeReadingHeatmapModel';
import { getHomeReadingStats } from '../src/screens/home/homeReadingStatsModel';
import { selectHomePlanShelf } from '../src/screens/home/homePlanShelfModel';
import { selectHomeSeasonPlan } from '../src/screens/home/homeSeasonPlanModel';
import { resolveGatherUpNext } from '../src/screens/learn/gatherPathModel';
import {
  buildReadingActivityMonthView,
  getDailyChapterCounts,
} from '../src/services/progress/readingActivity';
import type { ReadingPlan, UserReadingPlanProgress } from '../src/services/plans/types';
import type { Verse } from '../src/types';

// readingPlanActivity reads the app language through require('../../i18n'). That module pulls in
// react-native, which Node cannot parse, so every call would throw and the failed require would
// dominate the timings (about 1 ms per plan day) while costing nothing in the app, where the
// module is loaded and cached. Seed the require cache with a stand-in so the bench times the
// real code path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const i18nPath = require.resolve('../src/i18n');
require.cache[i18nPath] = {
  id: i18nPath,
  filename: i18nPath,
  loaded: true,
  exports: { default: { language: 'en' } },
} as unknown as NodeJS.Module;

interface Row {
  fn: string;
  input: string;
  ms: number;
}
const rows: Row[] = [];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Median of `runs` timed calls after `warmup` untimed ones. */
function bench(fn: string, input: string, run: () => unknown, runs = 30, warmup = 5): void {
  for (let i = 0; i < warmup; i += 1) run();
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  rows.push({ fn, input, ms: median(samples) });
}

// --- Real chapter data ----------------------------------------------------------------------
const db = new DatabaseSync('assets/databases/bible-bsb-v2.db', { readOnly: true });
interface VerseRow {
  id: number;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  heading: string | null;
  formatting: string | null;
}
const loadChapterRows = (bookId: string, chapter: number): VerseRow[] =>
  db
    .prepare(
      `SELECT id, book_id, chapter, verse, text, heading, formatting FROM verses
       WHERE translation_id = 'bsb' AND book_id = ? AND chapter = ? ORDER BY verse`
    )
    .all(bookId, chapter) as unknown as VerseRow[];

// Mirrors toVerse() in bibleDatabase.ts.
function toVerse(row: VerseRow): Verse {
  const text = normalizeClosingQuoteSpacing(row.text);
  return {
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text,
    heading: row.heading ?? undefined,
    formatting: reconcileVerseFormattingWithText(
      text,
      normalizeVerseFormattingQuotes(normalizeVerseFormatting(row.formatting))
    ),
  };
}

for (const [bookId, chapter, label] of [
  ['PSA', 119, 'Psalm 119 (176 v)'],
  ['GEN', 24, 'Genesis 24 (67 v)'],
  ['ISA', 66, 'Isaiah 66 (24 v)'],
] as const) {
  const chapterRows = loadChapterRows(bookId, chapter);
  bench('toVerse x chapter (normalize+reconcile)', label, () => chapterRows.map(toVerse));
  const verses = chapterRows.map(toVerse);
  bench('buildReaderParagraphs', label, () => buildReaderParagraphs(verses));
  bench('buildReaderParagraphRenderSignature', label, () =>
    buildReaderParagraphRenderSignature({
      premium: true,
      verseFontSize: 18,
      verseLineHeight: 28,
      verseNumberSize: 11,
      headingFontSize: 20,
      colors: {
        biblePrimaryText: '#111',
        bibleSecondaryText: '#222',
        bibleAccent: '#333',
        bibleFollowHighlight: '#444',
        bibleFollowVerseNumber: '#555',
      },
      annotations: [],
    })
  );
}
// Whole-chapter sweep: every BSB chapter, to expose the worst case rather than three samples.
{
  const all = db
    .prepare(`SELECT DISTINCT book_id, chapter FROM verses WHERE translation_id = 'bsb'`)
    .all() as unknown as { book_id: string; chapter: number }[];
  const perChapter = all.map(({ book_id, chapter }) => loadChapterRows(book_id, chapter));
  bench(
    'toVerse x all 1,189 chapters',
    'BSB, whole Bible',
    () => perChapter.forEach((chapterRows) => chapterRows.map(toVerse)),
    5,
    1
  );
}

// --- Plans ---------------------------------------------------------------------------------
const t = ((key: string, options?: { defaultValue?: string; count?: number }) =>
  options?.defaultValue ?? key) as never;
const today = new Date(2026, 9, 1, 12);
const catalog: ReadingPlan[] = [...readingPlans];

// --- Home -----------------------------------------------------------------------------------
// A heavy user: every chapter of the Bible read once across the past year, a day tally and
// listening time for every day, and a quarter of the chapters also listened to.
const DAY_MS = 86_400_000;
const nowMs = today.getTime();
const chaptersRead: Record<string, number> = {};
const chaptersListened: Record<string, number> = {};
const chaptersByDate: Record<string, number> = {};
const listeningMsByDate: Record<string, number> = {};
let chapterIndex = 0;
for (const book of bibleBooks) {
  for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
    const stamp = nowMs - (chapterIndex % 365) * DAY_MS - (chapterIndex % 17) * 60_000;
    chaptersRead[`${book.id}_${chapter}`] = stamp;
    if (chapterIndex % 4 === 0) chaptersListened[`${book.id}_${chapter}`] = stamp + 3_600_000;
    chapterIndex += 1;
  }
}
for (let day = 0; day < 365; day += 1) {
  const date = new Date(nowMs - day * DAY_MS);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  chaptersByDate[key] = 1 + (day % 5);
  listeningMsByDate[key] = (day % 4) * 600_000;
}
// The 256 most recent completed listens, as the library store keeps them.
const listeningHistory = Array.from({ length: 256 }, (_, index) => ({
  id: `h${index}`,
  bookId: bibleBooks[index % bibleBooks.length]!.id,
  chapter: 1,
  listenedAt: nowMs - index * 3_600_000,
  progress: 1,
}));
const ledgerLabel = `${Object.keys(chaptersRead).length} chapters read, 365 days`;
const heatmapActivity = { chaptersRead, chaptersListened, listeningMsByDate, chaptersByDate };

const progressFor = (plan: ReadingPlan, index: number): UserReadingPlanProgress => ({
  id: `progress-${plan.id}`,
  user_id: 'u',
  plan_id: plan.id,
  started_at: new Date(2026, 5, 1 + (index % 20)).toISOString(),
  completed_entries: Object.fromEntries(
    Array.from({ length: Math.min(plan.duration_days, 40) }, (_, day) => [
      String(day + 1),
      new Date(2026, 5, 2 + day).toISOString(),
    ])
  ),
  completed_sessions: {},
  current_day: Math.min(plan.duration_days, 41),
  current_session: null,
  is_completed: index % 7 === 0,
  completed_at: null,
  synced_at: new Date(2026, 5, 1).toISOString(),
});
const enrolled = catalog.slice(0, 12).map(progressFor);
const progressByPlanId = Object.fromEntries(enrolled.map((p) => [p.plan_id, p]));

bench('groupCatalogPlans', `${catalog.length} plans`, () => groupCatalogPlans(catalog, today));
bench('isPlanOfferedToday filter', `${catalog.length} plans`, () =>
  catalog.filter((plan) => isPlanOfferedToday(plan, today))
);
bench('getActivePlanRows+Completed+split', '12 enrolled', () => {
  splitActivePlanRows(getActivePlanRows(catalog, enrolled, today));
  getCompletedPlanItems(catalog, enrolled);
});
bench('buildSearchablePlans', `${catalog.length} plans`, () => buildSearchablePlans(catalog, t));
const searchable = buildSearchablePlans(catalog, t);
bench(
  'createPlanSearchIndex (Fuse build)',
  `${catalog.length} plans`,
  () => createPlanSearchIndex(searchable),
  15
);
const planIndex = createPlanSearchIndex(searchable);
bench('filterCatalogPlans (per keystroke)', 'query "psalm"', () =>
  filterCatalogPlans(catalog, searchable, planIndex, 'psalm')
);

// Plan detail: the longest plan, a multi-session plan, and a recurring one.
const detailTargets = [
  catalog.reduce((best, plan) => (plan.duration_days > best.duration_days ? plan : best)),
  ...catalog.filter((plan) => isMultiSessionPlan(plan)),
];
for (const plan of detailTargets) {
  const entries = readingPlanEntriesByPlanId[plan.id] ?? [];
  const progress = progressFor(plan, 3);
  progress.is_completed = false;
  const label = `${plan.id} (${plan.duration_days}d, ${entries.length} entries)`;
  bench('groupEntriesByDay', label, () => groupEntriesByDay(entries));
  const entriesByDay = groupEntriesByDay(entries);
  bench('getPlanLedgerDayNumbers', label, () => getPlanLedgerDayNumbers(plan, entries, today));
  const ledgerDayNumbers = getPlanLedgerDayNumbers(plan, entries, today);
  const currentDay = getActivePlanDayNumber(plan, progress, today);
  const summaryInput = {
    plan,
    entries,
    progress,
    chaptersRead,
    chaptersListened,
    listeningHistory,
    today,
  };
  bench('getCurrentPlanDaySummary', `${label}, 1,189-chapter ledger`, () =>
    getCurrentPlanDaySummary(summaryInput)
  );
  const currentDaySummary = getCurrentPlanDaySummary(summaryInput);
  const nextDayNumber = getNextLedgerDayNumber(ledgerDayNumbers, currentDay, false);
  const buildModels = () =>
    buildPlanDayViewModels({
      plan,
      progress,
      entries,
      entriesByDay,
      ledgerDayNumbers,
      currentDay,
      currentDaySummary,
      nextDayNumber,
      isMultiSession: isMultiSessionPlan(plan),
      today,
      locale: 'en',
    });
  bench('buildPlanDayViewModels', label, buildModels);
  const models = buildModels();
  bench('orderLedgerRows', label, () => orderLedgerRows(models, currentDay, true));
  bench('getLedgerCellStates', label, () =>
    getLedgerCellStates({
      plan,
      progress,
      currentDay,
      isCurrentDayComplete: false,
      today,
      totalDays: plan.duration_days,
    })
  );
}

bench('getDailyChapterCounts', ledgerLabel, () => getDailyChapterCounts(heatmapActivity));
bench('buildHomeReadingHeatmap (15 weeks = 105 days)', ledgerLabel, () =>
  buildHomeReadingHeatmap(heatmapActivity, 15, today)
);
bench('getHomeReadingStats allTime', ledgerLabel, () =>
  getHomeReadingStats({ chaptersRead, chaptersListened }, 'allTime', today)
);
bench('buildReadingActivityMonthView', ledgerLabel, () =>
  buildReadingActivityMonthView(chaptersRead, today)
);
bench('selectHomePlanShelf (enrolled)', '12 enrolled', () =>
  selectHomePlanShelf({ plans: catalog, progressByPlanId, today })
);
bench('selectHomePlanShelf (suggested)', 'none enrolled', () =>
  selectHomePlanShelf({ plans: catalog, progressByPlanId: {}, today })
);
bench('selectHomeSeasonPlan', `${catalog.length} plans`, () =>
  selectHomeSeasonPlan({ plans: catalog, progressByPlanId, today })
);

// Worst case for the day grouping: a sync or "mark all read" stamped every chapter on one day.
const sameDayRead = Object.fromEntries(Object.keys(chaptersRead).map((key) => [key, nowMs]));
bench('getDailyChapterCounts (every chapter on one day)', '1189 chapters, 1 day', () =>
  getDailyChapterCounts({
    chaptersRead: sameDayRead,
    chaptersListened: sameDayRead,
    listeningMsByDate: {},
    chaptersByDate: {},
  })
);
bench('getHomeReadingStats allTime (every chapter on one day)', '1189 chapters, 1 day', () =>
  getHomeReadingStats(
    { chaptersRead: sameDayRead, chaptersListened: sameDayRead },
    'allTime',
    today
  )
);
{
  const seasonal = catalog.filter((plan) => isSeasonalPlan(plan));
  const seasons = seasonal.flatMap((plan) => {
    const season = getPlanSeason(plan, today);
    return season ? [season] : [];
  });
  bench('formatPlanSeasonDates', `${seasons.length} seasonal cards`, () =>
    seasons.map((season) => formatPlanSeasonDates(season, 'en'))
  );
  const days = Array.from({ length: 31 }, (_, index) => new Date(2026, 9, 1 + index));
  bench('formatLedgerCycleDate', '31 rhythm rows', () =>
    days.map((day) => formatLedgerCycleDate(day, 'en'))
  );
}
{
  const file = require.resolve('../src/data/readingPlans.generated');
  const saved = require.cache[file];
  bench(
    'readingPlans.generated module eval (first Plans/Home open)',
    '55 plans, 2,159 entries',
    () => {
      delete require.cache[file];
      require(file);
    },
    9,
    2
  );
  require.cache[file] = saved;
}

// --- Gather ---------------------------------------------------------------------------------
const completedLessons = Object.fromEntries(
  gatherFoundations.map((foundation) => [
    foundation.id,
    foundation.lessons.slice(0, -1).map((lesson) => lesson.id),
  ])
);
bench('resolveGatherUpNext', `${gatherFoundations.length} foundations`, () =>
  resolveGatherUpNext(completedLessons, (id) => id)
);
bench('gather wisdom lesson flatten', `${gatherWisdomCategories.length} categories`, () =>
  gatherWisdomCategories.flatMap((category) =>
    category.wisdoms.map((wisdom) => `${category.id}:${wisdom.id}`)
  )
);

// --- Translation picker + Bible search ------------------------------------------------------
const languages = (
  localeCatalog as { languages: { name: string; nativeName: string; code: string }[] }
).languages;
const translations = languages.flatMap((language, index) =>
  [0, 1].map((version) => ({
    id: `${language.code}-${version}`,
    name: `${language.nativeName} Bible ${version + 1}`,
    abbreviation: `${language.code.toUpperCase()}${version + 1}`,
    description: `The ${language.name} Bible, translation ${version + 1}, with text and audio.`,
    language: language.name,
    hasText: true,
    hasAudio: index % 3 === 0,
  }))
);
const translationLabel = `${translations.length} translations`;
bench(
  'buildTranslationSearchIndex',
  translationLabel,
  () => buildTranslationSearchIndex(translations),
  10
);
const translationIndex = buildTranslationSearchIndex(translations);
bench('searchTranslationIndex (per keystroke)', 'query "span"', () =>
  searchTranslationIndex(translationIndex, 'span')
);
bench('searchTranslationIndex (per keystroke)', 'query "english bible"', () =>
  searchTranslationIndex(translationIndex, 'english bible')
);
bench(
  'filterTranslationsBySearchQuery (index+search)',
  translationLabel,
  () => filterTranslationsBySearchQuery(translations, 'span'),
  10
);
bench(
  'buildTranslationLanguageFilters (sorted language list)',
  translationLabel,
  () => buildTranslationLanguageFilters(translations),
  10
);
bench(
  'buildTranslationLanguageSearchIndex',
  translationLabel,
  () => buildTranslationLanguageSearchIndex(translations),
  10
);
for (const query of ['love', 'in the beginning God created', '神爱世人', "God's Spirit"]) {
  bench('Bible search query building', `"${query}"`, () => {
    buildBibleSubstringSearchTerms(query);
    buildBibleSearchQuery(query);
    buildBibleFallbackSearchTerms(query);
  });
}

// --- Verse picture glyph coverage ----------------------------------------------------------
async function benchVerseImage(): Promise<void> {
  const { getDrawableVerseImageFonts } =
    await import('../src/screens/bible/reader/verseImage/verseImageStyle');
  const psalm119 = loadChapterRows('PSA', 119)
    .map((row) => row.text)
    .join(' ');
  let counter = 0;
  // A unique suffix each call defeats the 8-entry cache so this times the real scan.
  bench('getDrawableVerseImageFonts (cold)', `Psalm 119, ${psalm119.length} chars`, () =>
    getDrawableVerseImageFonts(`${psalm119} ${(counter += 1)}`)
  );
  bench('getDrawableVerseImageFonts (cached)', `Psalm 119, ${psalm119.length} chars`, () =>
    getDrawableVerseImageFonts(psalm119)
  );
}

async function main(): Promise<void> {
  try {
    await benchVerseImage();
  } catch (error) {
    console.warn('verse image bench skipped:', (error as Error).message);
  }

  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  if (outIndex >= 0) writeFileSync(args[outIndex + 1]!, JSON.stringify(rows, null, 2));
  const compareIndex = args.indexOf('--compare');
  const before: Row[] =
    compareIndex >= 0 ? JSON.parse(readFileSync(args[compareIndex + 1]!, 'utf8')) : [];
  const beforeFor = (row: Row) =>
    before.find((candidate) => candidate.fn === row.fn && candidate.input === row.input)?.ms;

  console.log('| function | input | ms (Node) | ~ms on low-end Hermes (x7) | before (Node) |');
  console.log('| --- | --- | ---: | ---: | ---: |');
  for (const row of rows) {
    const prior = beforeFor(row);
    console.log(
      `| ${row.fn} | ${row.input} | ${row.ms.toFixed(3)} | ${(row.ms * 7).toFixed(1)} | ${
        prior === undefined ? '' : prior.toFixed(3)
      } |`
    );
  }
}

void main();
