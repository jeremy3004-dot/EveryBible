import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { createRequire } from 'node:module';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import type { ReadingPlan, ReadingPlanEntry } from '../../../services/plans/types';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

// react-i18next resolves to a different file for `import` than for the `require`
// tsx emits, so mock its CJS entry by path (see usePlanDetailData.test.ts).
const t = (key: string) => `t:${key}`;
const requireFrom = createRequire(import.meta.url);
mockModule(mock, requireFrom.resolve('react-i18next'), {
  useTranslation: () => ({ t }),
});

const plan = (id: string): ReadingPlan => ({
  id,
  slug: id,
  title_key: `readingPlans.${id}.title`,
  description_key: null,
  duration_days: 30,
  category: null,
  is_active: true,
  sort_order: 1,
  coverKey: 'dunes',
});
const entry = (planId: string): ReadingPlanEntry => ({
  id: `${planId}-1`,
  plan_id: planId,
  day_number: 1,
  book: 'PSA',
  chapter_start: 1,
  chapter_end: 1,
});

const service = {
  calls: [] as string[],
  plansResult: { success: true, data: [plan('psalms')] } as {
    success: boolean;
    data?: ReadingPlan[];
  },
  failingEntries: new Set<string>(),
};
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => {
    service.calls.push('listReadingPlans');
    return service.plansResult;
  },
  getPlanEntries: async (planId: string) => {
    service.calls.push(`getPlanEntries:${planId}`);
    return service.failingEntries.has(planId)
      ? { success: false }
      : { success: true, data: [entry(planId)] };
  },
});

type Hook = typeof import('./useRhythmDetailData').useRhythmDetailData;
let useRhythmDetailData: Hook;

before(async () => {
  ({ useRhythmDetailData } = await import('./useRhythmDetailData'));
});

afterEach(() => {
  runtime.unmountAll();
  service.calls.length = 0;
  service.plansResult = { success: true, data: [plan('psalms')] };
  service.failingEntries.clear();
});

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('loads the catalog and each plan’s entries, then stops loading', async () => {
  const view = runtime.mount(useRhythmDetailData, ['psalms', 'proverbs']);
  assert.equal(view.result.loading, true);
  view.flushEffects();
  await settle();

  const result = view.rerender();
  assert.equal(result.loading, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.allPlans, [plan('psalms')]);
  assert.deepEqual(result.planEntriesById, {
    psalms: [entry('psalms')],
    proverbs: [entry('proverbs')],
  });
});

test('a plan whose entries fail to load is shown with none rather than failing the page', async () => {
  service.failingEntries.add('proverbs');
  const view = runtime.mount(useRhythmDetailData, ['psalms', 'proverbs']);
  view.flushEffects();
  await settle();

  const result = view.rerender();
  assert.equal(result.error, null);
  assert.deepEqual(result.planEntriesById.proverbs, []);
});

test('a catalog that fails to load reports the error and asks for no entries', async () => {
  service.plansResult = { success: false };
  const view = runtime.mount(useRhythmDetailData, ['psalms']);
  view.flushEffects();
  await settle();

  const result = view.rerender();
  assert.equal(result.error, 't:common.error');
  assert.equal(result.loading, false);
  assert.deepEqual(service.calls, ['listReadingPlans']);
});

test('the same plan ids in a new array do not refetch; a changed list does', async () => {
  const view = runtime.mount(useRhythmDetailData, ['psalms']);
  view.flushEffects();
  await settle();
  assert.deepEqual(service.calls, ['listReadingPlans', 'getPlanEntries:psalms']);

  // The rhythm was retitled: a new object, the same plans.
  view.rerender(['psalms']);
  view.flushEffects();
  await settle();
  assert.equal(view.rerender(['psalms']).loading, false);
  assert.equal(service.calls.length, 2, 'no second load');

  view.rerender(['psalms', 'proverbs']);
  view.flushEffects();
  await settle();
  assert.deepEqual(service.calls.slice(2), [
    'listReadingPlans',
    'getPlanEntries:psalms',
    'getPlanEntries:proverbs',
  ]);
});

test('a rhythm of passages alone loads the catalog and no entries', async () => {
  const view = runtime.mount(useRhythmDetailData, []);
  view.flushEffects();
  await settle();

  const result = view.rerender([]);
  assert.equal(result.loading, false);
  assert.deepEqual(result.planEntriesById, {});
  assert.deepEqual(service.calls, ['listReadingPlans']);
});
