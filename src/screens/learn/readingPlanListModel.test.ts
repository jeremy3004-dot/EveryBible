import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import { splitReadingPlanSections } from './readingPlanListModel';

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

function makeProgress(planId: string, isCompleted: boolean): UserReadingPlanProgress {
  return {
    id: `progress-${planId}`,
    user_id: 'user-1',
    plan_id: planId,
    started_at: '2026-04-08T00:00:00Z',
    completed_entries: isCompleted ? { 1: '2026-04-08T00:00:00Z' } : {},
    current_day: isCompleted ? 2 : 1,
    is_completed: isCompleted,
    completed_at: isCompleted ? '2026-04-08T00:00:00Z' : null,
    synced_at: '2026-04-08T00:00:00Z',
  };
}

test('splitReadingPlanSections separates active, completed, and browse plans', () => {
  const plans = [makePlan('active-plan', 1), makePlan('completed-plan', 2), makePlan('fresh-plan', 3)];
  const progressByPlanId = new Map<string, UserReadingPlanProgress>([
    ['active-plan', makeProgress('active-plan', false)],
    ['completed-plan', makeProgress('completed-plan', true)],
  ]);

  const sections = splitReadingPlanSections(plans, progressByPlanId);

  assert.deepEqual(
    sections.activePlans.map(({ plan }) => plan.id),
    ['active-plan']
  );
  assert.deepEqual(
    sections.completedPlans.map(({ plan }) => plan.id),
    ['completed-plan']
  );
  assert.deepEqual(
    sections.browsePlans.map((plan) => plan.id),
    ['active-plan', 'completed-plan', 'fresh-plan']
  );
});
