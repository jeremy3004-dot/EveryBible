import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_PLAN_SHELF_LIMIT,
  HOME_SUGGESTED_PLAN_IDS,
  selectHomePlanShelf,
} from './homePlanShelfModel';
import { getPlanCompletionEntryKey } from '../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

function makePlan(id: string, sortOrder: number, overrides: Partial<ReadingPlan> = {}) {
  return {
    id,
    slug: id,
    title_key: `readingPlans.${id}.title`,
    description_key: null,
    duration_days: 10,
    category: 'devotional',
    is_active: true,
    sort_order: sortOrder,
    coverKey: 'sunrise',
    created_at: '2026-04-08T00:00:00Z',
    ...overrides,
  } satisfies ReadingPlan;
}

function makeProgress(
  planId: string,
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress {
  return {
    id: `progress-${planId}`,
    user_id: 'user-1',
    plan_id: planId,
    started_at: new Date(2026, 8, 20, 9).toISOString(),
    completed_entries: {},
    current_day: 1,
    is_completed: false,
    completed_at: null,
    synced_at: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

// Thursday 24 September 2026, mid-morning.
const TODAY = new Date(2026, 8, 24, 10, 0);

test('enrolled plans fill the shelf, best first, with their day and progress', () => {
  const read = makePlan('read', 1);
  const unread = makePlan('unread', 2);
  const readEntry = getPlanCompletionEntryKey(read, 1, TODAY);
  const shelf = selectHomePlanShelf({
    plans: [read, unread, makePlan('not-joined', 3)],
    progressByPlanId: {
      // Ticked today, so it sorts behind the plan still waiting on today's reading.
      read: makeProgress('read', {
        current_day: 2,
        completed_entries: { [readEntry]: TODAY.toISOString() },
      }),
      unread: makeProgress('unread'),
    },
    today: TODAY,
  });

  assert.equal(shelf.kind, 'mine');
  assert.deepEqual(
    shelf.items.map((item) => [item.plan.id, item.dayNumber, item.totalDays, item.fraction]),
    [
      ['unread', 1, 10, 0],
      ['read', 2, 10, 0.1],
    ]
  );
  assert.ok(shelf.items.every((item) => item.progress !== null));
});

test('finished plans leave the shelf', () => {
  const shelf = selectHomePlanShelf({
    plans: [makePlan('done', 1), makePlan('going', 2)],
    progressByPlanId: {
      done: makeProgress('done', { is_completed: true }),
      going: makeProgress('going'),
    },
    today: TODAY,
  });

  assert.deepEqual(
    shelf.items.map((item) => item.plan.id),
    ['going']
  );
});

test('a monthly plan counts the days of this month, not its 31-day catalogue length', () => {
  const proverbs = makePlan('proverbs', 1, {
    duration_days: 31,
    scheduleMode: 'calendar-day-of-month',
  });
  const shelf = selectHomePlanShelf({
    plans: [proverbs],
    progressByPlanId: { proverbs: makeProgress('proverbs') },
    today: TODAY,
  });

  assert.equal(shelf.items[0]?.dayNumber, 24);
  assert.equal(shelf.items[0]?.totalDays, 30);
});

test('with nothing joined, the shelf suggests the curated plans in their listed order', () => {
  const catalog = [
    makePlan('first-in-catalogue', 1),
    ...HOME_SUGGESTED_PLAN_IDS.map((id, index) => makePlan(id, index + 2)).reverse(),
  ];
  const shelf = selectHomePlanShelf({ plans: catalog, progressByPlanId: {}, today: TODAY });

  assert.equal(shelf.kind, 'suggested');
  assert.deepEqual(
    shelf.items.map((item) => item.plan.id),
    HOME_SUGGESTED_PLAN_IDS.slice(0, HOME_PLAN_SHELF_LIMIT)
  );
  assert.ok(shelf.items.every((item) => item.progress === null && item.fraction === 0));
});

test('missing or retired suggestions are filled from the catalogue in sort order', () => {
  const [firstSuggestion, secondSuggestion] = HOME_SUGGESTED_PLAN_IDS;
  const shelf = selectHomePlanShelf({
    plans: [
      makePlan('later', 9),
      makePlan(secondSuggestion ?? 'second', 5, { is_active: false }),
      makePlan('sooner', 3),
      makePlan(firstSuggestion ?? 'first', 7),
    ],
    progressByPlanId: {},
    today: TODAY,
  });

  assert.deepEqual(
    shelf.items.map((item) => item.plan.id),
    [firstSuggestion, 'sooner', 'later']
  );
});

test('progress for a plan no longer in the catalogue falls back to suggestions', () => {
  const shelf = selectHomePlanShelf({
    plans: [makePlan('only', 1)],
    progressByPlanId: { retired: makeProgress('retired') },
    today: TODAY,
  });

  assert.equal(shelf.kind, 'suggested');
  assert.deepEqual(
    shelf.items.map((item) => item.plan.id),
    ['only']
  );
});

test('an empty catalogue gives an empty shelf', () => {
  const shelf = selectHomePlanShelf({ plans: [], progressByPlanId: {}, today: TODAY });

  assert.deepEqual(shelf, { kind: 'suggested', items: [] });
});
