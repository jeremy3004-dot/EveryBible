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

test('an explicit recurring occurrence keeps session lookup and final completion together across midnight', () => {
  const recurring = plan({ scheduleMode: 'calendar-day-of-month', duration_days: 31 });
  const completion = resolvePlanSessionCompletion(
    recurring,
    entries,
    1,
    'morning',
    { '2026-09-01:evening': '2026-09-01T22:00:00Z', '2026-10-01:morning': '2026-10-01T00:05:00Z' },
    new Date(2026, 9, 1, 5),
    '2026-09-01'
  );
  assert.equal(completion?.completionKey, '2026-09-01:morning');
  assert.equal(completion?.dayCompletionKey, '2026-09-01');
  assert.equal(completion?.isFinalSession, true);
  assert.equal(completion?.nextSessionKey, null);
});

test('sequential session completion ignores an optional calendar occurrence', () => {
  const completion = resolvePlanSessionCompletion(
    plan(),
    entries,
    1,
    'morning',
    {},
    new Date(),
    '2026-09-30'
  );
  assert.equal(completion?.completionKey, '1:morning');
  assert.equal(completion?.dayCompletionKey, '1');
  assert.equal(completion?.advanceDayOnCompletion, true);
});

test('a recurring session resolved across midnight keeps one date for every key it builds', () => {
  const recurring = plan({ scheduleMode: 'calendar-day-of-month', duration_days: 31 });
  const RealDate = Date;
  // Worst case of a clock read at 23:59:59.999 on the last day of a month: every further
  // read lands in the next month, where a day-of-month plan's keys differ.
  let reads = 0;
  class SteppingDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      if (args.length === 0) {
        super(2026, 8 + reads++, 15, 23, 59, 59, 999);
      } else {
        super(...args);
      }
    }
  }
  globalThis.Date = SteppingDate as unknown as DateConstructor;
  try {
    const completion = resolvePlanSessionCompletion(recurring, entries, 1, 'morning', {});

    assert.equal(completion?.completionKey, `${completion?.dayCompletionKey}:morning`);
  } finally {
    globalThis.Date = RealDate;
  }
});
