import assert from 'node:assert/strict';
import test from 'node:test';
import { bibleBooks } from '../constants/books';
import { en } from '../i18n/locales/en';
import { localeLoaders } from '../i18n/localeLoaders';
import {
  addLocalDays,
  getLocalDaysBetween,
  getOrthodoxEaster,
  getSeason,
  getWesternEaster,
  type SeasonalScheduleMode,
} from '../services/plans/churchCalendar';
import { isRecurringPlan, isSeasonalPlan } from '../services/plans/readingPlanModel';
import { assertDefined } from '../utils/assertDefined';
import { readingPlanEntriesByPlanId, readingPlans } from './readingPlans.generated';

const CATEGORIES = new Set([
  'chronological',
  'topical',
  'book-study',
  'devotional',
  'life-situation',
  'church-year',
  'seasonal',
  'custom',
]);
const chaptersByBook = new Map(bibleBooks.map((book) => [book.id, book.chapters]));

const entriesOf = (planId: string) =>
  assertDefined(readingPlanEntriesByPlanId[planId], `entries for ${planId}`);

const lookup = (resource: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      resource
    );

/** The run of a seasonal plan that starts in `year` (Advent 2027 starts in 2027). */
const runStartingIn = (mode: SeasonalScheduleMode, year: number) => {
  const candidates = [new Date(year, 0, 1), new Date(year, 5, 15), new Date(year, 11, 31)].map(
    (day) => getSeason(mode, day)
  );
  const run = candidates.find((candidate) => candidate.start.getFullYear() === year);
  return assertDefined(run, `${mode} run starting in ${year}`);
};

test('every plan has unique ids and slugs, a valid category, and a whole-day duration', () => {
  assert.equal(new Set(readingPlans.map((plan) => plan.id)).size, readingPlans.length);
  assert.equal(new Set(readingPlans.map((plan) => plan.slug)).size, readingPlans.length);
  for (const plan of readingPlans) {
    assert.match(plan.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${plan.id} slug`);
    assert.match(plan.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${plan.id} id`);
    assert.ok(plan.category && CATEGORIES.has(plan.category), `${plan.id} category`);
    assert.ok(Number.isInteger(plan.duration_days) && plan.duration_days > 0, plan.id);
    assert.ok(plan.coverKey, `${plan.id} cover`);
  }
});

test('every plan entry names a canonical book, a real chapter range and sane verses', () => {
  for (const plan of readingPlans) {
    const ids = new Set<string>();
    for (const entry of entriesOf(plan.id)) {
      assert.ok(!ids.has(entry.id), `duplicate entry id ${entry.id}`);
      ids.add(entry.id);
      assert.equal(entry.plan_id, plan.id, entry.id);
      const chapters = chaptersByBook.get(entry.book);
      assert.ok(chapters, `${entry.id}: unknown book ${entry.book}`);
      const end = entry.chapter_end ?? entry.chapter_start;
      assert.ok(Number.isInteger(entry.chapter_start) && entry.chapter_start >= 1, entry.id);
      assert.ok(entry.chapter_start <= end, `${entry.id}: start after end`);
      assert.ok(end <= chapters, `${entry.id}: ${entry.book} has only ${chapters} chapters`);
      if (entry.verse_start != null && entry.verse_end != null && end === entry.chapter_start) {
        assert.ok(entry.verse_start <= entry.verse_end, `${entry.id}: verses reversed`);
      }
    }
  }
});

test('plan days run 1..duration with no gaps and at least one entry each', () => {
  for (const plan of readingPlans) {
    const days = entriesOf(plan.id).map((entry) => entry.day_number);
    assert.ok(
      days.every((day) => Number.isInteger(day)),
      plan.id
    );
    assert.deepEqual(
      [...new Set(days)].sort((a, b) => a - b),
      Array.from({ length: plan.duration_days }, (_, index) => index + 1),
      plan.id
    );
  }
});

test('a plan never reads the same whole chapter twice unless it is a recurring plan', () => {
  for (const plan of readingPlans) {
    if (isRecurringPlan(plan) || isSeasonalPlan(plan)) {
      continue;
    }
    const seen = new Set<string>();
    for (const entry of entriesOf(plan.id)) {
      // Verse-level entries may split one chapter across several readings.
      if (entry.verse_start != null || entry.verse_end != null) {
        continue;
      }
      const end = entry.chapter_end ?? entry.chapter_start;
      for (let chapter = entry.chapter_start; chapter <= end; chapter += 1) {
        const key = `${entry.book} ${chapter}`;
        assert.ok(!seen.has(key), `${plan.id}: ${key} is read twice (day ${entry.day_number})`);
        seen.add(key);
      }
    }
  }
});

test('every plan title and description key resolves to text in all 21 locales', async () => {
  const locales: Array<[string, unknown]> = [['en', en]];
  for (const [code, load] of Object.entries(localeLoaders)) {
    locales.push([code, await load()]);
  }
  assert.equal(locales.length, 21);
  for (const plan of readingPlans) {
    const keys = [plan.title_key, plan.description_key].filter(
      (key): key is string => key !== null
    );
    assert.ok(keys.length >= 1, `${plan.id} has no copy`);
    for (const [code, resource] of locales) {
      for (const key of keys) {
        const value = lookup(resource, key);
        assert.ok(
          typeof value === 'string' && value.trim().length > 0,
          `${plan.id}: ${key} missing in ${code}`
        );
      }
    }
  }
});

test('Western Easter and Orthodox Pascha match the published dates for 2025-2035', () => {
  const western = [
    [4, 20],
    [4, 5],
    [3, 28],
    [4, 16],
    [4, 1],
    [4, 21],
    [4, 13],
    [3, 28],
    [4, 17],
    [4, 9],
    [3, 25],
  ] as const;
  const orthodox = [
    [4, 20],
    [4, 12],
    [5, 2],
    [4, 16],
    [4, 8],
    [4, 28],
    [4, 13],
    [5, 2],
    [4, 24],
    [4, 9],
    [4, 29],
  ] as const;
  western.forEach(([month, day], index) => {
    const year = 2025 + index;
    assert.deepEqual(getWesternEaster(year), new Date(year, month - 1, day), `western ${year}`);
  });
  orthodox.forEach(([month, day], index) => {
    const year = 2025 + index;
    assert.deepEqual(getOrthodoxEaster(year), new Date(year, month - 1, day), `orthodox ${year}`);
  });
});

test('every seasonal plan fits its season in every year 2025-2035', () => {
  const seasonal = readingPlans.filter((plan) => isSeasonalPlan(plan));
  assert.equal(seasonal.length, 13);
  for (const plan of seasonal) {
    const mode = plan.scheduleMode as SeasonalScheduleMode;
    for (let year = 2025; year <= 2035; year += 1) {
      const run = runStartingIn(mode, year);
      // A short season (Advent can be 22 days) reads a prefix of the plan.
      assert.ok(
        run.dayCount >= 1 && run.dayCount <= plan.duration_days,
        `${plan.id} ${year}: season runs ${run.dayCount} days, plan has ${plan.duration_days}`
      );
    }
  }
});

test('the Easter-cycle seasons chain correctly in every year 2025-2035', () => {
  for (let year = 2025; year <= 2035; year += 1) {
    const easter = getWesternEaster(year);
    const lent = runStartingIn('calendar-lent', year);
    const holy = runStartingIn('calendar-holy-week', year);
    const easterSeason = runStartingIn('calendar-easter', year);
    const pentecost = runStartingIn('calendar-pentecost', year);
    assert.equal(lent.start.getDay(), 3, `Ash Wednesday ${year}`);
    assert.equal(holy.start.getDay(), 0, `Palm Sunday ${year}`);
    assert.equal(
      getLocalDaysBetween(addLocalDays(lent.start, lent.dayCount), holy.start),
      0,
      `${year}`
    );
    assert.equal(
      getLocalDaysBetween(addLocalDays(holy.start, holy.dayCount - 1), easter),
      0,
      `${year}`
    );
    assert.equal(getLocalDaysBetween(easter, easterSeason.start), 1, `${year}`);
    assert.equal(
      getLocalDaysBetween(addLocalDays(easterSeason.start, easterSeason.dayCount), pentecost.start),
      0,
      `${year}`
    );
    assert.equal(pentecost.start.getDay(), 4, `Ascension Thursday ${year}`);
    assert.equal(
      getLocalDaysBetween(easter, addLocalDays(pentecost.start, pentecost.dayCount - 1)),
      49,
      `Pentecost ${year}`
    );
  }
});

test('Advent starts on a Sunday between 27 Nov and 3 Dec and ends on Christmas Eve', () => {
  for (let year = 2025; year <= 2035; year += 1) {
    const advent = runStartingIn('calendar-advent', year);
    assert.equal(advent.start.getDay(), 0, `Advent ${year}`);
    assert.ok(advent.dayCount >= 22 && advent.dayCount <= 28, `Advent ${year}`);
    assert.equal(
      getLocalDaysBetween(addLocalDays(advent.start, advent.dayCount - 1), new Date(year, 11, 24)),
      0,
      `Advent ${year}`
    );
  }
});
