import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DevicePushToken } from 'expo-notifications';

const compiled = ts.transpileModule(
  readFileSync(new URL('./notificationService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const deviceToken = (data: string): DevicePushToken => ({ type: 'ios', data });
type DatabaseResult = { error: { message: string } | null };
type TokenOptions = { projectId: string; baseUrl: string; devicePushToken?: DevicePushToken };
type DeviceWrite = { user_id: string; push_token: string; is_active: boolean; platform: string };

function notificationHarness() {
  const api = {} as typeof import('./notificationService');
  const platform = { OS: 'ios' };
  const auth = { user: { uid: 'user-a' } as { uid: string } | null, authGeneration: 0 };
  const permission = { current: 'granted', requested: 'granted' };
  const permissionCalls: string[] = [];
  const cancellations: string[] = [];
  const schedules: Array<Record<string, unknown>> = [];
  const channels: Array<{ id: string; options: Record<string, unknown> }> = [];
  const autoRegistration: boolean[] = [];
  const tokenCalls: TokenOptions[] = [];
  const upserts: Array<{ table: string; row: DeviceWrite; options: Record<string, unknown> }> = [];
  const updates: Array<{
    table: string;
    row: Record<string, unknown>;
    filters: Record<string, string>;
  }> = [];
  let getToken: (options: TokenOptions) => Promise<{ data: string }> = async () => ({
    data: 'expo-token',
  });
  let upsert: (row: DeviceWrite) => Promise<DatabaseResult> = async () => ({ error: null });
  let update: () => Promise<DatabaseResult> = async () => ({ error: null });

  runInNewContext(compiled, {
    exports: api,
    require: (name: string) => {
      if (name === 'react-native') return { Platform: platform };
      if (name === '../../stores/authStore') return { useAuthStore: { getState: () => auth } };
      if (name === 'expo-constants')
        return { default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } } };
      if (name === '../../i18n') return { default: { t: (key: string) => key } };
      if (name === './notificationBootstrap') return { setupNotificationHandler: () => {} };
      if (name === 'expo-notifications')
        return {
          AndroidImportance: { DEFAULT: 3, HIGH: 4 },
          SchedulableTriggerInputTypes: { DAILY: 'daily' },
          getPermissionsAsync: async () => {
            permissionCalls.push('get');
            return { status: permission.current };
          },
          requestPermissionsAsync: async () => {
            permissionCalls.push('request');
            return { status: permission.requested };
          },
          setAutoServerRegistrationEnabledAsync: async (enabled: boolean) => {
            autoRegistration.push(enabled);
          },
          getExpoPushTokenAsync: (options: TokenOptions) => {
            tokenCalls.push(options);
            return getToken(options);
          },
          cancelScheduledNotificationAsync: async (id: string) => {
            cancellations.push(id);
          },
          scheduleNotificationAsync: async (request: Record<string, unknown>) => {
            schedules.push(request);
          },
          setNotificationChannelAsync: async (id: string, options: Record<string, unknown>) => {
            channels.push({ id, options });
          },
        };
      if (name === '../supabase')
        return {
          supabase: {
            from: (table: string) => ({
              upsert: (row: DeviceWrite, options: Record<string, unknown>) => {
                upserts.push({ table, row, options });
                return upsert(row);
              },
              update: (row: Record<string, unknown>) => ({
                eq: (first: string, firstValue: string) => ({
                  eq: (second: string, secondValue: string) => {
                    updates.push({
                      table,
                      row,
                      filters: { [first]: firstValue, [second]: secondValue },
                    });
                    return update();
                  },
                }),
              }),
            }),
          },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    api,
    platform,
    permission,
    permissionCalls,
    cancellations,
    schedules,
    channels,
    autoRegistration,
    tokenCalls,
    upserts,
    updates,
    setUser: (uid: string | null) => {
      auth.user = uid ? { uid } : null;
      auth.authGeneration++;
    },
    setGetToken: (fn: typeof getToken) => {
      getToken = fn;
    },
    setUpsert: (fn: typeof upsert) => {
      upsert = fn;
    },
    setUpdate: (fn: typeof update) => {
      update = fn;
    },
  };
}

test('daily reminders use a stable identifier and preserve unrelated schedules', async () => {
  const h = notificationHarness();
  await h.api.scheduleDailyReminder(8, 30);
  await h.api.cancelDailyReminder();
  assert.deepEqual(h.cancellations, ['daily-reading-reminder', 'daily-reading-reminder']);
  assert.equal(h.schedules.length, 1);
  const schedule = h.schedules[0];
  assert.equal(schedule.identifier, 'daily-reading-reminder');
  assert.deepEqual(JSON.parse(JSON.stringify(schedule.trigger)), {
    type: 'daily',
    hour: 8,
    minute: 30,
    channelId: 'daily-reminder',
  });
  assert.equal((schedule.content as { title: string }).title, 'settings.notificationTitle');
});

test('permissions reuse a grant and otherwise return the requested permission result', async () => {
  const h = notificationHarness();
  assert.equal(await h.api.requestNotificationPermissions(), true);
  assert.deepEqual(h.permissionCalls, ['get']);
  h.permission.current = 'undetermined';
  assert.equal(await h.api.requestNotificationPermissions(), true);
  h.permission.requested = 'denied';
  assert.equal(await h.api.requestNotificationPermissions(), false);
  assert.deepEqual(h.permissionCalls, ['get', 'get', 'request', 'get', 'request']);
});

test('Android channels retain their translated names and importance and skip iOS', async () => {
  const h = notificationHarness();
  await h.api.setupAndroidChannels();
  assert.equal(h.channels.length, 0);
  h.platform.OS = 'android';
  await h.api.setupAndroidChannels();
  assert.deepEqual(
    h.channels.map(({ id, options }) => [id, options.name, options.importance]),
    [
      ['daily-reminder', 'notifications.channelDailyReminder', 3],
      ['group-alerts', 'notifications.channelGroupAlerts', 4],
    ]
  );
});

test('registration forwards the native token, disables auto registration and caches a successful upsert', async () => {
  const h = notificationHarness();
  const token = deviceToken('native-token');
  assert.equal(await h.api.registerPushToken('user-a', token), 'expo-token');
  assert.deepEqual(h.autoRegistration, [false]);
  assert.equal(h.tokenCalls[0].projectId, 'project-id');
  assert.equal(h.tokenCalls[0].baseUrl, 'https://exp.host/--/api/v2/');
  assert.equal(h.tokenCalls[0].devicePushToken, token);
  assert.equal(h.upserts[0].table, 'user_devices');
  assert.equal(h.upserts[0].row.user_id, 'user-a');
  assert.equal(h.upserts[0].row.push_token, 'expo-token');
  assert.equal(h.upserts[0].row.platform, 'ios');
  assert.equal(h.upserts[0].row.is_active, true);
  assert.equal(h.upserts[0].options.onConflict, 'user_id,push_token');
  assert.equal(h.api.getCachedPushToken(), 'expo-token');
  assert.equal(await h.api.registerPushToken('user-a', token), 'expo-token');
  assert.equal(h.upserts.length, 1);
});

test('concurrent requests for the same user and device token share one registration', async () => {
  const h = notificationHarness();
  const native = deferred<{ data: string }>();
  h.setGetToken(() => native.promise);
  const first = h.api.registerPushToken('user-a', deviceToken('native-token'));
  const second = h.api.registerPushToken('user-a', deviceToken('native-token'));
  await settle();
  assert.equal(h.tokenCalls.length, 1);
  native.resolve({ data: 'expo-token' });
  assert.deepEqual(await Promise.all([first, second]), ['expo-token', 'expo-token']);
  assert.equal(h.upserts.length, 1);
});

for (const change of ['account', 'device token'] as const) {
  test(`a newer ${change} registration is not replaced by an older native token result`, async () => {
    const h = notificationHarness();
    const oldToken = deferred<{ data: string }>();
    h.setGetToken(() =>
      h.tokenCalls.length === 1 ? oldToken.promise : Promise.resolve({ data: 'new-expo' })
    );
    const old = h.api.registerPushToken('user-a', deviceToken('old-native'));
    await settle();
    const nextUser = change === 'account' ? 'user-b' : 'user-a';
    if (change === 'account') h.setUser(nextUser);
    const newer = h.api.registerPushToken(nextUser, deviceToken('new-native'));
    await settle();
    assert.equal(
      h.tokenCalls.length,
      2,
      'different registration identities require separate native requests'
    );
    assert.equal(await newer, 'new-expo');
    oldToken.resolve({ data: 'old-expo' });
    assert.equal(await old, null);
    assert.equal(h.api.getCachedPushToken(), 'new-expo');
    assert.deepEqual(
      h.upserts.map(({ row }) => [row.user_id, row.push_token]),
      [[nextUser, 'new-expo']]
    );
  });
}

test('signout invalidates a pending native request without waiting for it or requiring a cached token', async () => {
  const h = notificationHarness();
  const native = deferred<{ data: string }>();
  h.setGetToken(() => native.promise);
  const registration = h.api.registerPushToken('user-a');
  await settle();
  let deactivated = false;
  const deactivation = h.api.deactivatePushToken('user-a').then(() => {
    deactivated = true;
  });
  await settle();
  assert.equal(deactivated, true, 'signout must not wait for native token acquisition');
  native.resolve({ data: 'late-expo' });
  assert.equal(await registration, null);
  await deactivation;
  assert.equal(h.upserts.length, 0, 'signed-out user must never be reactivated');
  assert.equal(h.api.getCachedPushToken(), null);
});

test('signout waits for a started database write and its inactive cleanup', async () => {
  const h = notificationHarness();
  const write = deferred<DatabaseResult>();
  const cleanup = deferred<DatabaseResult>();
  h.setUpsert(() => write.promise);
  h.setUpdate(() => cleanup.promise);
  const registration = h.api.registerPushToken('user-a');
  await settle();
  assert.equal(h.upserts.length, 1);
  let deactivated = false;
  const deactivation = h.api.deactivatePushToken('user-a').then(() => {
    deactivated = true;
  });
  await settle();
  assert.equal(
    deactivated,
    false,
    'credentials must remain available until the started write is cleaned up'
  );
  write.resolve({ error: null });
  await settle();
  assert.equal(h.updates.length, 1);
  assert.deepEqual(h.updates[0].filters, { user_id: 'user-a', push_token: 'expo-token' });
  assert.equal(h.updates[0].row.is_active, false);
  assert.equal(deactivated, false, 'signout must also await the inactive update');
  cleanup.resolve({ error: null });
  await deactivation;
  assert.equal(await registration, null);
  assert.equal(h.api.getCachedPushToken(), null);
});

test('delayed deactivation for an old account cannot clear a new account cache', async () => {
  const h = notificationHarness();
  await h.api.registerPushToken('user-a');
  const cleanup = deferred<DatabaseResult>();
  h.setUpdate(() => cleanup.promise);
  const deactivation = h.api.deactivatePushToken('user-a');
  assert.equal(
    h.api.getCachedPushToken(),
    null,
    'old cache is invalidated before awaiting the server'
  );
  h.setGetToken(async () => ({ data: 'new-expo' }));
  h.setUser('user-b');
  assert.equal(await h.api.registerPushToken('user-b'), 'new-expo');
  cleanup.resolve({ error: null });
  await deactivation;
  assert.equal(h.api.getCachedPushToken(), 'new-expo');
  assert.deepEqual(h.updates[0].filters, { user_id: 'user-a', push_token: 'expo-token' });
});

test('deactivating another user leaves the current cache and pending registration intact', async () => {
  const h = notificationHarness();
  h.setUser('user-b');
  await h.api.registerPushToken('user-b');
  await h.api.deactivatePushToken('user-a');
  assert.equal(h.api.getCachedPushToken(), 'expo-token');
  assert.equal(h.updates.length, 0);
});

for (const failure of ['permission', 'native', 'database'] as const) {
  test(`registration remains non-fatal on ${failure} failure and never caches a failed token`, async () => {
    const h = notificationHarness();
    if (failure === 'permission') h.permission.current = 'denied';
    if (failure === 'native')
      h.setGetToken(async () => {
        throw new Error('Simulator');
      });
    if (failure === 'database') h.setUpsert(async () => ({ error: { message: 'RLS denied' } }));
    assert.equal(await h.api.registerPushToken('user-a'), null);
    assert.equal(h.api.getCachedPushToken(), null);
    assert.equal(h.upserts.length, failure === 'database' ? 1 : 0);
  });
}

test('signout blocks new callbacks for the invalidated auth generation but allows a fresh login', async () => {
  const h = notificationHarness();
  await h.api.deactivatePushToken('user-a');
  assert.equal(await h.api.registerPushToken('user-a'), null);
  assert.equal(h.tokenCalls.length, 0);
  h.setUser(null);
  h.setUser('user-a');
  assert.equal(await h.api.registerPushToken('user-a'), 'expo-token');
});

test('registration rejects a stale account even before native work starts', async () => {
  const h = notificationHarness();
  h.setUser('user-b');
  assert.equal(await h.api.registerPushToken('user-a'), null);
  assert.equal(h.tokenCalls.length, 0);
});

test('a newer token waits for superseded database cleanup before activating the same Expo token', async () => {
  const h = notificationHarness();
  const firstWrite = deferred<DatabaseResult>();
  const firstCleanup = deferred<DatabaseResult>();
  h.setUpsert(() =>
    h.upserts.length === 1 ? firstWrite.promise : Promise.resolve({ error: null })
  );
  h.setUpdate(() => firstCleanup.promise);
  const old = h.api.registerPushToken('user-a', deviceToken('old-native'));
  await settle();
  const newer = h.api.registerPushToken('user-a', deviceToken('new-native'));
  await settle();
  assert.equal(h.tokenCalls.length, 2);
  assert.equal(h.upserts.length, 1);
  firstWrite.resolve({ error: null });
  await settle();
  assert.equal(h.updates.length, 1);
  assert.equal(
    h.upserts.length,
    1,
    'new active write must follow cleanup, even if Expo returns the same token'
  );
  firstCleanup.resolve({ error: null });
  assert.equal(await old, null);
  assert.equal(await newer, 'expo-token');
  assert.equal(h.upserts.length, 2);
  assert.equal(h.api.getCachedPushToken(), 'expo-token');
});
