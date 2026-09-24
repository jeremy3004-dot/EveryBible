import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_REMINDER_NOTIFICATION_DATA,
  createNotificationTapRouter,
  getActiveReadingPlanIds,
  type NotificationTapDestination,
} from './notificationTapRouting';
import type { UserReadingPlanProgress } from '../plans/types';

function makeResponse(data: unknown, { identifier = 'daily-reading-reminder', date = 1000 } = {}) {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { date, request: { identifier, content: { data } } },
  };
}

function makeRouter({ ready = true, activePlanIds = [] as string[] } = {}) {
  const state = { ready, activePlanIds };
  const navigations: NotificationTapDestination[] = [];
  const router = createNotificationTapRouter({
    isNavigationReady: () => state.ready,
    navigate: (destination) => {
      navigations.push(destination);
    },
    getActivePlanIds: () => state.activePlanIds,
  });
  return { router, navigations, state };
}

test('tapping the daily reminder with no active plan opens the Plans tab', () => {
  const { router, navigations } = makeRouter();

  assert.equal(router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA)), 'navigated');
  assert.deepEqual(navigations, [{ screen: 'PlansHome' }]);
});

test('tapping the daily reminder with exactly one active plan opens that plan', () => {
  const { router, navigations } = makeRouter({ activePlanIds: ['bible-in-a-year'] });

  router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA));

  assert.deepEqual(navigations, [{ screen: 'PlanDetail', planId: 'bible-in-a-year' }]);
});

test('with several active plans the tap opens the Plans tab to choose from', () => {
  const { router, navigations } = makeRouter({ activePlanIds: ['bible-in-a-year', 'proverbs'] });

  router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA));

  assert.deepEqual(navigations, [{ screen: 'PlansHome' }]);
});

test('a cold-start tap waits for navigation and resolves the plan when it lands', () => {
  const { router, navigations, state } = makeRouter({ ready: false });

  assert.equal(router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA)), 'pending');
  assert.equal(router.flush(), false);
  assert.deepEqual(navigations, []);

  // The plans store hydrated while the app was still loading.
  state.activePlanIds = ['proverbs'];
  state.ready = true;
  assert.equal(router.flush(), true);
  assert.equal(router.flush(), false);
  assert.deepEqual(navigations, [{ screen: 'PlanDetail', planId: 'proverbs' }]);
});

test('a parked tap that is cleared never navigates later', () => {
  const { router, navigations, state } = makeRouter({ ready: false });

  router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA));
  router.clearPending();
  state.ready = true;

  assert.equal(router.flush(), false);
  assert.equal(router.hasPending(), false);
  assert.deepEqual(navigations, []);
});

test('the same tap delivered twice (launch response and listener) navigates once', () => {
  const { router, navigations } = makeRouter();
  const response = makeResponse(DAILY_REMINDER_NOTIFICATION_DATA, { date: 42 });

  router.handleResponse(response);
  assert.equal(router.handleResponse(response), 'ignored');
  // The next day's reminder is a new tap.
  router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA, { date: 43 }));

  assert.equal(navigations.length, 2);
});

test('unknown, missing or malformed data is ignored without throwing', () => {
  const { router, navigations } = makeRouter();

  for (const response of [
    makeResponse({ screen: 'group', groupId: 'g1' }),
    makeResponse(undefined),
    makeResponse(null),
    makeResponse('plans'),
    makeResponse({ screen: 42 }),
    { notification: null },
    { notification: { request: null } },
    null,
    undefined,
    'garbage',
  ]) {
    assert.equal(router.handleResponse(response), 'ignored');
  }
  assert.deepEqual(navigations, []);
});

test('a navigation that throws is swallowed and does not stay pending', () => {
  const router = createNotificationTapRouter({
    isNavigationReady: () => true,
    navigate: () => {
      throw new Error('no such route');
    },
    getActivePlanIds: () => [],
  });

  assert.equal(router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA)), 'ignored');
  assert.equal(router.flush(), false);
});

test('a plans store that cannot be read still opens the Plans tab', () => {
  const navigations: NotificationTapDestination[] = [];
  const router = createNotificationTapRouter({
    isNavigationReady: () => true,
    navigate: (destination) => {
      navigations.push(destination);
    },
    getActivePlanIds: () => {
      throw new Error('store not hydrated');
    },
  });

  router.handleResponse(makeResponse(DAILY_REMINDER_NOTIFICATION_DATA));

  assert.deepEqual(navigations, [{ screen: 'PlansHome' }]);
});

test('active plans are the enrolled plans not yet finished', () => {
  const progress = (planId: string, isCompleted: boolean) =>
    ({ plan_id: planId, is_completed: isCompleted }) as UserReadingPlanProgress;

  assert.deepEqual(
    getActiveReadingPlanIds({
      'bible-in-a-year': progress('bible-in-a-year', false),
      john: progress('john', true),
      proverbs: progress('proverbs', false),
    }),
    ['bible-in-a-year', 'proverbs']
  );
});
