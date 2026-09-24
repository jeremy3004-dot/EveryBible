import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import type { DevicePushToken } from 'expo-notifications';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock);

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
let notifyNotificationPermissionRequested: () => void;

before(async () => {
  ({ usePushTokenRegistration } = await import('./usePushTokenRegistration'));
  ({ notifyNotificationPermissionRequested } =
    await import('../services/notifications/notificationPermissionEvents'));
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

test('a pending registration and token refresh are dropped if the session starts waiting for a token refresh', async () => {
  mountApp();
  tokenListener?.(TOKEN);
  auth.awaitingTokenRefresh = true;
  await settle();

  assert.deepEqual(registrations, []);
});

test('a pending token refresh is dropped when the user is signed out on the same account id', async () => {
  mountApp();
  await settle();
  registrations.length = 0;

  tokenListener?.(TOKEN);
  auth.isAuthenticated = false;
  await settle();

  assert.deepEqual(registrations, []);
});

test('pending registrations are dropped when the user record disappears before they run', async () => {
  mountApp();
  tokenListener?.(TOKEN);
  // isAuthenticated is still set, but there is no account to register the token for.
  auth.user = null;
  await settle();

  assert.deepEqual(registrations, []);
});

// Registration needs notification permission. A user who grants it after launch (from
// the Settings reminder, or in system settings and then back to the app) used to have
// no push token until the next launch. The service skips the native and server work
// for a device it already registered, so asking again here costs nothing.

test('granting notification permission in the app registers the token straight away', async () => {
  mountApp();
  await settle();
  registrations.length = 0;

  notifyNotificationPermissionRequested();
  await settle();

  assert.deepEqual(registrations, [{ userId: 'user-a' }]);
});

test('returning to the app (e.g. from system settings) registers again, backgrounding does not', async () => {
  mountApp();
  await settle();
  registrations.length = 0;

  rn.AppState.emit('background');
  await settle();
  assert.deepEqual(registrations, []);

  rn.AppState.emit('active');
  await settle();
  assert.deepEqual(registrations, [{ userId: 'user-a' }]);
});

test('a permission change or foreground while signed out or awaiting a token refresh registers nothing', async () => {
  auth.user = null;
  auth.isAuthenticated = false;
  const signedOut = mountApp(false, undefined);
  notifyNotificationPermissionRequested();
  rn.AppState.emit('active');
  await settle();
  signedOut.unmount();

  auth.user = { uid: 'user-a' };
  auth.isAuthenticated = true;
  auth.awaitingTokenRefresh = true;
  mountApp();
  notifyNotificationPermissionRequested();
  rn.AppState.emit('active');
  await settle();

  assert.deepEqual(registrations, []);
});

test('a foreground registration still pending is dropped when the account changes', async () => {
  mountApp();
  await settle();
  registrations.length = 0;

  rn.AppState.emit('active');
  changeAuth('user-b');
  await settle();

  assert.deepEqual(registrations, []);
});

test('unmounting stops listening for the foreground and for permission requests', async () => {
  const view = mountApp();
  await settle();
  registrations.length = 0;

  view.unmount();
  notifyNotificationPermissionRequested();
  rn.AppState.emit('active');
  await settle();

  assert.deepEqual(registrations, []);
  assert.equal(rn.AppState.listenerCount(), 0);
});
