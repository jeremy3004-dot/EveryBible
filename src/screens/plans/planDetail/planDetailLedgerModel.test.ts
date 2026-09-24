import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from '../../../services/plans/types';
import {
  buildPlanDayViewModels,
  getDominantPlanBook,
  getLedgerCellStates,
  getLedgerDayCompletionKey,
  getLedgerDayState,
  getNextLedgerDayNumber,
  getPlanCadenceLabelKey,
  getRecurringLedgerDayDate,
  groupEntriesByDay,
  orderLedgerRows,
  type PlanDayViewModel,
} from './planDetailLedgerModel';

// A Thursday, local time.
const TODAY = new Date(2026, 8, 24, 12);

function makePlan(overrides: Partial<ReadingPlan> = {}): ReadingPlan {
  return {
    id: 'plan',
    slug: 'plan',
    title_key: 'plan.title',
    description_key: null,
    duration_days: 5,
    category: 'book-study',
    is_active: true,
    sort_order: 0,
    coverKey: 'river',
    scheduleMode: 'relative',
    ...overrides,
  } as ReadingPlan;
}

function entry(day: number, book = 'PSA', overrides: Partial<ReadingPlanEntry> = {}) {
  return {
    id: `${book}-${day}-${overrides.session_key ?? ''}`,
    plan_id: 'plan',
    day_number: day,
    book,
    chapter_start: day,
    chapter_end: null,
    ...overrides,
  } satisfies ReadingPlanEntry;
}

function makeProgress(overrides: Partial<UserReadingPlanProgress> = {}): UserReadingPlanProgress {
  return {
    id: 'progress',
    plan_id: 'plan',
    started_at: new Date(2026, 8, 22, 9).toISOString(),
    completed_entries: {},
    completed_sessions: {},
    current_day: 3,
    current_session: null,
    is_completed: false,
    completed_at: null,
    synced_at: null,
    ...overrides,
  } as UserReadingPlanProgress;
}

test('entries group by day number, keeping their order within a day', () => {
  const grouped = groupEntriesByDay([entry(1), entry(2), entry(1, 'PRO')]);
  assert.deepEqual(
    [...grouped.entries()].map(([day, list]) => [day, list.map((item) => item.book)]),
    [
      [1, ['PSA', 'PRO']],
      [2, ['PSA']],
    ]
  );
});

test('a recurring day resolves to this month or this week; a sequential day has no date', () => {
  const monthly = makePlan({ scheduleMode: 'calendar-day-of-month' });
  assert.deepEqual(getRecurringLedgerDayDate(monthly, 7, TODAY), new Date(2026, 8, 7));

  // Day 1 of a day-of-week plan is Sunday; TODAY is Thursday the 24th.
  const weekly = makePlan({ scheduleMode: 'calendar-day-of-week' });
  assert.deepEqual(getRecurringLedgerDayDate(weekly, 1, TODAY), new Date(2026, 8, 20));
  assert.deepEqual(getRecurringLedgerDayDate(weekly, 7, TODAY), new Date(2026, 8, 26));

  assert.equal(getRecurringLedgerDayDate(makePlan(), 3, TODAY), null);
});

test('completion keys are day numbers for sequential plans and local dates for rhythms', () => {
  assert.equal(getLedgerDayCompletionKey(makePlan(), 3, TODAY), '3');
  assert.equal(
    getLedgerDayCompletionKey(makePlan({ scheduleMode: 'calendar-day-of-month' }), 7, TODAY),
    '2026-09-07'
  );
});

test('a day is done by its completion key, or as today once today is complete', () => {
  const plan = makePlan();
  const progress = makeProgress({ completed_entries: { '1': 'x' } });
  const state = (dayNumber: number, isCurrentDayComplete = false) =>
    getLedgerDayState({
      plan,
      progress,
      dayNumber,
      currentDay: 3,
      isCurrentDayComplete,
      today: TODAY,
    });

  assert.equal(state(1), 'done');
  assert.equal(state(2), 'missed');
  assert.equal(state(3), 'today');
  assert.equal(state(3, true), 'done');
  assert.equal(state(4), 'future');
  assert.equal(
    getLedgerDayState({
      plan,
      progress: null,
      dayNumber: 1,
      currentDay: 3,
      isCurrentDayComplete: false,
      today: TODAY,
    }),
    'missed',
    'without progress nothing is done'
  );
});

test('cycle days before the enrolment date are future, not missed', () => {
  const plan = makePlan({ scheduleMode: 'calendar-day-of-month', duration_days: 31 });
  const progress = makeProgress({ started_at: new Date(2026, 8, 20, 9).toISOString() });
  const state = (dayNumber: number) =>
    getLedgerDayState({
      plan,
      progress,
      dayNumber,
      currentDay: 24,
      isCurrentDayComplete: false,
      today: TODAY,
    });

  assert.equal(state(10), 'future', 'ran before the reader joined');
  assert.equal(state(21), 'missed');
});

test('the cell states cover day 1 to the total, one per day', () => {
  const states = getLedgerCellStates({
    plan: makePlan(),
    progress: makeProgress({ completed_entries: { '1': 'x', '2': 'x' } }),
    currentDay: 3,
    isCurrentDayComplete: false,
    today: TODAY,
    totalDays: 5,
  });
  assert.deepEqual(states, ['done', 'done', 'today', 'future', 'future']);
});

test('a book names the plan only when it carries at least 60% of the entries', () => {
  assert.equal(getDominantPlanBook([]), null);
  assert.equal(getDominantPlanBook([entry(1), entry(2), entry(3, 'PRO')]), 'PSA');
  assert.equal(
    getDominantPlanBook([entry(1), entry(2), entry(3, 'PRO'), entry(4, 'PRO'), entry(5, 'GEN')]),
    null
  );
});

test('the eyebrow cadence is "daily rhythm" for recurring plans, else the category', () => {
  assert.equal(
    getPlanCadenceLabelKey(makePlan({ scheduleMode: 'calendar-day-of-month' })),
    'readingPlans.dailyRhythm'
  );
  assert.equal(getPlanCadenceLabelKey(makePlan()), 'readingPlans.categoryBookStudy');
  assert.equal(getPlanCadenceLabelKey(makePlan({ category: null })), undefined);
});

test('tomorrow follows today in the ledger, and a finished cycle wraps to its first day', () => {
  assert.equal(getNextLedgerDayNumber([1, 2, 3, 4], 2, false), 3);
  assert.equal(getNextLedgerDayNumber([1, 2, 3, 4], 4, false), 5);
  assert.equal(getNextLedgerDayNumber([1, 2, 3, 4], 4, true), 1);
  assert.equal(getNextLedgerDayNumber([1, 2, 3], 9, true), 10, 'a day off the ledger');
});

test('day view models mark today, tomorrow and the read record once enrolled', () => {
  const plan = makePlan();
  const entries = [1, 2, 3, 4, 5].map((day) => entry(day));
  const progress = makeProgress({ completed_entries: { '1': 'x' } });
  const models = buildPlanDayViewModels({
    plan,
    progress,
    entries,
    entriesByDay: groupEntriesByDay(entries),
    ledgerDayNumbers: [1, 2, 3, 4, 5],
    currentDay: 3,
    currentDaySummary: null,
    nextDayNumber: 4,
    isMultiSession: false,
    today: TODAY,
    locale: 'en',
  });

  assert.deepEqual(
    models.map(({ dayNumber, isCompleted, isCurrent, isFuture, isNext }) => ({
      dayNumber,
      isCompleted,
      isCurrent,
      isFuture,
      isNext,
    })),
    [
      { dayNumber: 1, isCompleted: true, isCurrent: false, isFuture: false, isNext: false },
      { dayNumber: 2, isCompleted: false, isCurrent: false, isFuture: false, isNext: false },
      { dayNumber: 3, isCompleted: false, isCurrent: true, isFuture: false, isNext: false },
      { dayNumber: 4, isCompleted: false, isCurrent: false, isFuture: true, isNext: true },
      { dayNumber: 5, isCompleted: false, isCurrent: false, isFuture: true, isNext: false },
    ]
  );
  assert.ok(
    models.every((model) => model.dateLabel),
    'enrolled days carry a scheduled date'
  );
  assert.ok(models.every((model) => model.sessionActions.length === 0));
});

test('before enrolling the ledger is uniform: no today, tomorrow, future or dates', () => {
  const entries = [1, 2, 3].map((day) => entry(day));
  const models = buildPlanDayViewModels({
    plan: makePlan({ duration_days: 3 }),
    progress: null,
    entries,
    entriesByDay: groupEntriesByDay(entries),
    ledgerDayNumbers: [1, 2, 3],
    currentDay: 1,
    currentDaySummary: null,
    nextDayNumber: 2,
    isMultiSession: false,
    today: TODAY,
  });

  assert.ok(
    models.every(
      (model) =>
        !model.isCurrent &&
        !model.isNext &&
        !model.isFuture &&
        !model.isCompleted &&
        !model.dateLabel
    )
  );
});

test('a multi-session day lists its sessions; only today reports done, next and upcoming', () => {
  const entries = [
    entry(1, 'PSA', { session_key: 'morning', session_title: 'Morning' }),
    entry(1, 'PRO', { session_key: 'evening', session_title: 'Evening' }),
    entry(2, 'PSA', { session_key: 'morning', session_title: 'Morning' }),
    entry(2, 'PRO', { session_key: 'evening', session_title: 'Evening' }),
  ];
  const models = buildPlanDayViewModels({
    plan: makePlan({ format: 'multi-session', duration_days: 2 }),
    progress: makeProgress({ current_day: 2 }),
    entries,
    entriesByDay: groupEntriesByDay(entries),
    ledgerDayNumbers: [1, 2],
    currentDay: 2,
    currentDaySummary: {
      dayNumber: 2,
      isComplete: false,
      nextIncompleteSessionKey: 'evening',
      sessionSummaries: [
        { sessionKey: 'morning', isComplete: true },
        { sessionKey: 'evening', isComplete: false },
      ],
    } as never,
    nextDayNumber: 3,
    isMultiSession: true,
    today: TODAY,
  });

  const [past, current] = models;
  assert.deepEqual(
    past.sessionActions.map((action) => action.state),
    ['available', 'available']
  );
  assert.equal(past.launchSessionKey, 'morning', 'a past day opens its first session');
  assert.deepEqual(
    current.sessionActions.map(({ sessionKey, state }) => [sessionKey, state]),
    [
      ['morning', 'done'],
      ['evening', 'next'],
    ]
  );
  assert.equal(current.launchSessionKey, 'evening', 'today resumes at the next session');
});

test('the ledger reads tomorrow first, then the past newest-first, then the days ahead', () => {
  const model = (dayNumber: number, isNext = false) => ({ dayNumber, isNext }) as PlanDayViewModel;
  const models = [1, 2, 3, 4, 5, 6].map((day) => model(day, day === 5));

  assert.deepEqual(
    orderLedgerRows(models, 4, true).map((item) => item.dayNumber),
    [5, 3, 2, 1, 6]
  );
  assert.deepEqual(
    orderLedgerRows(models, 4, false).map((item) => item.dayNumber),
    [1, 2, 3, 4, 5, 6],
    'with no today card the ledger stays in day order'
  );
});
