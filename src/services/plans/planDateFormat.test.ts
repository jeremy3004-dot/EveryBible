import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { readingPlans } from '../../data/readingPlans.generated';
import { formatLedgerCycleDate } from '../../screens/plans/planDetail/planDetailLedgerModel';
import { formatPlanSeasonDates } from '../../screens/plans/plansHome/plansHomeModel';
import { formatPlanMonthDay } from './planDateFormat';
import { getPlanSeason, isSeasonalPlan } from './readingPlanModel';

// What the call sites did before the shared formatter: one toLocaleDateString per date.
const legacyMonthDay = (date: Date, locale?: string) =>
  date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });

// Every interface language, plus the device-default cases the callers can pass.
const LOCALES: (string | undefined)[] = [
  ...SUPPORTED_LANGUAGES.map((language) => language.code),
  undefined,
  '',
];

test('formatPlanMonthDay equals toLocaleDateString for every interface language and every day of 2024 to 2027', () => {
  for (const locale of LOCALES) {
    for (let offset = 0; offset < 1461; offset += 1) {
      const date = new Date(2024, 0, 1 + offset);
      assert.equal(
        formatPlanMonthDay(date, locale),
        legacyMonthDay(date, locale),
        `${date.toDateString()} ${locale}`
      );
    }
  }
});

test('formatPlanMonthDay follows a language switch on every call', () => {
  // Alternating languages rebuilds the single cached formatter each time, the worst case.
  for (let offset = 0; offset < 40; offset += 1) {
    const date = new Date(2026, 8, 1 + offset);
    for (const locale of LOCALES) {
      assert.equal(formatPlanMonthDay(date, locale), legacyMonthDay(date, locale));
    }
  }
});

test('formatLedgerCycleDate keeps its output for every language', () => {
  for (const locale of LOCALES) {
    for (let day = 1; day <= 31; day += 1) {
      const date = new Date(2026, 9, day);
      assert.equal(formatLedgerCycleDate(date, locale), legacyMonthDay(date, locale));
    }
  }
});

test('formatPlanSeasonDates keeps its output for every seasonal plan in the real catalog', () => {
  const seasonalPlans = readingPlans.filter((plan) => isSeasonalPlan(plan));
  assert.ok(seasonalPlans.length >= 10);

  for (const today of [new Date(2026, 0, 15), new Date(2026, 9, 1), new Date(2026, 11, 20)]) {
    for (const plan of seasonalPlans) {
      const season = getPlanSeason(plan, today);
      assert.ok(season, plan.id);
      const end = new Date(
        season.start.getFullYear(),
        season.start.getMonth(),
        season.start.getDate() + season.dayCount - 1
      );
      for (const locale of LOCALES) {
        assert.equal(
          formatPlanSeasonDates(season, locale),
          `${legacyMonthDay(season.start, locale)} – ${legacyMonthDay(end, locale)}`,
          `${plan.id} ${locale}`
        );
      }
    }
  }
});

test('an unknown language still throws, as toLocaleDateString did, and the next valid call recovers', () => {
  assert.throws(() => formatPlanMonthDay(new Date(2026, 0, 1), 'not a locale!'), RangeError);
  assert.equal(
    formatPlanMonthDay(new Date(2026, 0, 1), 'en'),
    legacyMonthDay(new Date(2026, 0, 1), 'en')
  );
});
