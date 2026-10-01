import assert from 'node:assert/strict';
import test from 'node:test';

import {
  homePlanTitle,
  isChurchYearSeason,
  selectHomePlans,
  STARTER_PLAN_SLUGS,
} from './home-plans';
import { getPlans } from './plan-pages';

test('plan titles come from the app locale files, falling back to English with lang="en"', () => {
  const plan = getPlans().find((candidate) => candidate.slug === 'advent');
  assert.ok(plan);
  assert.deepEqual(homePlanTitle(plan, 'en'), { title: plan.title });
  const spanish = homePlanTitle(plan, 'es');
  assert.notEqual(spanish.title, plan.title);
  assert.equal(spanish.lang, undefined);
  assert.deepEqual(homePlanTitle(plan, 'xx'), { title: plan.title, lang: 'en' });
});

const slugs = (today: Date) => selectHomePlans(getPlans(), today).plans.map((plan) => plan.slug);

test('every starter and church-year slug exists in the plan data', () => {
  const have = new Set(getPlans().map((plan) => plan.slug));
  for (const slug of [...STARTER_PLAN_SLUGS, 'advent', 'twelve-days-of-christmas']) {
    assert.ok(have.has(slug), slug);
  }
});

test('the season runs Nov 1 through Jan 6', () => {
  assert.equal(isChurchYearSeason(new Date('2026-10-31T12:00:00Z')), false);
  assert.equal(isChurchYearSeason(new Date('2026-11-01T00:00:00Z')), true);
  assert.equal(isChurchYearSeason(new Date('2026-12-25T12:00:00Z')), true);
  assert.equal(isChurchYearSeason(new Date('2027-01-06T23:59:00Z')), true);
  assert.equal(isChurchYearSeason(new Date('2027-01-07T00:00:00Z')), false);
  assert.equal(isChurchYearSeason(new Date('2026-07-04T12:00:00Z')), false);
});

test('in season the shelf leads with Advent and Christmas', () => {
  const today = new Date('2026-12-01T12:00:00Z');
  assert.equal(selectHomePlans(getPlans(), today).seasonal, true);
  assert.deepEqual(slugs(today), [
    'advent',
    'twelve-days-of-christmas',
    'life-anxiety-7-days',
    'gospels-30-days',
  ]);
});

test('out of season the shelf is the four starters', () => {
  const today = new Date('2026-10-01T12:00:00Z');
  assert.equal(selectHomePlans(getPlans(), today).seasonal, false);
  assert.deepEqual(slugs(today), [...STARTER_PLAN_SLUGS]);
});

test('slugs missing from the data are skipped', () => {
  const only = getPlans().filter((plan) => plan.slug === 'psalms-30-days');
  assert.deepEqual(
    selectHomePlans(only, new Date('2026-10-01T12:00:00Z')).plans.map((plan) => plan.slug),
    ['psalms-30-days']
  );
});
