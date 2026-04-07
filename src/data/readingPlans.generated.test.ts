import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_PLANS,
  READING_PLAN_ENTRIES_BY_PLAN_ID,
  TIMED_CHALLENGE_PLAN_IDS,
} from './readingPlans.generated';

test('local reading plans catalog includes the expected challenge plans', () => {
  assert.equal(READING_PLANS.length, 28);
  assert.equal(TIMED_CHALLENGE_PLAN_IDS.size, 20);
  assert.ok(READING_PLANS.some((plan) => plan.id === 'bible-in-30-days'));
  assert.ok(READING_PLANS.some((plan) => plan.id === 'bible-in-90-days'));
  assert.ok(READING_PLANS.some((plan) => plan.id === 'genesis-to-revelation-chronological'));
});

test('each plan has day entries and the expected duration', () => {
  for (const plan of READING_PLANS) {
    const entries = READING_PLAN_ENTRIES_BY_PLAN_ID.get(plan.id) ?? [];
    assert.ok(entries.length > 0, `${plan.id} should have at least one entry`);
    const dayNumbers = new Set(entries.map((entry) => entry.day_number));
    assert.equal(dayNumbers.size, plan.duration_days, `${plan.id} should expose every day`);
  }
});

