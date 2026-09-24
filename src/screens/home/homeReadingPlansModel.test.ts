import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomeContinuePlans } from './homeReadingPlansModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

function makePlan(id: string, sortOrder: number): ReadingPlan {
  return {
    id,
    slug: id,
    title_key: `readingPlans.${id}.title`,
    description_key: null,
    duration_days: 7,
    category: 'devotional',
    is_active: true,
    sort_order: sortOrder,
    coverKey: 'sunrise',
    created_at: '2026-04-08T00:00:00Z',
  };
}

function makeProgress(
  planId: string,
  overrides: Partial<UserReadingPlanProgress> & Pick<UserReadingPlanProgress, 'current_day'>
): UserReadingPlanProgress {
  return {
    id: `progress-${planId}`,
    user_id: 'user-1',
    plan_id: planId,
    started_at: '2026-04-08T00:00:00Z',
    completed_entries: {},
    is_completed: false,
    completed_at: null,
    synced_at: '2026-04-08T00:00:00Z',
    ...overrides,
  };
}

// Mid-morning on Thursday 24 September 2026, local time.
const TODAY = new Date(2026, 8, 24, 10, 0);
const localIso = (dayOffset: number, hour = 9) =>
  new Date(2026, 8, 24 + dayOffset, hour, 0).toISOString();

function makeRecurringPlan(id: string, sortOrder: number): ReadingPlan {
  return {
    ...makePlan(id, sortOrder),
    duration_days: 31,
    scheduleMode: 'calendar-day-of-month',
  };
}

test('a plan with a reading still to do today comes before one already read today', () => {
  // The repeating Proverbs plan sits on day 24 of its month; a year plan on day 5
  // used to rank below it purely because 24 > 5.
  const plans = [makeRecurringPlan('proverbs', 1), makePlan('year', 2)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    proverbs: makeProgress('proverbs', {
      current_day: 24,
      completed_entries: { '2026-09-24': localIso(0, 8) },
    }),
    year: makeProgress('year', {
      current_day: 5,
      completed_entries: { '4': localIso(-1) },
    }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 2, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['year', 'proverbs']
  );
});

test('among plans still to read today, the most recently read comes first, whatever its day', () => {
  const plans = [makeRecurringPlan('proverbs', 1), makePlan('year', 2), makePlan('psalms', 3)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    proverbs: makeProgress('proverbs', {
      current_day: 24,
      completed_entries: { '2026-09-20': localIso(-4) },
    }),
    year: makeProgress('year', {
      current_day: 5,
      completed_entries: { '3': localIso(-3), '4': localIso(-1) },
    }),
    psalms: makeProgress('psalms', {
      current_day: 40,
      completed_entries: { '39': localIso(-2) },
    }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 3, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['year', 'psalms', 'proverbs']
  );
});

test('a plan never read yet counts its start date as its last activity', () => {
  const plans = [makePlan('older', 1), makePlan('fresh', 2)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    older: makeProgress('older', {
      current_day: 3,
      completed_entries: { '2': localIso(-3) },
    }),
    fresh: makeProgress('fresh', { current_day: 1, started_at: localIso(-1) }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 2, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['fresh', 'older']
  );
});

test('a sequential plan read earlier today, even ahead of schedule, counts as read today', () => {
  const plans = [makePlan('readToday', 1), makePlan('notYet', 2)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    readToday: makeProgress('readToday', {
      current_day: 9,
      completed_entries: { '8': localIso(0, 7) },
    }),
    notYet: makeProgress('notYet', {
      current_day: 2,
      completed_entries: { '1': localIso(-5) },
    }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 2, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['notYet', 'readToday']
  );
});

test('plans with the same standing keep the catalogue order', () => {
  const plans = [makePlan('first', 1), makePlan('second', 2)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    first: makeProgress('first', { current_day: 1 }),
    second: makeProgress('second', { current_day: 6 }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 2, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['first', 'second']
  );
});

test('selectHomeContinuePlans skips completed plans and respects the limit', () => {
  const plans = [makePlan('active', 1), makePlan('completed', 2), makePlan('hidden', 3)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    active: makeProgress('active', { current_day: 1 }),
    completed: makeProgress('completed', { current_day: 7, is_completed: true }),
    hidden: makeProgress('hidden', { current_day: 2 }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 1, TODAY);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['active']
  );
});
