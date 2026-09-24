import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import type { CurrentPlanDaySummary } from '../../../services/plans/readingPlanActivity';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import {
  formatPlanCadenceLabel,
  formatPlansHeaderEyebrow,
  formatProgressPercent,
  formatSessionStatusSummary,
  getActivePlanProgressRatio,
  getActivePlanRows,
  getCompletedPlanItems,
  getLocalizedSessionLabel,
  getPlanCategoryLabel,
  groupCatalogPlans,
  PLAN_TABS,
  sortProgressNewestFirst,
  splitActivePlanRows,
} from './plansHomeModel';

const t = ((key: string, options?: Record<string, unknown>) =>
  options && 'count' in options ? `${key}(${options.count})` : key) as unknown as TFunction;

function makePlan(overrides: Partial<ReadingPlan> = {}): ReadingPlan {
  return {
    id: 'plan',
    slug: 'plan',
    title_key: 'plan.title',
    description_key: null,
    duration_days: 30,
    category: 'book-study',
    is_active: true,
    sort_order: 0,
    coverKey: 'river',
    scheduleMode: 'relative',
    ...overrides,
  };
}

function makeProgress(
  planId: string,
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress {
  return {
    id: `progress-${planId}`,
    plan_id: planId,
    started_at: '2026-09-20T09:00:00.000Z',
    completed_entries: {},
    completed_sessions: {},
    current_day: 1,
    current_session: null,
    is_completed: false,
    completed_at: null,
    synced_at: '2026-09-20T09:00:00.000Z',
    ...overrides,
  };
}

const psalms = makePlan({ id: 'psalms', category: 'devotional' });
const gospels = makePlan({ id: 'gospels', category: 'book-study' });
const proverbs = makePlan({
  id: 'proverbs',
  scheduleMode: 'calendar-day-of-month',
  duration_days: 31,
  category: 'devotional',
});
const kathisma = makePlan({
  id: 'kathisma',
  scheduleMode: 'calendar-day-of-week',
  duration_days: 7,
  format: 'multi-session',
  sessionOrder: ['morning', 'evening'],
});

test('the plan tabs are My plans, Find plans and Completed, in that order', () => {
  assert.deepEqual(
    PLAN_TABS.map((tab) => tab.key),
    ['my-plans', 'find-plans', 'completed']
  );
});

test('a progress percentage is rounded and clamped to 0–100', () => {
  assert.equal(formatProgressPercent(0.066), '7%');
  assert.equal(formatProgressPercent(-0.5), '0%');
  assert.equal(formatProgressPercent(1.4), '100%');
});

test('the reader’s plans are listed most recently started first', () => {
  const sorted = sortProgressNewestFirst({
    a: makeProgress('a', { started_at: '2026-09-01T00:00:00.000Z' }),
    b: makeProgress('b', { started_at: '2026-09-03T00:00:00.000Z' }),
    c: makeProgress('c', { started_at: '2026-09-02T00:00:00.000Z' }),
  });
  assert.deepEqual(
    sorted.map((row) => row.plan_id),
    ['b', 'c', 'a']
  );
});

test('active and completed rows join the catalog and drop a plan the catalog no longer has', () => {
  const progress = [
    makeProgress('psalms'),
    makeProgress('retired'),
    makeProgress('gospels', { is_completed: true }),
    makeProgress('retired-finished', { is_completed: true }),
  ];
  const catalog = [psalms, gospels];

  assert.deepEqual(getActivePlanRows(catalog, progress), [{ progress: progress[0], plan: psalms }]);
  assert.deepEqual(getCompletedPlanItems(catalog, progress), [{ ...progress[2], plan: gospels }]);
});

test('active plans split into readings that end and calendar rhythms that repeat', () => {
  const rows = [psalms, proverbs, gospels, kathisma].map((plan) => ({
    plan,
    progress: makeProgress(plan.id),
  }));
  const { dailyReadings, dailyRhythms } = splitActivePlanRows(rows);
  assert.deepEqual(
    dailyReadings.map((row) => row.plan.id),
    ['psalms', 'gospels']
  );
  assert.deepEqual(
    dailyRhythms.map((row) => row.plan.id),
    ['proverbs', 'kathisma']
  );
});

test('a reading counts the days before today as done; a rhythm counts today too', () => {
  assert.equal(getActivePlanProgressRatio(psalms, 4), 3 / 30);
  assert.equal(getActivePlanProgressRatio(proverbs, 24), 24 / 31);
  assert.equal(getActivePlanProgressRatio(makePlan({ duration_days: 0 }), 5), 0);
});

test('the header eyebrow counts active and completed plans and drops a zero half', () => {
  const counts = (activeCount: number, completedCount: number, catalogSize = 12) => ({
    activeCount,
    completedCount,
    catalogSize,
  });
  assert.equal(
    formatPlansHeaderEyebrow(counts(2, 1), t),
    'readingPlans.activeCount(2) · readingPlans.completedCount(1)'
  );
  assert.equal(formatPlansHeaderEyebrow(counts(0, 1), t), 'readingPlans.completedCount(1)');
  assert.equal(formatPlansHeaderEyebrow(counts(1, 0), t), 'readingPlans.activeCount(1)');
});

test('with nothing enrolled the eyebrow is the catalog size, or nothing before it loads', () => {
  assert.equal(
    formatPlansHeaderEyebrow({ activeCount: 0, completedCount: 0, catalogSize: 12 }, t),
    'readingPlans.plansCount(12)'
  );
  assert.equal(
    formatPlansHeaderEyebrow({ activeCount: 0, completedCount: 0, catalogSize: 0 }, t),
    ''
  );
});

test('session labels are translated, with a capitalised key as the fallback', () => {
  assert.equal(getLocalizedSessionLabel('morning', t), 'readingPlans.morningLabel');
  assert.equal(getLocalizedSessionLabel('midday', t), 'readingPlans.middayLabel');
  assert.equal(getLocalizedSessionLabel('evening', t), 'readingPlans.eveningLabel');

  const fallback = ((_key: string, options?: { defaultValue?: string }) =>
    options?.defaultValue ?? '') as unknown as TFunction;
  assert.equal(getLocalizedSessionLabel('midday', fallback), 'Midday');
});

test('only a multi-session plan with a session order has a cadence', () => {
  assert.equal(
    formatPlanCadenceLabel(kathisma, t),
    'readingPlans.morningLabel + readingPlans.eveningLabel'
  );
  assert.equal(formatPlanCadenceLabel(proverbs, t), null);
  assert.equal(formatPlanCadenceLabel({ ...kathisma, sessionOrder: [] }, t), null);
});

test('the session status marks done sessions, the next one, and the rest as upcoming', () => {
  const session = (sessionKey: 'morning' | 'midday' | 'evening', isComplete: boolean) =>
    ({ sessionKey, isComplete }) as CurrentPlanDaySummary['sessionSummaries'][number];
  const summary = {
    sessionSummaries: [
      session('morning', true),
      session('midday', false),
      session('evening', false),
    ],
    nextIncompleteSessionKey: 'midday',
  } as CurrentPlanDaySummary;

  assert.equal(
    formatSessionStatusSummary(summary, t),
    [
      'readingPlans.morningLabel readingPlans.sessionDone',
      'readingPlans.middayLabel readingPlans.sessionNext',
      'readingPlans.eveningLabel readingPlans.sessionUpcoming',
    ].join(' • ')
  );
  assert.equal(formatSessionStatusSummary(null, t), null);
  assert.equal(formatSessionStatusSummary({ ...summary, sessionSummaries: [] }, t), null);
});

test('known categories use their translated heading; others are title-cased from the slug', () => {
  assert.equal(getPlanCategoryLabel('book-study', t), 'readingPlans.categoryBookStudy');
  assert.equal(getPlanCategoryLabel('chronological', t), 'readingPlans.categoryChronological');
  assert.equal(getPlanCategoryLabel('topical', t), 'readingPlans.categoryTopical');
  assert.equal(getPlanCategoryLabel('devotional', t), 'readingPlans.categoryDevotional');
  assert.equal(getPlanCategoryLabel('custom', t), 'Custom');
  assert.equal(getPlanCategoryLabel('new-testament-deep-dive', t), 'New Testament Deep Dive');
});

test('the catalog groups rhythms apart and other plans by category, in catalog order', () => {
  const uncategorised = makePlan({ id: 'loose', category: null });
  const groups = groupCatalogPlans([gospels, proverbs, psalms, uncategorised, kathisma]);

  assert.deepEqual(
    groups.dailyRhythmPlans.map((plan) => plan.id),
    ['proverbs', 'kathisma']
  );
  assert.deepEqual(
    groups.categories.map(({ category, plans }) => [category, plans.map((plan) => plan.id)]),
    [
      ['book-study', ['gospels']],
      ['devotional', ['psalms']],
      ['other', ['loose']],
    ]
  );
  assert.deepEqual(groupCatalogPlans([]), { dailyRhythmPlans: [], categories: [] });
});
