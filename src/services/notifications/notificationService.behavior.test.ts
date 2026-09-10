import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { DevicePushToken } from 'expo-notifications';
import {
  mockModule,
  mockReactNative,
  mockSupabaseModule,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake, type SupabaseFakeResult } from '../../testing/supabaseFake';

/**
 * Behavioural coverage through the real module loader. The vm-based
 * notificationService.test.ts gets a fresh module per scenario; here the module
 * is loaded once, so every test uses a fresh user id and cleans up its own
 * registration (see `nextUser` / the afterEach-style cleanup in each test).
 */
const rn = mockReactNative(mock, { os: 'ios' });

const authState = {
  user: null as { uid: string } | null,
  authGeneration: 0,
  throws: false,
};
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => {
      if (authState.throws) {
        throw new Error('auth store unavailable');
      }
      return authState;
    },
  },
});

mockModule(mock, sourcePath('i18n/index.ts'), { default: { t: (key: string) => key } });

const expoConfig: { extra?: { eas?: { projectId?: string } } } = {
  extra: { eas: { projectId: 'project-id' } },
};
mockModule(mock, 'expo-constants', { default: { expoConfig } });

interface TokenOptions {
  projectId: string;
  baseUrl: string;
  devicePushToken?: DevicePushToken;
}

const permission = { current: 'granted', requested: 'granted' };
const permissionCalls: string[] = [];
const cancellations: string[] = [];
const schedules: Array<Record<string, unknown>> = [];
const channels: Array<{ id: string; options: Record<string, unknown> }> = [];
const autoRegistration: boolean[] = [];
const tokenCalls: TokenOptions[] = [];
let cancelFailure: Error | null = null;
let channelFailure: Error | null = null;
let getToken: (options: TokenOptions) => Promise<{ data: string }> = async () => ({
  data: 'expo-token',
});

mockModule(mock, 'expo-notifications', {
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationHandler: () => {},
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
  cancelScheduledNotificationAsync: async (identifier: string) => {
    cancellations.push(identifier);
    if (cancelFailure) {
      throw cancelFailure;
    }
  },
  scheduleNotificationAsync: async (request: Record<string, unknown>) => {
    schedules.push(request);
  },
  setNotificationChannelAsync: async (id: string, options: Record<string, unknown>) => {
    if (channelFailure) {
      throw channelFailure;
    }
    channels.push({ id, options });
  },
});

const fake = createSupabaseFake();
mockSupabaseModule(mock, fake);

let upsertResult: () => Promise<SupabaseFakeResult> = async () => ({ error: null });
let updateResult: () => Promise<SupabaseFakeResult> = async () => ({ error: null });
const installDeviceResponder = () => {
  fake.respondTo('user_devices', (call) =>
    call.operation === 'upsert' ? upsertResult() : updateResult()
  );
};

let notifications: typeof import('./notificationService');

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const deviceToken = (data: string): DevicePushToken => ({ type: 'ios', data }) as DevicePushToken;

let userCounter = 0;
/** A user id no earlier test has touched, so module-level caches stay isolated. */
const nextUser = () => {
  userCounter += 1;
  const uid = `user-${userCounter}`;
  authState.user = { uid };
  authState.authGeneration += 1;
  return uid;
};

const upsertsFor = (userId: string) =>
  fake
    .callsFor('user_devices')
    .filter(
      (call) =>
        call.operation === 'upsert' && (call.payload as { user_id: string }).user_id === userId
    );

before(async () => {
  notifications = await import('./notificationService');
});

beforeEach(() => {
  fake.reset();
  installDeviceResponder();
  permissionCalls.length = 0;
  cancellations.length = 0;
  schedules.length = 0;
  channels.length = 0;
  autoRegistration.length = 0;
  tokenCalls.length = 0;
  permission.current = 'granted';
  permission.requested = 'granted';
  cancelFailure = null;
  channelFailure = null;
  authState.throws = false;
  expoConfig.extra = { eas: { projectId: 'project-id' } };
  rn.Platform.OS = 'ios';
  upsertResult = async () => ({ error: null });
  updateResult = async () => ({ error: null });
  getToken = async () => ({ data: 'expo-token' });
});

// ─── Channels and permissions ────────────────────────────────────────────────

test('iOS creates no Android notification channels', async () => {
  await notifications.setupAndroidChannels();

  assert.deepEqual(channels, []);
});

// The three tests below run in order and share one module-scoped memo: the
// setup promise is cached for the whole launch, so the failure case has to be
// the first Android caller in this file and the memo case the last.

// Proves the dependency the ordering rests on: on Android a trigger naming a channel the
// OS has not been told about is dropped, so scheduling must await the channel setup and
// must not schedule at all when that setup fails. Runs before any successful Android
// setup, while the memo is still empty.
test('a reminder is never scheduled when its Android channel cannot be created', async () => {
  rn.Platform.OS = 'android';
  channelFailure = new Error('channel service unavailable');

  await assert.rejects(() => notifications.scheduleDailyReminder(7, 30), {
    message: 'channel service unavailable',
  });

  assert.deepEqual(channels, []);
  assert.deepEqual(schedules, [], 'a trigger must not be registered ahead of its channel');
  assert.deepEqual(cancellations, []);
});

test('a failed channel setup is not cached, so the next caller retries', async () => {
  rn.Platform.OS = 'android';
  channelFailure = new Error('channel service unavailable');

  await assert.rejects(() => notifications.setupAndroidChannels(), {
    message: 'channel service unavailable',
  });
  assert.equal(channels.length, 0);

  channelFailure = null;
  await notifications.setupAndroidChannels();

  assert.deepEqual(
    channels.map(({ id, options }) => [id, options.name, options.importance, options.sound]),
    [['daily-reminder', 'notifications.channelDailyReminder', 3, 'default']]
  );
});

test('Android creates only the daily reminder channel, the one a trigger names', async () => {
  rn.Platform.OS = 'android';

  await notifications.setupAndroidChannels();

  assert.deepEqual(
    channels.filter(({ id }) => id !== 'daily-reminder'),
    [],
    'group-alerts was dead weight: nothing ever posted to it'
  );
});

test('the channel setup is memoized per launch, so repeated callers configure it once', async () => {
  rn.Platform.OS = 'android';

  await notifications.setupAndroidChannels();
  await Promise.all([notifications.setupAndroidChannels(), notifications.setupAndroidChannels()]);

  assert.deepEqual(channels, [], 'the first successful setup is the only one');
});

test('scheduling a reminder on Android waits for the channel its trigger names', async () => {
  rn.Platform.OS = 'android';

  await notifications.scheduleDailyReminder(8, 30);

  assert.equal(schedules.length, 1);
  assert.equal(
    (schedules[0].trigger as { channelId: string }).channelId,
    'daily-reminder',
    'a trigger naming a channel Android has not been told about is dropped'
  );
});

test('an existing permission grant is reused without prompting again', async () => {
  assert.equal(await notifications.requestNotificationPermissions(), true);

  assert.deepEqual(permissionCalls, ['get']);
});

test('an undetermined permission prompts the user and reports the grant', async () => {
  permission.current = 'undetermined';

  assert.equal(await notifications.requestNotificationPermissions(), true);

  assert.deepEqual(permissionCalls, ['get', 'request']);
});

test('a previously denied permission is asked for again and still reports unavailable', async () => {
  permission.current = 'denied';
  permission.requested = 'denied';

  assert.equal(await notifications.requestNotificationPermissions(), false);

  assert.deepEqual(permissionCalls, ['get', 'request']);
});

test('a denied prompt reports that notifications are unavailable', async () => {
  permission.current = 'undetermined';
  permission.requested = 'denied';

  assert.equal(await notifications.requestNotificationPermissions(), false);
});

// ─── Daily reminder ──────────────────────────────────────────────────────────

test('scheduling a reminder replaces the previous one under a stable identifier', async () => {
  await notifications.scheduleDailyReminder(8, 30);

  assert.deepEqual(cancellations, ['daily-reading-reminder']);
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].identifier, 'daily-reading-reminder');
  assert.deepEqual(JSON.parse(JSON.stringify(schedules[0].trigger)), {
    type: 'daily',
    hour: 8,
    minute: 30,
    channelId: 'daily-reminder',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(schedules[0].content)), {
    title: 'settings.notificationTitle',
    body: 'settings.notificationBody',
    sound: true,
  });
});

test('rescheduling a reminder cancels the previous one each time and keeps one identifier', async () => {
  await notifications.scheduleDailyReminder(8, 30);
  await notifications.scheduleDailyReminder(21, 15);

  assert.deepEqual(cancellations, ['daily-reading-reminder', 'daily-reading-reminder']);
  assert.deepEqual(
    schedules.map((request) => [request.identifier, (request.trigger as { hour: number }).hour]),
    [
      ['daily-reading-reminder', 8],
      ['daily-reading-reminder', 21],
    ],
    'the stable identifier is what stops duplicates piling up on the device'
  );
});

for (const [hour, minute] of [
  [0, 0],
  [23, 59],
  [12, 5],
] as const) {
  test(`a reminder set for ${hour}:${String(minute).padStart(2, '0')} is scheduled at exactly that time every day`, async () => {
    await notifications.scheduleDailyReminder(hour, minute);

    assert.deepEqual(JSON.parse(JSON.stringify(schedules[0].trigger)), {
      type: 'daily',
      hour,
      minute,
      channelId: 'daily-reminder',
    });
  });
}

test('scheduling still succeeds when there is no previous reminder to cancel', async () => {
  cancelFailure = new Error('no scheduled notification with that identifier');

  await notifications.scheduleDailyReminder(6, 0);

  assert.equal(schedules.length, 1);
});

test('cancelling targets only the daily reminder so other notifications survive', async () => {
  await notifications.cancelDailyReminder();

  assert.deepEqual(cancellations, ['daily-reading-reminder']);
  assert.equal(schedules.length, 0);
});

test('cancelling a reminder that is not scheduled is not an error', async () => {
  cancelFailure = new Error('no scheduled notification with that identifier');

  await assert.doesNotReject(() => notifications.cancelDailyReminder());
});

// ─── Push token registration ─────────────────────────────────────────────────

test('registering forwards the native token, disables Expo auto-registration and stores an active row', async () => {
  const uid = nextUser();
  const native = deviceToken('native-token');

  assert.equal(await notifications.registerPushToken(uid, native), 'expo-token');

  assert.deepEqual(autoRegistration, [false]);
  assert.equal(tokenCalls[0].projectId, 'project-id');
  assert.equal(tokenCalls[0].baseUrl, 'https://exp.host/--/api/v2/');
  assert.equal(tokenCalls[0].devicePushToken, native);
  const [upsert] = upsertsFor(uid);
  assert.deepEqual(upsert.payload, {
    user_id: uid,
    push_token: 'expo-token',
    platform: 'ios',
    is_active: true,
    updated_at: (upsert.payload as { updated_at: string }).updated_at,
  });
  assert.deepEqual(upsert.options, { onConflict: 'user_id,push_token' });
  assert.equal(notifications.getCachedPushToken(), 'expo-token');

  await notifications.deactivatePushToken(uid);
});

test('the platform column records android for Android devices', async () => {
  rn.Platform.OS = 'android';
  const uid = nextUser();

  await notifications.registerPushToken(uid);

  assert.equal((upsertsFor(uid)[0].payload as { platform: string }).platform, 'android');

  await notifications.deactivatePushToken(uid);
});

test('a repeat registration for the same account and device reuses the cached token', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid, deviceToken('native-token'));

  assert.equal(
    await notifications.registerPushToken(uid, deviceToken('native-token')),
    'expo-token'
  );
  assert.equal(upsertsFor(uid).length, 1);
  assert.equal(tokenCalls.length, 1);

  await notifications.deactivatePushToken(uid);
});

test('concurrent registrations for one account and device share a single native request', async () => {
  const uid = nextUser();
  const native = deferred<{ data: string }>();
  getToken = () => native.promise;

  const first = notifications.registerPushToken(uid, deviceToken('native-token'));
  const second = notifications.registerPushToken(uid, deviceToken('native-token'));
  await settle();
  assert.equal(tokenCalls.length, 1);
  native.resolve({ data: 'expo-token' });

  assert.deepEqual(await Promise.all([first, second]), ['expo-token', 'expo-token']);
  assert.equal(upsertsFor(uid).length, 1);

  await notifications.deactivatePushToken(uid);
});

test('registering for an account that is no longer signed in stops before any native work', async () => {
  nextUser();

  assert.equal(await notifications.registerPushToken('someone-else'), null);
  assert.deepEqual(tokenCalls, []);
});

test('registering with an unreadable auth store is refused rather than crashing startup', async () => {
  const uid = nextUser();
  authState.throws = true;

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.deepEqual(tokenCalls, []);
});

test('a build without an EAS project id cannot register and does not prompt for permissions', async () => {
  const uid = nextUser();
  expoConfig.extra = {};

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.deepEqual(permissionCalls, []);
});

test('registration stops when notification permission was refused', async () => {
  const uid = nextUser();
  permission.current = 'denied';

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.deepEqual(tokenCalls, []);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a native token failure on a simulator is non-fatal and caches nothing', async () => {
  const uid = nextUser();
  getToken = async () => {
    throw new Error('no push entitlement in the simulator');
  };

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.equal(upsertsFor(uid).length, 0);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a rejected database write leaves the token uncached so a later attempt retries', async () => {
  const uid = nextUser();
  upsertResult = async () => ({ error: { message: 'RLS denied' } });

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.equal(upsertsFor(uid).length, 1);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a database exception is swallowed so sign-in is never blocked', async () => {
  const uid = nextUser();
  upsertResult = async () => {
    throw new Error('network down');
  };

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a stale native token result never overwrites a newer device registration', async () => {
  const uid = nextUser();
  const stale = deferred<{ data: string }>();
  getToken = () =>
    tokenCalls.length === 1 ? stale.promise : Promise.resolve({ data: 'new-expo' });

  const old = notifications.registerPushToken(uid, deviceToken('old-native'));
  await settle();
  const newer = notifications.registerPushToken(uid, deviceToken('new-native'));
  await settle();

  assert.equal(tokenCalls.length, 2);
  assert.equal(await newer, 'new-expo');
  stale.resolve({ data: 'old-expo' });
  assert.equal(await old, null);
  assert.equal(notifications.getCachedPushToken(), 'new-expo');
  assert.deepEqual(
    upsertsFor(uid).map((call) => (call.payload as { push_token: string }).push_token),
    ['new-expo']
  );

  await notifications.deactivatePushToken(uid);
});

test('a registration for a newer account supersedes a pending one for the previous account', async () => {
  const first = nextUser();
  const stale = deferred<{ data: string }>();
  getToken = () =>
    tokenCalls.length === 1 ? stale.promise : Promise.resolve({ data: 'new-expo' });

  const old = notifications.registerPushToken(first, deviceToken('old-native'));
  await settle();
  const second = nextUser();
  const newer = notifications.registerPushToken(second, deviceToken('new-native'));
  await settle();

  assert.equal(await newer, 'new-expo');
  stale.resolve({ data: 'old-expo' });
  assert.equal(await old, null);
  assert.deepEqual(upsertsFor(first), []);
  assert.equal(notifications.getCachedPushToken(), 'new-expo');

  await notifications.deactivatePushToken(second);
});

test('a superseded write that reached the server is deactivated before the newer one activates', async () => {
  const uid = nextUser();
  const firstWrite = deferred<SupabaseFakeResult>();
  const firstCleanup = deferred<SupabaseFakeResult>();
  upsertResult = () =>
    upsertsFor(uid).length === 1 ? firstWrite.promise : Promise.resolve({ error: null });
  updateResult = () => firstCleanup.promise;

  const old = notifications.registerPushToken(uid, deviceToken('old-native'));
  await settle();
  const newer = notifications.registerPushToken(uid, deviceToken('new-native'));
  await settle();
  assert.equal(tokenCalls.length, 2);
  assert.equal(upsertsFor(uid).length, 1);

  firstWrite.resolve({ error: null });
  await settle();
  assert.ok(
    fake.callsFor('user_devices').some((call) => call.operation === 'update'),
    'the superseded row must be marked inactive'
  );
  assert.equal(
    upsertsFor(uid).length,
    1,
    'the newer active write must follow the cleanup, even for the same Expo token'
  );

  firstCleanup.resolve({ error: null });
  assert.equal(await old, null);
  assert.equal(await newer, 'expo-token');
  assert.equal(upsertsFor(uid).length, 2);
  assert.equal(notifications.getCachedPushToken(), 'expo-token');

  updateResult = async () => ({ error: null });
  await notifications.deactivatePushToken(uid);
});

// ─── Sign-out ────────────────────────────────────────────────────────────────

test('signing out marks the registered device row inactive and clears the cache', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);

  await notifications.deactivatePushToken(uid);

  const update = fake.callsFor('user_devices').find((call) => call.operation === 'update');
  assert.ok(update, 'the device row must be deactivated');
  assert.equal((update.payload as { is_active: boolean }).is_active, false);
  assert.deepEqual(
    update.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['user_id', uid],
      ['push_token', 'expo-token'],
    ]
  );
  assert.equal(notifications.getCachedPushToken(), null);
});

test('signing out does not wait for a pending native token request', async () => {
  const uid = nextUser();
  const native = deferred<{ data: string }>();
  getToken = () => native.promise;
  const registration = notifications.registerPushToken(uid);
  await settle();

  let signedOut = false;
  const deactivation = notifications.deactivatePushToken(uid).then(() => {
    signedOut = true;
  });
  await settle();

  assert.equal(signedOut, true);
  native.resolve({ data: 'late-expo' });
  assert.equal(await registration, null);
  await deactivation;
  assert.equal(upsertsFor(uid).length, 0, 'a signed-out device must never be activated');
  assert.equal(notifications.getCachedPushToken(), null);
});

test('signing out waits for a started database write and its cleanup', async () => {
  const uid = nextUser();
  const write = deferred<SupabaseFakeResult>();
  const cleanup = deferred<SupabaseFakeResult>();
  upsertResult = () => write.promise;
  updateResult = () => cleanup.promise;
  const registration = notifications.registerPushToken(uid);
  await settle();
  assert.equal(upsertsFor(uid).length, 1);

  let signedOut = false;
  const deactivation = notifications.deactivatePushToken(uid).then(() => {
    signedOut = true;
  });
  await settle();
  assert.equal(signedOut, false, 'credentials must survive until the write is cleaned up');

  write.resolve({ error: null });
  await settle();
  const update = fake.callsFor('user_devices').find((call) => call.operation === 'update');
  assert.ok(update);
  assert.equal(signedOut, false, 'sign-out also waits for the deactivating update');

  cleanup.resolve({ error: null });
  await deactivation;
  assert.equal(await registration, null);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a backend failure during sign-out cleanup still lets the user sign out', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  updateResult = async () => {
    throw new Error('offline');
  };

  await assert.doesNotReject(() => notifications.deactivatePushToken(uid));
  assert.equal(notifications.getCachedPushToken(), null);
});

test('signing out one account leaves another account cached and registered', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  const callsBefore = fake.callsFor('user_devices').length;

  await notifications.deactivatePushToken('never-registered');

  assert.equal(notifications.getCachedPushToken(), 'expo-token');
  assert.equal(fake.callsFor('user_devices').length, callsBefore);

  await notifications.deactivatePushToken(uid);
});

test('a signed-out session cannot re-register, but a fresh sign-in can', async () => {
  const uid = nextUser();
  await notifications.deactivatePushToken(uid);

  assert.equal(await notifications.registerPushToken(uid), null);
  assert.deepEqual(tokenCalls, []);

  authState.authGeneration += 1;
  assert.equal(await notifications.registerPushToken(uid), 'expo-token');

  await notifications.deactivatePushToken(uid);
});

test('a delayed sign-out for an old account cannot clear the new account cache', async () => {
  const first = nextUser();
  await notifications.registerPushToken(first);
  const cleanup = deferred<SupabaseFakeResult>();
  updateResult = () => cleanup.promise;

  const deactivation = notifications.deactivatePushToken(first);
  assert.equal(notifications.getCachedPushToken(), null);

  getToken = async () => ({ data: 'new-expo' });
  const second = nextUser();
  assert.equal(await notifications.registerPushToken(second), 'new-expo');

  cleanup.resolve({ error: null });
  await deactivation;
  assert.equal(notifications.getCachedPushToken(), 'new-expo');

  updateResult = async () => ({ error: null });
  await notifications.deactivatePushToken(second);
});

test('setupNotificationHandler is re-exported so callers need one notifications entry point', () => {
  assert.equal(typeof notifications.setupNotificationHandler, 'function');
});
