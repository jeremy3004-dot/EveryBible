import test from 'node:test';
import assert from 'node:assert/strict';

import type { PlanSessionKey, ReadingPlan, ReadingPlanEntry } from '../types';
import { resolvePlanSessionCompletion } from './planSessionModel';

const plan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'daily-office',
  slug: 'daily-office',
  title_key: 'plans.dailyOffice',
  description_key: null,
  duration_days: 2,
  category: 'devotional',
  is_active: true,
  sort_order: 1,
  coverKey: 'sunrise',
  format: 'multi-session',
  sessionOrder: ['morning', 'evening'],
  ...overrides,
});

const entry = (dayNumber: number, sessionKey: PlanSessionKey): ReadingPlanEntry => ({
  id: `${dayNumber}-${sessionKey}`,
  plan_id: 'daily-office',
  day_number: dayNumber,
  session_key: sessionKey,
  book: 'PSA',
  chapter_start: dayNumber,
  chapter_end: null,
});

const entries = [entry(1, 'evening'), entry(1, 'morning'), entry(2, 'morning')];

test('a session that is not the last open one points at the next open session', () => {
  assert.deepEqual(resolvePlanSessionCompletion(plan(), entries, 1, 'morning', {}), {
    completionKey: '1:morning',
    dayCompletionKey: '1',
    totalDays: 2,
    isFinalSession: false,
    advanceDayOnCompletion: true,
    nextSessionKey: 'evening',
  });
});

test('the last open session of the day is final, whichever order they were read in', () => {
  const completion = resolvePlanSessionCompletion(plan(), entries, 1, 'morning', {
    '1:evening': '2026-09-01T20:00:00.000Z',
  });

  assert.equal(completion?.isFinalSession, true);
  assert.equal(completion?.nextSessionKey, null);
});

test('a session the day does not have is not found', () => {
  assert.equal(resolvePlanSessionCompletion(plan(), entries, 2, 'evening', {}), null);
  assert.equal(resolvePlanSessionCompletion(plan(), entries, 3, 'morning', {}), null);
});

test('a recurring plan keys sessions by its dated cycle and never advances the day', () => {
  const recurring = plan({ scheduleMode: 'calendar-day-of-month', duration_days: 31 });

  const completion = resolvePlanSessionCompletion(
    recurring,
    entries,
    1,
    'morning',
    {},
    new Date('2026-09-15T12:00:00.000Z')
  );

  assert.equal(completion?.advanceDayOnCompletion, false);
  assert.notEqual(completion?.dayCompletionKey, '1');
  assert.equal(completion?.completionKey, `${completion?.dayCompletionKey}:morning`);
});
