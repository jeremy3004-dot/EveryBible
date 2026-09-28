import assert from 'node:assert/strict';
import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockModule(mock, 'react/jsx-runtime', {
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
});
const leakGuard = runtime.installIntervalLeakGuard();

type ResponseListener = (response: unknown) => void;
let responseListener: ResponseListener | null = null;
let launchResponse: unknown = null;
let pendingLaunchResponse: Promise<unknown> | null = null;
// Taps arrive through the startup-light bootstrap module, never the
// expo-notifications root (see notificationBootstrap.ts).
mockModule(mock, sourcePath('services/notifications/notificationBootstrap.ts'), {
  addNotificationResponseReceivedListener: (listener: ResponseListener) => {
    responseListener = listener;
    return {
      remove: () => {
        responseListener = null;
      },
    };
  },
  getLastNotificationResponseAsync: async () => pendingLaunchResponse ?? launchResponse,
});

const navigation = { ready: true, calls: [] as unknown[][] };
mockModule(mock, '@react-navigation/native', {
  getStateFromPath: () => undefined,
  NavigationContainer: 'NavigationContainer',
  createNavigationContainerRef: () => ({
    isReady: () => navigation.ready,
    getRootState: () => ({ routes: [{ name: 'Home' }] }),
    navigate: (...args: unknown[]) => {
      navigation.calls.push(args);
    },
  }),
});

const plans = {
  progressByPlanId: {} as Record<string, { plan_id: string; is_completed: boolean }>,
};
mockModule(mock, sourcePath('stores/readingPlansStore.ts'), {
  readingPlansStore: { getState: () => plans },
});

let pendingInitialUrl: Promise<string | null> | null = null;
const urlListeners = new Set<(event: { url: string }) => void>();
mockModule(mock, 'expo-linking', {
  createURL: () => 'exp://127.0.0.1/--/',
  getInitialURL: async () => pendingInitialUrl,
  addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
    urlListeners.add(listener);
    return { remove: () => urlListeners.delete(listener) };
  },
});
mockModule(mock, sourcePath('contexts/ThemeContext.tsx'), {
  useTheme: () => ({ colors: {}, isDark: false }),
});
mockModule(mock, sourcePath('hooks/usePrivacyLockNavigationState.ts'), {
  usePrivacyLockNavigationState: () => ({ initialState: undefined, rememberState: () => {} }),
});
mockModule(mock, sourcePath('navigation/TabNavigator.tsx'), { TabNavigator: () => null });
mockModule(mock, sourcePath('design/system.ts'), { navigationTypography: {} });

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
  launchResponse = null;
  pendingLaunchResponse = null;
  navigation.ready = true;
  navigation.calls = [];
  plans.progressByPlanId = {};
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
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

const JOHN = 'com.everybible.app://bible/john/3/16';
const PSALM = 'com.everybible.app://bible/psalms/23';
const emitUrl = (url: string) => {
  for (const listener of urlListeners) listener({ url });
};

async function mountNavigation() {
  const { linkingConfig } = await import('../navigation/linkingConfig');
  const { subscribeToIncomingLinks } = await import('../navigation/linkLifecycle');
  const { RootNavigator } = await import('../navigation/RootNavigator');
  const authUrls: string[] = [];
  cleanups.push(subscribeToIncomingLinks((url) => authUrls.push(url)));
  const unsubscribe = linkingConfig.subscribe!((url) => {
    const path = url.replace('com.everybible.app://', '').replace('exp://127.0.0.1/--/', '');
    const state = linkingConfig.getStateFromPath!(path, linkingConfig.config);
    const route = state?.routes[0];
    if (route) navigation.calls.push([route.name, { url }]);
  });
  if (unsubscribe) cleanups.push(unsubscribe);
  const root = runtime.mount(RootNavigator);
  const onReady = () => {
    navigation.ready = true;
    (root.result as unknown as { props: { onReady: () => void } }).props.onReady();
  };
  return { authUrls, onReady };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('late cached launch URL cannot supersede a newer live reminder', async () => {
  const cached = deferred<string | null>();
  pendingInitialUrl = cached.promise;
  await mountNavigation();
  const { linkingConfig } = await import('../navigation/linkingConfig');
  const initialUrl = linkingConfig.getInitialURL!();
  mountApp();
  responseListener?.(reminderTap());
  await settle();
  cached.resolve(JOHN);
  assert.equal(await initialUrl, null, 'React Navigation must not apply this older launch URL');
  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('new Bible URL owns unlock over an older parked reminder', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  mountApp();
  responseListener?.(reminderTap());
  await settle();
  emitUrl(JOHN);
  assert.deepEqual(navigation.calls, [], 'neither arrival bypasses the privacy lock');
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: JOHN }]]);
});

test('new reminder owns unlock over an older parked Bible URL', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  mountApp();
  emitUrl(JOHN);
  responseListener?.(reminderTap());
  await settle();
  assert.deepEqual(navigation.calls, []);
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('Bible URL received before lazy reminder imports settle keeps ownership', async () => {
  const navigator = await mountNavigation();
  mountApp();
  responseListener?.(reminderTap());
  // Real dynamic imports have not completed: do not drain their promise callbacks.
  emitUrl(JOHN);
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: JOHN }]]);
});

test('late cached reminder cannot supersede a newer live Bible URL', async () => {
  const cached = deferred<unknown>();
  pendingLaunchResponse = cached.promise;
  await mountNavigation();
  mountApp();
  emitUrl(JOHN);
  cached.resolve(reminderTap());
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: JOHN }]]);
});

test('late cached reminder cannot supersede a newer live reminder', async () => {
  const cached = deferred<unknown>();
  const oldTap = reminderTap();
  pendingLaunchResponse = cached.promise;
  await mountNavigation();
  mountApp();
  responseListener?.(reminderTap());
  await settle();
  cached.resolve(oldTap);
  await settle();
  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('duplicate launch response does not reclaim an intent from a newer Bible URL', async () => {
  await mountNavigation();
  const tap = reminderTap();
  mountApp();
  responseListener?.(tap);
  await settle();
  emitUrl(JOHN);
  responseListener?.(tap);
  await settle();
  assert.deepEqual(navigation.calls, [
    ['Plans', { screen: 'PlansHome' }],
    ['Bible', { url: JOHN }],
  ]);
});

test('invalid URLs and unrelated notifications do not displace a pending valid URL', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  mountApp();
  emitUrl(JOHN);
  for (const url of [
    'com.everybible.app://bible/john/999',
    'https://example.org/bible/john/3',
    'com.everybible.app://unrecognized',
    'exp://other-app/--/bible/john/3',
  ])
    emitUrl(url);
  responseListener?.(reminderTap({ screen: 'group' }));
  responseListener?.({ notification: null });
  await settle();
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: JOHN }]]);
  assert.equal(navigator.authUrls.length, 5, 'App auth handling still receives every native URL');
});

test('invalid URL does not displace a pending reminder', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  mountApp();
  responseListener?.(reminderTap());
  await settle();
  emitUrl('com.everybible.app://bible/unknown/3');
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Plans', { screen: 'PlansHome' }]]);
});

test('remount ignores the cached duplicate without stealing a parked Bible URL', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  const tap = reminderTap();
  launchResponse = tap;
  const app = mountApp();
  await settle();
  app.unmount();
  emitUrl(PSALM);
  mountApp();
  await settle();
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: PSALM }]]);
});

test('unmount before lazy reminder imports settle drops only that reminder', async () => {
  navigation.ready = false;
  const navigator = await mountNavigation();
  const app = mountApp();
  responseListener?.(reminderTap());
  app.unmount();
  emitUrl(JOHN);
  await settle();
  navigator.onReady();
  await settle();
  assert.deepEqual(navigation.calls, [['Bible', { url: JOHN }]]);
});

test('a supported Expo Bible URL is admitted under this app prefix', async () => {
  await mountNavigation();
  emitUrl('exp://127.0.0.1/--/bible/john/3/16');
  assert.equal(navigation.calls.at(-1)?.[0], 'Bible');
});
