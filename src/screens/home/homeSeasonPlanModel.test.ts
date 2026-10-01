import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomeSeasonPlan } from './homeSeasonPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

function makePlan(id: string, overrides: Partial<ReadingPlan> = {}): ReadingPlan {
  return {
    id,
    slug: id,
    title_key: `readingPlans.churchYear.${id}.title`,
    description_key: null,
    duration_days: 7,
    category: 'church-year',
    is_active: true,
    sort_order: 60,
    coverKey: 'advent',
    ...overrides,
  };
}

const progress = (planId: string): UserReadingPlanProgress => ({
  id: `progress-${planId}`,
  plan_id: planId,
  started_at: '2026-10-20T09:00:00.000Z',
  completed_entries: {},
  current_day: 1,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-10-20T09:00:00.000Z',
});

const allSaints = makePlan('all-saints', { scheduleMode: 'calendar-all-saints' });
const persecuted = makePlan('persecuted-church', {
  category: 'seasonal',
  scheduleMode: 'calendar-persecuted-church',
});
const advent = makePlan('advent', { scheduleMode: 'calendar-advent', duration_days: 28 });
const lent = makePlan('lent', { scheduleMode: 'calendar-lent', duration_days: 39 });
const psalms = makePlan('psalms', { category: 'devotional' });
const plans = [psalms, lent, advent, persecuted, allSaints];

const pick = (today: Date, progressByPlanId: Record<string, UserReadingPlanProgress> = {}) =>
  selectHomeSeasonPlan({ plans, progressByPlanId, today })?.plan.id ?? null;

test('nothing is offered while every season is weeks away', () => {
  // 1 October 2026: All Saints opens a month later, beyond its lead-in.
  assert.equal(pick(new Date(2026, 9, 1, 9)), null);
});

test('the soonest season is offered ahead of its first day', () => {
  assert.deepEqual(
    (({ plan, daysUntilStart }) => [plan.id, daysUntilStart])(
      selectHomeSeasonPlan({ plans, progressByPlanId: {}, today: new Date(2026, 9, 25, 9) })!
    ),
    ['all-saints', 7]
  );
});

test('a season under way comes first, for its first three days only', () => {
  // 3 November: All Saints is on day 3; the persecuted church week starts on the 8th.
  assert.equal(pick(new Date(2026, 10, 3, 9)), 'all-saints');
  // 4 November: All Saints is past day 3, so the next season is offered.
  assert.equal(pick(new Date(2026, 10, 4, 9)), 'persecuted-church');
});

test('a plan the reader has joined is not offered again', () => {
  assert.equal(
    pick(new Date(2026, 10, 2, 9), { 'all-saints': progress('all-saints') }),
    'persecuted-church'
  );
});

test('inactive plans and plans without a season are never offered', () => {
  const retired = makePlan('retired', { scheduleMode: 'calendar-all-saints', is_active: false });
  assert.equal(
    selectHomeSeasonPlan({
      plans: [psalms, retired],
      progressByPlanId: {},
      today: new Date(2026, 10, 2),
    }),
    null
  );
});
