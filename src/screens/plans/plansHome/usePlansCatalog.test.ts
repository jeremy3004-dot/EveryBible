import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const react = runtime.react as unknown as typeof import('react');

// Stands in for React Navigation: the effect re-runs whenever the screen is focused.
const focus = { refocus: () => {} };
mockModule(mock, '@react-navigation/native', {
  useFocusEffect: (effect: () => void | (() => void)) => {
    const [focusCount, setFocusCount] = react.useState(0);
    focus.refocus = () => setFocusCount((count) => count + 1);
    react.useEffect(effect, [effect, focusCount]);
  },
});

let progressReads = 0;
let progressResult: () => Promise<unknown> = async () => ({ success: true, data: [] });
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => ({ success: true, data: [] }),
  getUserPlanProgress: async () => {
    progressReads += 1;
    return progressResult();
  },
});

const settle = async () => {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

afterEach(() => {
  runtime.unmountAll();
  mock.timers.reset();
  progressReads = 0;
  progressResult = async () => ({ success: true, data: [] });
});

const mountCatalog = async () => {
  const { usePlansCatalog } = await import('./usePlansCatalog');
  const view = runtime.mount(usePlansCatalog);
  view.flushEffects();
  await settle();
  return view;
};

const refocus = async (view: Awaited<ReturnType<typeof mountCatalog>>) => {
  focus.refocus();
  view.rerender();
  view.flushEffects();
  await settle();
};

test('refocusing the plans tab inside the window does not re-read server progress', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const view = await mountCatalog();
  assert.equal(progressReads, 1);

  mock.timers.tick(30_000);
  await refocus(view);
  await refocus(view);

  assert.equal(progressReads, 1);
});

test('refocusing after the window reads server progress again', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const view = await mountCatalog();

  mock.timers.tick(2 * 60 * 1000 + 1);
  await refocus(view);

  assert.equal(progressReads, 2);
});

test('pull-to-refresh always reads server progress', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const view = await mountCatalog();

  await view.result.refresh();
  await settle();

  assert.equal(progressReads, 2);
});

test('a progress read that throws is retried on the next focus, not after the window', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  progressResult = async () => {
    throw new Error('offline');
  };
  const view = await mountCatalog();
  assert.equal(progressReads, 1);

  mock.timers.tick(5_000);
  await refocus(view);

  assert.equal(progressReads, 2);
});
