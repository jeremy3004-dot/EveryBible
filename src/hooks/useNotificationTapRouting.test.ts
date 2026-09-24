import assert from 'node:assert/strict';
import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const leakGuard = runtime.installIntervalLeakGuard();

type ResponseListener = (response: unknown) => void;
let responseListener: ResponseListener | null = null;
let listenerRemovals = 0;
let launchResponse: unknown = null;
// Taps arrive through the startup-light bootstrap module, never the
// expo-notifications root (see notificationBootstrap.ts).
mockModule(mock, sourcePath('services/notifications/notificationBootstrap.ts'), {
  addNotificationResponseReceivedListener: (listener: ResponseListener) => {
    responseListener = listener;
    return {
      remove: () => {
        listenerRemovals += 1;
      },
    };
  },
  getLastNotificationResponseAsync: async () => launchResponse,
});

const navigation = { ready: true, calls: [] as unknown[][] };
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => navigation.ready,
    navigate: (...args: unknown[]) => {
      navigation.calls.push(args);
    },
  },
});

const plans = {
  progressByPlanId: {} as Record<string, { plan_id: string; is_completed: boolean }>,
};
mockModule(mock, sourcePath('stores/readingPlansStore.ts'), {
  readingPlansStore: { getState: () => plans },
});

type Hook = typeof import('./useNotificationTapRouting').useNotificationTapRouting;
let useNotificationTapRouting: Hook;

before(async () => {
  ({ useNotificationTapRouting } = await import('./useNotificationTapRouting'));
  // Load the lazily imported modules once so every lazy import resolves from the cache.
  await import('../stores/readingPlansStore');
  await import('../data/readingPlans.generated');
});

let tapDate = 0;
function reminderTap(data: unknown = { screen: 'plans' }) {
  tapDate += 1;
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: tapDate,
      request: { identifier: 'daily-reading-reminder', content: { data } },
    },
  };
}

beforeEach(() => {
  responseListener = null;
  listenerRemovals = 0;
  launchResponse = null;
  navigation.ready = true;
  navigation.calls = [];
  plans.progressByPlanId = {};
});

afterEach(() => {
  runtime.unmountAll();
  mock.timers.reset();
  leakGuard.assertNoLeaks();
});

after(() => {
  leakGuard.restore();
});

async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function mountApp() {
  const view = runtime.mount(useNotificationTapRouting);
  view.flushEffects();
  return view;
}

test('tapping the reminder while the app runs opens the Plans tab', async () => {
  mountApp();

  responseListener?.(reminderTap());
  await settle();

  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('with one active plan the tap opens that plan, keeping Plans underneath', async () => {
  plans.progressByPlanId = {
    'psalms-30-days': { plan_id: 'psalms-30-days', is_completed: false },
    'proverbs-31-days': { plan_id: 'proverbs-31-days', is_completed: true },
  };
  mountApp();

  responseListener?.(reminderTap());
  await settle();

  assert.deepEqual(navigation.calls, [
    ['Plans', { screen: 'PlanDetail', params: { planId: 'psalms-30-days' }, initial: false }],
  ]);
});

// Progress is persisted and synced, so a plan id can outlive its catalog entry. The
// tap opened that id's detail page, which has no plan to show.
test('an active plan that is no longer in the catalog does not count: the tap opens Plans', async () => {
  plans.progressByPlanId = {
    'retired-plan-2024': { plan_id: 'retired-plan-2024', is_completed: false },
  };
  mountApp();

  responseListener?.(reminderTap());
  await settle();

  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('beside a retired plan, the one active catalog plan still opens directly', async () => {
  plans.progressByPlanId = {
    'retired-plan-2024': { plan_id: 'retired-plan-2024', is_completed: false },
    'psalms-30-days': { plan_id: 'psalms-30-days', is_completed: false },
  };
  mountApp();

  responseListener?.(reminderTap());
  await settle();

  assert.deepEqual(navigation.calls, [
    ['Plans', { screen: 'PlanDetail', params: { planId: 'psalms-30-days' }, initial: false }],
  ]);
});

test('a tap that launched the app is routed once navigation is ready', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  navigation.ready = false;
  const tap = reminderTap();
  launchResponse = tap;
  mountApp();
  await settle();
  assert.deepEqual(navigation.calls, []);

  // The listener may deliver the same launch tap too; it must not navigate twice.
  responseListener?.(tap);
  await settle();

  navigation.ready = true;
  mock.timers.tick(250);
  mock.timers.tick(250);

  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('waiting for navigation gives up instead of polling forever', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  navigation.ready = false;
  mountApp();
  responseListener?.(reminderTap());
  await settle();

  for (let tick = 0; tick < 400; tick += 1) {
    mock.timers.tick(250);
  }
  navigation.ready = true;
  mock.timers.tick(250);

  assert.deepEqual(navigation.calls, []);
  // afterEach's leak guard proves the interval was cleared, not just ignored.
});

test('taps from other notifications, or with unreadable data, only open the app', async () => {
  mountApp();

  responseListener?.(reminderTap({ screen: 'group', groupId: 'g1' }));
  responseListener?.(reminderTap(null));
  responseListener?.({ notification: 'not an object' });
  await settle();

  assert.deepEqual(navigation.calls, []);
});

test('unmounting removes the listener and stops waiting for navigation', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  navigation.ready = false;
  const view = mountApp();
  responseListener?.(reminderTap());
  await settle();

  view.unmount();
  navigation.ready = true;
  mock.timers.tick(250);

  assert.equal(listenerRemovals, 1);
  assert.deepEqual(navigation.calls, []);
});
