import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';

// There is no React renderer in this workspace, so `react` is replaced with a
// useEffect that runs its effect immediately and hands back the cleanup — that
// is the whole surface this hook uses.
const effectCleanups: Array<(() => void) | void> = [];
mockModule(mock, 'react', {
  useEffect: (effect: () => void | (() => void)) => {
    effectCleanups.push(effect());
  },
});

type UrlListener = (event: { url: string }) => void;

const linking: {
  getInitialURL: () => Promise<string | null>;
  listeners: UrlListener[];
  removeCalls: number;
} = {
  getInitialURL: async () => null,
  listeners: [],
  removeCalls: 0,
};

mockModule(mock, 'expo-linking', {
  getInitialURL: () => linking.getInitialURL(),
  addEventListener: (event: string, listener: UrlListener) => {
    assert.equal(event, 'url');
    linking.listeners.push(listener);
    return {
      remove: () => {
        linking.removeCalls += 1;
        linking.listeners = linking.listeners.filter((entry) => entry !== listener);
      },
    };
  },
});

const handledUrls: string[] = [];
mockModule(mock, sourcePath('services/auth/authDeepLink.ts'), {
  handleAuthDeepLinkUrl: async (url: string) => {
    handledUrls.push(url);
    return true;
  },
  flushPendingResetPasswordNavigation: () => {},
});

let useAuthDeepLink: typeof import('./useAuthDeepLink').useAuthDeepLink;

before(async () => {
  ({ useAuthDeepLink } = await import('./useAuthDeepLink'));
});

beforeEach(() => {
  effectCleanups.length = 0;
  handledUrls.length = 0;
  linking.getInitialURL = async () => null;
  linking.listeners = [];
  linking.removeCalls = 0;
});

/** Runs the hook's effect and returns the unmount handler React would call. */
const mountHook = (): (() => void) => {
  // There is no renderer here: `react` is mocked with a useEffect that runs the
  // effect inline, so calling the hook directly is how it gets exercised.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useAuthDeepLink();
  const cleanup = effectCleanups[effectCleanups.length - 1];
  assert.equal(typeof cleanup, 'function', 'the effect must return a cleanup function');
  return cleanup as () => void;
};

/** Lets already-resolved promise chains inside the effect run to completion. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('mounting subscribes to exactly one Linking url event', () => {
  mountHook();

  assert.equal(linking.listeners.length, 1);
});

test('a cold start from a deep link hands the launch URL to the auth handler', async () => {
  linking.getInitialURL = async () => 'com.everybible.app://reset-password#type=recovery';

  mountHook();
  await flushMicrotasks();

  assert.deepEqual(handledUrls, ['com.everybible.app://reset-password#type=recovery']);
});

test('a normal cold start with no launch URL handles nothing', async () => {
  mountHook();
  await flushMicrotasks();

  assert.deepEqual(handledUrls, []);
});

test('every warm deep link that arrives is handed to the auth handler', async () => {
  mountHook();

  linking.listeners[0]({ url: 'com.everybible.app://reset-password#one' });
  linking.listeners[0]({ url: 'com.everybible.app://reset-password#two' });
  await flushMicrotasks();

  assert.deepEqual(handledUrls, [
    'com.everybible.app://reset-password#one',
    'com.everybible.app://reset-password#two',
  ]);
});

test('a failure reading the launch URL is swallowed instead of crashing the app', async () => {
  linking.getInitialURL = async () => {
    throw new Error('Linking unavailable');
  };

  mountHook();
  await flushMicrotasks();

  assert.deepEqual(handledUrls, []);
  assert.equal(linking.listeners.length, 1);
});

test('a launch URL that resolves after unmount is dropped', async () => {
  let resolveInitialUrl: (url: string | null) => void = () => {};
  linking.getInitialURL = () =>
    new Promise<string | null>((resolve) => {
      resolveInitialUrl = resolve;
    });

  const unmount = mountHook();
  unmount();
  resolveInitialUrl('com.everybible.app://reset-password#late');
  await flushMicrotasks();

  assert.deepEqual(handledUrls, []);
});

test('unmounting removes the Linking subscription', () => {
  const unmount = mountHook();

  unmount();

  assert.equal(linking.removeCalls, 1);
  assert.deepEqual(linking.listeners, []);
});
