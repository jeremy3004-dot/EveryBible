import assert from 'node:assert/strict';
import test from 'node:test';

import {
  homePlanTitle,
  SEASON_PLAN_SLUGS,
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
  for (const slug of [...STARTER_PLAN_SLUGS, ...SEASON_PLAN_SLUGS]) {
    assert.ok(have.has(slug), slug);
  }
});

test('dated plans lead the shelf in their window, soonest first, at most two', () => {
  const starters = ['life-anxiety-7-days', 'gospels-30-days'];
  const lead = (iso: string) => slugs(new Date(`${iso}T12:00:00Z`));
  // The last week of October: All Saints and the persecuted-church week are next.
  assert.deepEqual(lead('2026-10-31'), ['all-saints', 'persecuted-church', ...starters]);
  // Once they have run, Advent and Christmas take the shelf.
  assert.deepEqual(lead('2026-11-20'), ['advent', 'twelve-days-of-christmas', ...starters]);
  // The week before Christmas, the hard-Christmas plan is already running.
  assert.deepEqual(lead('2026-12-20'), ['advent', 'when-christmas-is-hard', ...starters]);
  assert.deepEqual(lead('2027-01-03'), ['twelve-days-of-christmas', 'new-year', ...starters]);
  // Easter-based plans move with Easter (28 March 2027, so Ash Wednesday is 10 February).
  assert.deepEqual(lead('2027-02-20'), ['lent', ...starters, 'psalms-30-days']);
  assert.deepEqual(lead('2027-03-24'), ['holy-week', 'easter', ...starters]);
  assert.deepEqual(lead('2027-05-15')[0], 'ascension-to-pentecost');
  // Translation week, in late September.
  assert.equal(lead('2026-09-15')[0], 'word-in-every-language');
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
