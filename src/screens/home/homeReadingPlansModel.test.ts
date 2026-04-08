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

test('selectHomeContinuePlans returns the top two active plans in progress order', () => {
  const plans = [makePlan('first', 1), makePlan('second', 2), makePlan('third', 3)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    first: makeProgress('first', { current_day: 3, started_at: '2026-04-08T10:00:00Z' }),
    second: makeProgress('second', { current_day: 5, started_at: '2026-04-08T09:00:00Z' }),
    third: makeProgress('third', { current_day: 4, started_at: '2026-04-08T11:00:00Z' }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['second', 'third']
  );
});

test('selectHomeContinuePlans skips completed plans and respects the limit', () => {
  const plans = [makePlan('active', 1), makePlan('completed', 2), makePlan('hidden', 3)];
  const progressByPlanId: Record<string, UserReadingPlanProgress> = {
    active: makeProgress('active', { current_day: 1 }),
    completed: makeProgress('completed', { current_day: 7, is_completed: true }),
    hidden: makeProgress('hidden', { current_day: 2 }),
  };

  const result = selectHomeContinuePlans(plans, progressByPlanId, 1);

  assert.deepEqual(
    result.map((item) => item.plan.id),
    ['hidden']
  );
});
