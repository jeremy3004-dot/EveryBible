import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { createRequire } from 'node:module';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import type { ReadingPlan, ReadingPlanEntry } from '../../../services/plans/types';

/**
 * `load()` used to read the previous `entries` through a `setEntries` functional
 * updater and call `setError` from inside it — a side effect inside a state
 * updater, which React can invoke more than once (StrictMode, concurrent
 * rendering). These pin the outward behaviour that updater was computing —
 * error only when nothing is left to show — now computed as a plain value
 * before either state is set.
 */
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

// react-i18next resolves to a different file for `import` than for the `require`
// tsx emits for these CJS-compiled sources, so the bare specifier would not
// intercept it; mock the CJS entry by path (see src/hooks/useFontSize.test.ts).
const requireFrom = createRequire(import.meta.url);
mockModule(mock, requireFrom.resolve('react-i18next'), {
  useTranslation: () => ({ t: (key: string) => `t:${key}` }),
});

const PLAN_ID = 'psalms-30-days';
const plan: ReadingPlan = {
  id: PLAN_ID,
  slug: PLAN_ID,
  title_key: 'readingPlans.psalms30.title',
  description_key: null,
  duration_days: 30,
  category: null,
  is_active: true,
  sort_order: 1,
  coverKey: 'dunes',
};
const entry = (id: string): ReadingPlanEntry => ({
  id,
  plan_id: PLAN_ID,
  day_number: 1,
  book: 'PSA',
  chapter_start: 1,
  chapter_end: 1,
});

type PlansResult = { success: boolean; data?: ReadingPlan[] };
type EntriesResult = { success: boolean; data?: ReadingPlanEntry[] };
const service = {
  plansResult: { success: true, data: [plan] } as PlansResult,
  entriesResult: { success: true, data: [entry('e1')] } as EntriesResult,
};
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => service.plansResult,
  getPlanEntries: async (_planId: string) => service.entriesResult,
  getPlansByCategory: async () => ({ success: true, data: [] }),
});

type Hook = typeof import('./usePlanDetailData').usePlanDetailData;
let usePlanDetailData: Hook;

before(async () => {
  ({ usePlanDetailData } = await import('./usePlanDetailData'));
});

afterEach(() => {
  runtime.unmountAll();
  service.plansResult = { success: true, data: [plan] };
  service.entriesResult = { success: true, data: [entry('e1')] };
});

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('entries failing on the first load, with nothing shown yet, reports the error', async () => {
  service.entriesResult = { success: false };
  const view = runtime.mount(usePlanDetailData, PLAN_ID);
  view.flushEffects();
  await settle();

  const result = view.rerender();
  assert.equal(result.error, 't:common.error');
  assert.deepEqual(result.entries, []);
});

test('a later failed refresh keeps the entries already shown and does not report an error', async () => {
  const view = runtime.mount(usePlanDetailData, PLAN_ID);
  view.flushEffects();
  await settle();
  const loaded = view.rerender();
  assert.deepEqual(loaded.entries, [entry('e1')]);
  assert.equal(loaded.error, null);

  // A refresh whose entries call fails, with rows already on screen.
  service.entriesResult = { success: false };
  await loaded.load();

  const result = view.rerender();
  assert.equal(result.error, null, 'no error when rows are already shown');
  assert.deepEqual(result.entries, [entry('e1')], 'the previous rows are kept');
});

test('the plan and its entries both loading successfully report no error', async () => {
  const view = runtime.mount(usePlanDetailData, PLAN_ID);
  view.flushEffects();
  await settle();

  const result = view.rerender();
  assert.equal(result.error, null);
  assert.deepEqual(result.plan, plan);
  assert.deepEqual(result.entries, [entry('e1')]);
  assert.equal(result.loading, false);
});
