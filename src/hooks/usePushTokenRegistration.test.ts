import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import type { DevicePushToken } from 'expo-notifications';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let tokenListener: ((token: DevicePushToken) => void) | null = null;
let listenerRemovals = 0;
// The hook listens through the startup-light bootstrap module, never the
// expo-notifications root (see notificationBootstrap.ts).
mockModule(mock, sourcePath('services/notifications/notificationBootstrap.ts'), {
  addPushTokenListener: (callback: (token: DevicePushToken) => void) => {
    tokenListener = callback;
    return {
      remove: () => {
        listenerRemovals += 1;
      },
    };
  },
});

const auth = {
  user: { uid: 'user-a' } as { uid: string } | null,
  authGeneration: 0,
  isAuthenticated: true,
  awaitingTokenRefresh: false,
};
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: Object.assign(<T>(selector: (state: typeof auth) => T): T => selector(auth), {
    getState: () => auth,
  }),
});

// The service is imported lazily; each import settles on a later turn, so auth can
// change in between exactly as it can on a device.
const registrations: Array<{ userId: string; token?: DevicePushToken }> = [];
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  registerPushToken: async (userId: string, token?: DevicePushToken) => {
    registrations.push(token ? { userId, token } : { userId });
  },
});

type Hook = typeof import('./usePushTokenRegistration').usePushTokenRegistration;
let usePushTokenRegistration: Hook;

before(async () => {
  ({ usePushTokenRegistration } = await import('./usePushTokenRegistration'));
  // Load the (mocked) service once up front, so every lazy import in a test resolves from
  // the module cache within the turns settle() waits for.
  await import('../services/notifications');
});

beforeEach(() => {
  auth.user = { uid: 'user-a' };
  auth.authGeneration = 0;
  auth.isAuthenticated = true;
  auth.awaitingTokenRefresh = false;
  registrations.length = 0;
  tokenListener = null;
  listenerRemovals = 0;
});

afterEach(() => {
  runtime.unmountAll();
});

const TOKEN: DevicePushToken = { type: 'ios', data: 'refreshed-native-token' };

// Lets the cached lazy import and its continuation run.
async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function mountApp(isAuthenticated = true, userId: string | undefined = 'user-a') {
  const view = runtime.mount(usePushTokenRegistration, isAuthenticated, userId);
  view.flushEffects();
  return view;
}

function changeAuth(uid: string | null) {
  auth.user = uid ? { uid } : null;
  auth.isAuthenticated = Boolean(uid);
  auth.authGeneration += 1;
}

test('registration and token refresh forward the signed-in account and the native token', async () => {
  mountApp();
  await settle();
  assert.deepEqual(registrations, [{ userId: 'user-a' }]);

  tokenListener?.(TOKEN);
  await settle();
  assert.deepEqual(registrations[1], { userId: 'user-a', token: TOKEN });
});

for (const nextUser of ['user-b', 'user-a', null]) {
  test(`a delayed registration is dropped after auth changes to ${nextUser ?? 'signed out'}`, async () => {
    mountApp();
    changeAuth(nextUser);
    await settle();

    assert.deepEqual(registrations, []);
  });
}

test('a delayed token refresh is dropped after the account changes', async () => {
  mountApp();
  await settle();
  registrations.length = 0;

  tokenListener?.(TOKEN);
  changeAuth('user-b');
  await settle();

  assert.deepEqual(registrations, []);
});

test('unmounting cancels pending registration and refresh and removes the listener', async () => {
  const view = mountApp();
  tokenListener?.(TOKEN);
  view.unmount();
  await settle();

  assert.deepEqual(registrations, []);
  assert.equal(listenerRemovals, 1);
});

test('nothing registers while signed out, and a token refresh without a user is ignored', async () => {
  auth.user = null;
  auth.isAuthenticated = false;
  mountApp(false, undefined);
  tokenListener?.(TOKEN);
  await settle();

  assert.deepEqual(registrations, []);
});

test('nothing registers while the session waits for its token refresh, and it registers once refreshed', async () => {
  auth.awaitingTokenRefresh = true;
  const view = mountApp();
  tokenListener?.(TOKEN);
  await settle();
  assert.deepEqual(registrations, []);

  auth.awaitingTokenRefresh = false;
  view.rerender();
  view.flushEffects();
  await settle();

  assert.deepEqual(registrations, [{ userId: 'user-a' }]);
});
