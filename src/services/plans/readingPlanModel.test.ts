import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSyncReadingPlanRemotely,
  computeNextDay,
  getActivePlanDayNumber,
  getPlanCompletionEntryKey,
  isCalendarDayOfMonthPlan,
  isPlanCompleted,
  mergePlanProgress,
  planCompletionPercent,
  reconcileFetchedPlanProgress,
} from './readingPlanModel';
import type { ReadingPlan } from './types';
import type { UserReadingPlanProgress } from '../supabase/types';

test('canSyncReadingPlanRemotely only allows UUID-backed plan ids', () => {
  assert.equal(canSyncReadingPlanRemotely('bible-in-30-days'), false);
  assert.equal(canSyncReadingPlanRemotely('550e8400-e29b-41d4-a716-446655440000'), true);
});

// ---------------------------------------------------------------------------
// computeNextDay
// ---------------------------------------------------------------------------

test('computeNextDay advances current_day when dayNumber is at or beyond it', () => {
  // completing day 3 when current_day is already 3 → moves to 4
  assert.equal(computeNextDay(3, 3), 4);
  // completing day 5 when current_day is 2 → moves to 6
  assert.equal(computeNextDay(2, 5), 6);
});

test('computeNextDay does not regress current_day when completing an earlier day', () => {
  // user is on day 7 but completes day 2 out of order → stays at 7
  assert.equal(computeNextDay(7, 2), 7);
});

test('computeNextDay handles day 1 as the starting case', () => {
  assert.equal(computeNextDay(1, 1), 2);
});

// ---------------------------------------------------------------------------
// isPlanCompleted
// ---------------------------------------------------------------------------

test('isPlanCompleted returns true when all days are completed', () => {
  assert.equal(isPlanCompleted(30, 30), true);
});

test('isPlanCompleted returns true when completedCount exceeds duration (defensive case)', () => {
  assert.equal(isPlanCompleted(30, 31), true);
});

test('isPlanCompleted returns false when not all days are completed', () => {
  assert.equal(isPlanCompleted(30, 29), false);
  assert.equal(isPlanCompleted(365, 0), false);
});

test('isPlanCompleted returns false when duration is zero (unknown plan length)', () => {
  assert.equal(isPlanCompleted(0, 0), false);
  assert.equal(isPlanCompleted(0, 100), false);
});

// ---------------------------------------------------------------------------
// mergePlanProgress
// ---------------------------------------------------------------------------

const makeProgress = (overrides: Partial<UserReadingPlanProgress>): UserReadingPlanProgress => ({
  id: 'prog-1',
  user_id: 'user-1',
  plan_id: 'plan-1',
  started_at: '2026-03-01T00:00:00.000Z',
  completed_entries: {},
  current_day: 1,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-03-01T00:00:00.000Z',
  ...overrides,
});

const makePlan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'plan-1',
  slug: 'plan-1',
  title_key: 'readingPlans.plan1.title',
  description_key: 'readingPlans.plan1.description',
  duration_days: 31,
  category: 'devotional',
  is_active: true,
  sort_order: 1,
  coverKey: 'desert',
  ...overrides,
});

test('isCalendarDayOfMonthPlan only enables the special recurring cadence when requested', () => {
  assert.equal(isCalendarDayOfMonthPlan(makePlan()), false);
  assert.equal(
    isCalendarDayOfMonthPlan(makePlan({ scheduleMode: 'calendar-day-of-month' })),
    true
  );
});

test('getActivePlanDayNumber uses todays date for calendar-day plans', () => {
  const plan = makePlan({
    duration_days: 31,
    scheduleMode: 'calendar-day-of-month',
  });
  const progress = makeProgress({ current_day: 2 });

  assert.equal(getActivePlanDayNumber(plan, progress, new Date('2026-04-05T07:00:00.000Z')), 5);
  assert.equal(getActivePlanDayNumber(plan, progress, new Date('2026-12-02T07:00:00.000Z')), 2);
});

test('getPlanCompletionEntryKey stays date-based for calendar-day plans', () => {
  const recurringPlan = makePlan({ scheduleMode: 'calendar-day-of-month' });
  const sequentialPlan = makePlan({ scheduleMode: 'relative' });

  assert.equal(
    getPlanCompletionEntryKey(recurringPlan, 5, new Date('2026-04-05T07:00:00.000Z')),
    '2026-04-05'
  );
  assert.equal(
    getPlanCompletionEntryKey(sequentialPlan, 5, new Date('2026-04-05T07:00:00.000Z')),
    '5'
  );
});

test('mergePlanProgress unions completed_entries from both sides', () => {
  const local = makeProgress({
    completed_entries: { '1': '2026-03-01T08:00:00.000Z', '3': '2026-03-03T08:00:00.000Z' },
    current_day: 4,
  });
  const remote = makeProgress({
    completed_entries: { '1': '2026-03-01T07:00:00.000Z', '2': '2026-03-02T08:00:00.000Z' },
    current_day: 3,
  });

  const merged = mergePlanProgress(local, remote, '2026-03-25T00:00:00.000Z');

  // All three day keys should be present
  assert.equal(Object.keys(merged.completed_entries).length, 3);
  assert.ok('1' in merged.completed_entries);
  assert.ok('2' in merged.completed_entries);
  assert.ok('3' in merged.completed_entries);
  // Local wins on key "1"
  assert.equal(merged.completed_entries['1'], '2026-03-01T08:00:00.000Z');
});

test('mergePlanProgress takes the higher current_day', () => {
  const local = makeProgress({ current_day: 10 });
  const remote = makeProgress({ current_day: 15 });

  const merged = mergePlanProgress(local, remote, '2026-03-25T00:00:00.000Z');
  assert.equal(merged.current_day, 15);
});

test('mergePlanProgress marks is_completed true if either side is complete', () => {
  const local = makeProgress({ is_completed: true, completed_at: '2026-03-20T00:00:00.000Z' });
  const remote = makeProgress({ is_completed: false, completed_at: null });

  const merged = mergePlanProgress(local, remote, '2026-03-25T00:00:00.000Z');
  assert.equal(merged.is_completed, true);
  assert.equal(merged.completed_at, '2026-03-20T00:00:00.000Z');
});

test('mergePlanProgress falls back to remote completed_at when local is null', () => {
  const local = makeProgress({ is_completed: false, completed_at: null });
  const remote = makeProgress({ is_completed: true, completed_at: '2026-03-18T00:00:00.000Z' });

  const merged = mergePlanProgress(local, remote, '2026-03-25T00:00:00.000Z');
  assert.equal(merged.completed_at, '2026-03-18T00:00:00.000Z');
});

test('mergePlanProgress stamps synced_at with the supplied timestamp', () => {
  const local = makeProgress({});
  const remote = makeProgress({});

  const merged = mergePlanProgress(local, remote, '2026-03-25T12:00:00.000Z');
  assert.equal(merged.synced_at, '2026-03-25T12:00:00.000Z');
});

test('mergePlanProgress does not mutate the local or remote inputs', () => {
  const local = makeProgress({ completed_entries: { '1': 'ts-local' }, current_day: 5 });
  const remote = makeProgress({ completed_entries: { '2': 'ts-remote' }, current_day: 3 });
  const localEntriesBefore = { ...local.completed_entries };
  const remoteEntriesBefore = { ...remote.completed_entries };

  mergePlanProgress(local, remote, '2026-03-25T00:00:00.000Z');

  assert.deepEqual(local.completed_entries, localEntriesBefore);
  assert.deepEqual(remote.completed_entries, remoteEntriesBefore);
});

test('reconcileFetchedPlanProgress preserves a recent unsynced local enrollment when remote fetch is stale', () => {
  const local = makeProgress({
    user_id: undefined,
    plan_id: 'plan-local-only',
    started_at: '2026-04-09T10:00:00.000Z',
    synced_at: '2026-04-09T10:00:00.000Z',
  });
  const remote = makeProgress({
    id: 'prog-remote',
    user_id: 'user-1',
    plan_id: 'plan-remote',
    started_at: '2026-04-08T10:00:00.000Z',
    synced_at: '2026-04-08T10:00:00.000Z',
  });

  const reconciled = reconcileFetchedPlanProgress([local], [remote], '2026-04-09T10:03:00.000Z');

  assert.deepEqual(
    reconciled.map((progress) => progress.plan_id),
    ['plan-local-only', 'plan-remote']
  );
  assert.equal(
    reconciled.find((progress) => progress.plan_id === 'plan-local-only')?.user_id,
    undefined
  );
});

test('reconcileFetchedPlanProgress drops stale local-only progress after the grace window', () => {
  const local = makeProgress({
    user_id: undefined,
    plan_id: 'plan-local-only',
    started_at: '2026-04-09T10:00:00.000Z',
    synced_at: '2026-04-09T10:00:00.000Z',
  });
  const remote = makeProgress({
    id: 'prog-remote',
    user_id: 'user-1',
    plan_id: 'plan-remote',
    started_at: '2026-04-08T10:00:00.000Z',
    synced_at: '2026-04-08T10:00:00.000Z',
  });

  const reconciled = reconcileFetchedPlanProgress([local], [remote], '2026-04-09T10:10:01.000Z');

  assert.deepEqual(
    reconciled.map((progress) => progress.plan_id),
    ['plan-remote']
  );
});

test('reconcileFetchedPlanProgress merges matching local and remote plan rows', () => {
  const local = makeProgress({
    plan_id: 'plan-1',
    completed_entries: { '1': '2026-04-09T08:00:00.000Z' },
    current_day: 2,
    synced_at: '2026-04-09T08:00:00.000Z',
  });
  const remote = makeProgress({
    id: 'prog-remote',
    user_id: 'user-1',
    plan_id: 'plan-1',
    completed_entries: { '2': '2026-04-09T09:00:00.000Z' },
    current_day: 3,
    synced_at: '2026-04-09T09:00:00.000Z',
  });

  const reconciled = reconcileFetchedPlanProgress([local], [remote], '2026-04-09T10:00:00.000Z');

  assert.equal(reconciled.length, 1);
  assert.deepEqual(Object.keys(reconciled[0].completed_entries), ['1', '2']);
  assert.equal(reconciled[0].current_day, 3);
  assert.equal(reconciled[0].user_id, 'user-1');
});

// ---------------------------------------------------------------------------
// planCompletionPercent
// ---------------------------------------------------------------------------

test('planCompletionPercent returns 0 for a fresh enrollment', () => {
  assert.equal(planCompletionPercent(0, 30), 0);
});

test('planCompletionPercent returns 100 for a completed plan', () => {
  assert.equal(planCompletionPercent(30, 30), 100);
});

test('planCompletionPercent caps at 100 even when completedCount exceeds duration', () => {
  assert.equal(planCompletionPercent(35, 30), 100);
});

test('planCompletionPercent rounds to the nearest integer', () => {
  // 1 of 3 days = 33.33...% → rounds to 33
  assert.equal(planCompletionPercent(1, 3), 33);
  // 2 of 3 days = 66.66...% → rounds to 67
  assert.equal(planCompletionPercent(2, 3), 67);
});

test('planCompletionPercent returns 0 when duration is zero or negative', () => {
  assert.equal(planCompletionPercent(10, 0), 0);
  assert.equal(planCompletionPercent(10, -5), 0);
});
