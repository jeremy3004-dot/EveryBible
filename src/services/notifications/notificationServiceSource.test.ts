import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DevicePushToken } from 'expo-notifications';

// Execute App's real effect callbacks without mounting its native navigation tree.
// Module loading remains asynchronous, so auth can change before each import resolves.
function appPushEffectsHarness() {
  const source = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('// Register push token after authentication.');
  const end = source.indexOf('\n  return (', start);
  assert.ok(start > 0 && end > start, 'App notification effect region must exist');
  const compiled = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const auth = {
    user: { uid: 'user-a' } as { uid: string } | null,
    authGeneration: 0,
    isAuthenticated: true,
  };
  const registrations: Array<{ userId: string; token?: DevicePushToken }> = [];
  const cleanups: Array<() => void> = [];
  let listener!: (token: DevicePushToken) => void;
  runInNewContext(compiled, {
    isAuthenticated: true,
    user: auth.user,
    useAuthStore: { getState: () => auth },
    useEffect: (callback: () => (() => void) | undefined) => {
      const cleanup = callback();
      if (cleanup) cleanups.push(cleanup);
    },
    Notifications: {
      addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
      addPushTokenListener: (callback: typeof listener) => {
        listener = callback;
        return { remove: () => {} };
      },
    },
    require: (name: string) => {
      assert.equal(name, './src/services/notifications');
      return {
        registerPushToken: (userId: string, token?: DevicePushToken) => {
          registrations.push({ userId, token });
        },
      };
    },
  });
  return {
    registrations,
    refresh: (token: DevicePushToken) => listener(token),
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
    changeAuth: (uid: string | null) => {
      auth.user = uid ? { uid } : null;
      auth.isAuthenticated = Boolean(uid);
      auth.authGeneration++;
    },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('App registration and refresh effects forward the authenticated account and native token', async () => {
  const h = appPushEffectsHarness();
  await settle();
  assert.deepEqual(h.registrations, [{ userId: 'user-a', token: undefined }]);
  const token: DevicePushToken = { type: 'ios', data: 'refreshed-native-token' };
  h.refresh(token);
  await settle();
  assert.deepEqual(h.registrations[1], { userId: 'user-a', token });
});

for (const nextUser of ['user-b', 'user-a', null]) {
  test(`App skips delayed registration after auth changes to ${nextUser ?? 'signed out'}`, async () => {
    const h = appPushEffectsHarness();
    h.changeAuth(nextUser);
    await settle();
    assert.equal(h.registrations.length, 0);
  });
}

test('App skips a delayed token refresh after the account changes', async () => {
  const h = appPushEffectsHarness();
  await settle();
  h.registrations.length = 0;
  h.refresh({ type: 'ios', data: 'refreshed-native-token' });
  h.changeAuth('user-b');
  await settle();
  assert.equal(h.registrations.length, 0);
});

test('App cleanup cancels delayed registration and refresh callbacks', async () => {
  const h = appPushEffectsHarness();
  h.refresh({ type: 'ios', data: 'refreshed-native-token' });
  h.unmount();
  await settle();
  assert.equal(h.registrations.length, 0);
});
