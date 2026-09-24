import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { DevicePushToken } from 'expo-notifications';
import {
  mockMmkvStorage,
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
// Holds the persisted "a reminder may be scheduled" flag (dailyReminderScheduleMarker.ts).
const mmkv = mockMmkvStorage(mock);
const MAY_BE_SCHEDULED_KEY = 'daily-reminder-may-be-scheduled';
// The one sign-out deactivation the backend never confirmed (pendingPushTokenDeactivation.ts).
const PENDING_DEACTIVATION_KEY = 'push-token-pending-deactivation';

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

// Discreet (calculator icon) mode: every app-generated notification must stay neutral.
const privacyState = { discreet: false };
mockModule(mock, sourcePath('stores/privacyStore.ts'), {
  isDiscreetModeActive: () => privacyState.discreet,
});

// `language` prefixes every string so a test can tell which language a reminder
// was scheduled in; it stays empty for the tests that assert on bare keys.
const i18nState = { language: '' };
mockModule(mock, sourcePath('i18n/index.ts'), {
  default: { t: (key: string) => `${i18nState.language}${key}` },
});

const expoConfig: { extra?: { eas?: { projectId?: string } } } = {
  extra: { eas: { projectId: 'project-id' } },
};
mockModule(mock, 'expo-constants', { default: { expoConfig } });

interface TokenOptions {
  projectId: string;
  baseUrl: string;
  devicePushToken?: DevicePushToken;
}

const permission = { current: 'granted', requested: 'granted', canAskAgain: true };
const permissionCalls: string[] = [];
const cancellations: string[] = [];
const schedules: Array<Record<string, unknown>> = [];
const channels: Array<{ id: string; options: Record<string, unknown> }> = [];
const autoRegistration: boolean[] = [];
const tokenCalls: TokenOptions[] = [];
let cancelFailure: Error | null = null;
let scheduleFailure: Error | null = null;
let channelFailure: Error | null = null;
let getToken: (options: TokenOptions) => Promise<{ data: string }> = async () => ({
  data: 'expo-token',
});

// Importance of each channel the OS knows about; the user can lower it to NONE.
const channelImportance = new Map<string, number>();
let channelReads = 0;
let channelReadFailure: Error | null = null;

mockModule(mock, 'expo-notifications', {
  AndroidImportance: { NONE: 1, DEFAULT: 3, HIGH: 4 },
  getNotificationChannelAsync: async (id: string) => {
    channelReads += 1;
    if (channelReadFailure) {
      throw channelReadFailure;
    }
    const importance = channelImportance.get(id);
    return importance === undefined ? null : { id, importance };
  },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => {
    permissionCalls.push('get');
    return { status: permission.current, canAskAgain: permission.canAskAgain };
  },
  requestPermissionsAsync: async () => {
    permissionCalls.push('request');
    return { status: permission.requested, canAskAgain: permission.canAskAgain };
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
    if (scheduleFailure) {
      throw scheduleFailure;
    }
    schedules.push(request);
  },
  setNotificationChannelAsync: async (id: string, options: Record<string, unknown>) => {
    if (channelFailure) {
      throw channelFailure;
    }
    channels.push({ id, options });
  },
});

// The re-exported setupNotificationHandler comes from notificationBootstrap,
// which deep-imports these files instead of the package root.
mockModule(mock, 'expo-notifications/build/NotificationsHandler', {
  setNotificationHandler: () => {},
});
mockModule(mock, 'expo-notifications/build/NotificationsEmitter', {
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
});
mockModule(mock, 'expo-notifications/build/TokenEmitter', {
  addPushTokenListener: () => ({ remove: () => {} }),
});

// Sign-out skips the device-row update when the device is offline (utils/connectivity).
const connectivity = { isConnected: true as boolean | null };
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: connectivity.isConnected, isInternetReachable: null }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

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
  mmkv.store.clear();
  installDeviceResponder();
  permissionCalls.length = 0;
  cancellations.length = 0;
  schedules.length = 0;
  channels.length = 0;
  autoRegistration.length = 0;
  tokenCalls.length = 0;
  permission.current = 'granted';
  permission.requested = 'granted';
  permission.canAskAgain = true;
  cancelFailure = null;
  scheduleFailure = null;
  channelFailure = null;
  channelImportance.clear();
  channelReads = 0;
  channelReadFailure = null;
  authState.throws = false;
  expoConfig.extra = { eas: { projectId: 'project-id' } };
  rn.Platform.OS = 'ios';
  i18nState.language = '';
  privacyState.discreet = false;
  connectivity.isConnected = true;
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

test('the channel is renamed once the app language has loaded, then memoized again', async () => {
  // Startup creates the channel before a non-English interface language has loaded,
  // so its name (shown in Android's notification settings) was stuck in English.
  rn.Platform.OS = 'android';
  i18nState.language = 'ru:';

  await notifications.setupAndroidChannels();
  await notifications.setupAndroidChannels();

  assert.deepEqual(
    channels.map(({ id, options }) => [id, options.name]),
    [['daily-reminder', 'ru:notifications.channelDailyReminder']]
  );
});

test('a reminder whose Android channel the user switched off is reported as blocked', async () => {
  // Android lets the user turn off one notification category while the app-level
  // permission stays granted; the reminder then never appears.
  rn.Platform.OS = 'android';
  channelImportance.set('daily-reminder', 1);

  assert.equal(await notifications.getDailyReminderSystemState(), 'blocked');
});

test('a reminder channel that is on, or not created yet, is allowed', async () => {
  rn.Platform.OS = 'android';
  assert.equal(await notifications.getDailyReminderSystemState(), 'allowed');

  channelImportance.set('daily-reminder', 3);
  assert.equal(await notifications.getDailyReminderSystemState(), 'allowed');
});

test('a reminder is reported as blocked when the system will not ask for permission again', async () => {
  permission.current = 'denied';
  permission.canAskAgain = false;
  assert.equal(await notifications.getDailyReminderSystemState(), 'blocked');

  rn.Platform.OS = 'android';
  assert.equal(await notifications.getDailyReminderSystemState(), 'blocked');
});

test('a reminder on a device never asked for permission needs it, without prompting', async () => {
  // The reminder was turned on on another device and arrived here by sync.
  permission.current = 'undetermined';

  assert.equal(await notifications.getDailyReminderSystemState(), 'needs-permission');
  assert.deepEqual(permissionCalls, ['get']);
});

test('an Android denial the system would still ask about again needs permission, not settings', async () => {
  rn.Platform.OS = 'android';
  permission.current = 'denied';
  permission.canAskAgain = true;

  assert.equal(await notifications.getDailyReminderSystemState(), 'needs-permission');
});

test('iOS never reads Android channels when checking whether the reminder is blocked', async () => {
  channelImportance.set('daily-reminder', 1);

  assert.equal(await notifications.getDailyReminderSystemState(), 'allowed');
  assert.equal(channelReads, 0);
});

test('an unreadable channel is not reported as blocked', async () => {
  rn.Platform.OS = 'android';
  channelReadFailure = new Error('notification service unavailable');

  assert.equal(await notifications.getDailyReminderSystemState(), 'allowed');
});

test('asking for permission tells listeners to re-read it, an existing grant does not', async () => {
  const { addNotificationPermissionRequestListener } =
    await import('./notificationPermissionEvents');
  let notified = 0;
  const subscription = addNotificationPermissionRequestListener(() => {
    notified += 1;
  });
  try {
    await notifications.requestNotificationPermissionOutcome();
    assert.equal(notified, 0, 'already granted: nothing was asked');

    permission.current = 'undetermined';
    await notifications.requestNotificationPermissionOutcome();
    assert.equal(notified, 1);

    subscription.remove();
    await notifications.requestNotificationPermissionOutcome();
    assert.equal(notified, 1, 'a removed listener hears nothing');
  } finally {
    subscription.remove();
  }
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

test('a denial the system will not ask about again is reported as blocked', async () => {
  // Android 13+ stops showing the POST_NOTIFICATIONS prompt after repeated denials; only
  // system settings can turn notifications back on, so the UI has to offer that route.
  permission.current = 'denied';
  permission.requested = 'denied';
  permission.canAskAgain = false;

  assert.equal(await notifications.requestNotificationPermissionOutcome(), 'blocked');
  assert.equal(await notifications.requestNotificationPermissions(), false);
});

test('a denial that can still be asked again is reported as denied', async () => {
  permission.current = 'undetermined';
  permission.requested = 'denied';

  assert.equal(await notifications.requestNotificationPermissionOutcome(), 'denied');
});

test('an existing grant is reported as granted', async () => {
  assert.equal(await notifications.requestNotificationPermissionOutcome(), 'granted');
});

test('reading the permission status never prompts', async () => {
  permission.current = 'denied';

  assert.equal(await notifications.getNotificationPermissionStatus(), 'denied');
  assert.deepEqual(permissionCalls, ['get']);
});

test('the permission status reports a grant and an unasked state as they are', async () => {
  permission.current = 'granted';
  assert.equal(await notifications.getNotificationPermissionStatus(), 'granted');

  permission.current = 'undetermined';
  assert.equal(await notifications.getNotificationPermissionStatus(), 'undetermined');
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
    // Lets a tap on the reminder open Plans (see notificationTapRouting).
    data: { screen: 'plans' },
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

// ─── Keeping the scheduled reminder in line with the preference ───────────────

/** Leaves the reminder cancelled and the recorders empty, whatever ran before. */
const startWithNoReminder = async () => {
  await notifications.cancelDailyReminder();
  cancellations.length = 0;
  schedules.length = 0;
};

const scheduledAt = () =>
  schedules.map((request) => {
    const trigger = request.trigger as { hour: number; minute: number };
    return [trigger.hour, trigger.minute, (request.content as { title: string }).title];
  });

test('an enabled reminder preference is scheduled at its saved time', async () => {
  await startWithNoReminder();

  await notifications.reconcileDailyReminder({ notificationsEnabled: true, reminderTime: '07:30' });

  assert.deepEqual(scheduledAt(), [[7, 30, 'settings.notificationTitle']]);
});

test('reconciling an unchanged reminder leaves the schedule alone', async () => {
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };

  await notifications.reconcileDailyReminder(preference);
  await notifications.reconcileDailyReminder(preference);

  assert.equal(schedules.length, 1);
});

test('a reminder set from Settings is not scheduled a second time by the reconcile after it', async () => {
  await startWithNoReminder();

  await notifications.scheduleDailyReminder(21, 15);
  await notifications.reconcileDailyReminder({ notificationsEnabled: true, reminderTime: '21:15' });

  assert.equal(schedules.length, 1);
});

test('changing the app language reschedules the reminder so its text is in the new language', async () => {
  // The notification's title and body are fixed when it is scheduled, so a
  // reminder set in English kept arriving in English after switching to Nepali.
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };
  await notifications.reconcileDailyReminder(preference);

  i18nState.language = 'ne:';
  await notifications.reconcileDailyReminder(preference);

  assert.deepEqual(scheduledAt(), [
    [7, 30, 'settings.notificationTitle'],
    [7, 30, 'ne:settings.notificationTitle'],
  ]);
});

test('moving to another timezone reschedules the reminder for the new local time', async (t) => {
  // Android arms the daily alarm at an absolute instant, so after travel the
  // next reminder would ring at the old zone's 07:30 until it is rescheduled.
  await startWithNoReminder();
  const originalTz = process.env.TZ;
  t.after(() => {
    process.env.TZ = originalTz;
  });
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };

  process.env.TZ = 'Asia/Tokyo';
  await notifications.reconcileDailyReminder(preference);
  process.env.TZ = 'Pacific/Honolulu';
  await notifications.reconcileDailyReminder(preference);

  assert.equal(schedules.length, 2);
});

test('a disabled preference cancels a reminder that is still scheduled', async () => {
  // Sign-out resets the preference to off, and another device can turn it off;
  // either way the one already on this device must stop ringing.
  await startWithNoReminder();
  await notifications.scheduleDailyReminder(7, 30);
  cancellations.length = 0;

  await notifications.reconcileDailyReminder({
    notificationsEnabled: false,
    reminderTime: '07:30',
  });

  assert.deepEqual(cancellations, ['daily-reading-reminder']);
});

test('an enabled preference with no usable time cancels rather than guessing a time', async () => {
  await startWithNoReminder();
  await notifications.scheduleDailyReminder(7, 30);
  schedules.length = 0;
  cancellations.length = 0;

  await notifications.reconcileDailyReminder({ notificationsEnabled: true, reminderTime: null });

  assert.deepEqual([schedules.length, cancellations], [0, ['daily-reading-reminder']]);
});

test('a reminder that is already off is not cancelled again on every reconcile', async () => {
  await startWithNoReminder();

  await notifications.reconcileDailyReminder({ notificationsEnabled: false, reminderTime: null });

  assert.deepEqual(cancellations, []);
});

test('a reminder that failed to schedule is tried again on the next reconcile', async () => {
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };
  scheduleFailure = new Error('alarm service unavailable');
  await assert.rejects(() => notifications.reconcileDailyReminder(preference));

  scheduleFailure = null;
  await notifications.reconcileDailyReminder(preference);

  assert.equal(schedules.length, 1);
});

test('a reminder synced on to a device that has not allowed notifications is not scheduled', async () => {
  // Another device turned the reminder on; this one was never asked for permission.
  // Scheduling here would look done while it can never appear, and prompting at
  // launch is not ours to do: Settings offers the prompt instead.
  for (const status of ['undetermined', 'denied']) {
    await startWithNoReminder();
    permission.current = status;
    permissionCalls.length = 0;

    await notifications.reconcileDailyReminder({
      notificationsEnabled: true,
      reminderTime: '07:30',
    });

    assert.deepEqual([status, schedules.length, permissionCalls], [status, 0, ['get']]);
  }
});

test('a synced reminder is scheduled on the first reconcile after permission is granted', async () => {
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };
  permission.current = 'undetermined';
  await notifications.reconcileDailyReminder(preference);

  permission.current = 'granted';
  await notifications.reconcileDailyReminder(preference);

  assert.deepEqual(scheduledAt(), [[7, 30, 'settings.notificationTitle']]);
});

test('scheduling a reminder records that one may be scheduled, before the native call', async () => {
  await startWithNoReminder();
  scheduleFailure = new Error('alarm service unavailable');

  await assert.rejects(() => notifications.scheduleDailyReminder(7, 30));

  // A schedule that may or may not have reached the OS still counts.
  assert.equal(mmkv.store.get(MAY_BE_SCHEDULED_KEY), '1');
});

test('only a cancel that succeeded clears the flag, so a failed one is retried next launch', async () => {
  await notifications.scheduleDailyReminder(7, 30);
  cancelFailure = new Error('notification service unavailable');
  await notifications.cancelDailyReminder();
  assert.equal(mmkv.store.get(MAY_BE_SCHEDULED_KEY), '1');

  cancelFailure = null;
  await notifications.cancelDailyReminder();
  assert.equal(mmkv.store.get(MAY_BE_SCHEDULED_KEY), '0');
});

test('with the flag clear, an off reminder of unknown state is not cancelled natively', async () => {
  // A failed schedule leaves this process not knowing what the OS holds.
  await startWithNoReminder();
  scheduleFailure = new Error('alarm service unavailable');
  await assert.rejects(() => notifications.scheduleDailyReminder(7, 30));
  scheduleFailure = null;
  cancellations.length = 0;
  const off = { notificationsEnabled: false, reminderTime: '07:30' };

  // Android reconciles with the reminder off for its channel name; the flag spares the cancel.
  mmkv.store.set(MAY_BE_SCHEDULED_KEY, '0');
  await notifications.reconcileDailyReminder(off);
  assert.deepEqual(cancellations, []);
});

test('with the flag set, an off reminder of unknown state is cancelled', async () => {
  await startWithNoReminder();
  scheduleFailure = new Error('alarm service unavailable');
  await assert.rejects(() => notifications.scheduleDailyReminder(7, 30));
  scheduleFailure = null;
  cancellations.length = 0;

  await notifications.reconcileDailyReminder({
    notificationsEnabled: false,
    reminderTime: '07:30',
  });

  assert.deepEqual(
    [cancellations, mmkv.store.get(MAY_BE_SCHEDULED_KEY)],
    [['daily-reading-reminder'], '0']
  );
});

// ─── Sign-out time limit and the pending deactivation ───────────────────────

const pendingDeactivation = (): unknown => {
  const raw = mmkv.store.get(PENDING_DEACTIVATION_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
};

const deviceUpdates = () =>
  fake.callsFor('user_devices').filter((call) => call.operation === 'update');

/** Settles until the fake has seen `count` device-row updates (the lazy steps before it are async). */
const untilDeviceUpdates = async (count: number) => {
  for (let i = 0; i < 50 && deviceUpdates().length < count; i += 1) await settle();
  assert.equal(deviceUpdates().length, count);
};

test('sign-out waits for the device row update only up to the time limit, then aborts it', async (t) => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  const never = deferred<SupabaseFakeResult>();
  updateResult = () => never.promise;
  t.mock.timers.enable({ apis: ['setTimeout'] });

  let signedOut = false;
  const deactivation = notifications.deactivatePushToken(uid).then(() => {
    signedOut = true;
  });
  await untilDeviceUpdates(1);
  t.mock.timers.tick(notifications.PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS - 1);
  await settle();
  assert.equal(signedOut, false, 'a prompt answer is still waited for');

  t.mock.timers.tick(1);
  await deactivation;

  const signal = deviceUpdates()[0]?.steps.find((step) => step.method === 'abortSignal')
    ?.args[0] as AbortSignal | undefined;
  assert.ok(signal, 'the update must be abortable');
  assert.equal(signal.aborted, true, 'a request answered late must not act after sign-out');
  assert.deepEqual(pendingDeactivation(), { token: 'expo-token', userId: uid });
  assert.equal(notifications.getCachedPushToken(), null);
});

test('the time limit is short enough that sign-out never feels stuck', () => {
  assert.ok(notifications.PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS <= 3_000);
  assert.ok(notifications.PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS >= 1_000);
});

test('a device row update not yet sent when time runs out is never sent, even under the next account', async (t) => {
  const uid = nextUser();
  const write = deferred<SupabaseFakeResult>();
  upsertResult = () => write.promise;
  const registration = notifications.registerPushToken(uid);
  await settle();
  assert.equal(upsertsFor(uid).length, 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const deactivation = notifications.deactivatePushToken(uid);
  t.mock.timers.tick(notifications.PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS);
  await deactivation;

  // The next account signs in before the old write finally answers.
  nextUser();
  write.resolve({ error: null });
  assert.equal(await registration, null);
  await settle();

  assert.deepEqual(deviceUpdates(), [], 'no late update may run with whatever session is current');
  assert.deepEqual(pendingDeactivation(), { token: 'expo-token', userId: uid });
});

test('offline, sign-out sends nothing and records the deactivation as pending', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  connectivity.isConnected = false;

  await notifications.deactivatePushToken(uid);

  assert.deepEqual(deviceUpdates(), [], 'an offline request would only start a token refresh');
  assert.deepEqual(pendingDeactivation(), { token: 'expo-token', userId: uid });
});

test('a device row update the backend refused is recorded as pending', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  updateResult = async () => ({ error: { message: 'JWT expired' } });

  await notifications.deactivatePushToken(uid);

  assert.deepEqual(pendingDeactivation(), { token: 'expo-token', userId: uid });
});

test('a confirmed sign-out deactivation leaves nothing pending', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);

  await notifications.deactivatePushToken(uid);

  assert.equal(pendingDeactivation(), undefined);
});

test('registering this device for the next account clears the pending deactivation without touching the old row', async () => {
  mmkv.store.set(
    PENDING_DEACTIVATION_KEY,
    JSON.stringify({ token: 'expo-token', userId: 'previous-account' })
  );
  const uid = nextUser();

  assert.equal(await notifications.registerPushToken(uid), 'expo-token');

  assert.equal(pendingDeactivation(), undefined);
  assert.deepEqual(deviceUpdates(), [], 'the new registration must never be deactivated');

  await notifications.deactivatePushToken(uid);
});

test('a registration the backend refused keeps the pending deactivation', async () => {
  const pending = { token: 'expo-token', userId: 'previous-account' };
  mmkv.store.set(PENDING_DEACTIVATION_KEY, JSON.stringify(pending));
  const uid = nextUser();
  upsertResult = async () => ({ error: { message: 'offline' } });

  assert.equal(await notifications.registerPushToken(uid), null);

  assert.deepEqual(pendingDeactivation(), pending);
});

test('discreet mode taking the same account and token off the push list clears its pending record', async () => {
  const uid = nextUser();
  mmkv.store.set(PENDING_DEACTIVATION_KEY, JSON.stringify({ token: 'expo-token', userId: uid }));
  privacyState.discreet = true;

  await notifications.suspendPushTokenForDiscreetMode(uid);

  assert.equal(pendingDeactivation(), undefined);
});

// ─── Discreet mode ───────────────────────────────────────────────────────────

const scheduledContent = () =>
  schedules.map((request) => {
    const content = request.content as { title: string; body: string };
    return [content.title, content.body];
  });

test('in discreet mode the reminder is scheduled with neutral text, never the app or Bible', async () => {
  await startWithNoReminder();
  privacyState.discreet = true;

  await notifications.scheduleDailyReminder(7, 30);

  assert.deepEqual(scheduledContent(), [
    ['privacy.discreetNotificationTitle', 'privacy.discreetNotificationBody'],
  ]);
});

test('turning discreet mode on reschedules a reminder that is already scheduled with neutral text', async () => {
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };
  await notifications.reconcileDailyReminder(preference);

  privacyState.discreet = true;
  await notifications.reconcileDailyReminder(preference);

  assert.deepEqual(scheduledContent(), [
    ['settings.notificationTitle', 'settings.notificationBody'],
    ['privacy.discreetNotificationTitle', 'privacy.discreetNotificationBody'],
  ]);
});

test('turning discreet mode off restores the normal reminder text', async () => {
  await startWithNoReminder();
  const preference = { notificationsEnabled: true, reminderTime: '07:30' };
  privacyState.discreet = true;
  await notifications.reconcileDailyReminder(preference);

  privacyState.discreet = false;
  await notifications.reconcileDailyReminder(preference);

  assert.deepEqual(scheduledContent().at(-1), [
    'settings.notificationTitle',
    'settings.notificationBody',
  ]);
});

test('in discreet mode the Android reminder channel, shown in system settings, gets a neutral name', async () => {
  rn.Platform.OS = 'android';
  privacyState.discreet = true;

  await notifications.setupAndroidChannels();

  assert.deepEqual(
    channels.map(({ id, options }) => [id, options.name]),
    [['daily-reminder', 'privacy.discreetNotificationChannel']]
  );
});

test('reconciling renames the Android channel when discreet mode changes, even with the reminder off', async () => {
  rn.Platform.OS = 'android';
  await startWithNoReminder();
  const off = { notificationsEnabled: false, reminderTime: null };
  privacyState.discreet = false;
  await notifications.reconcileDailyReminder(off);
  channels.length = 0;

  privacyState.discreet = true;
  await notifications.reconcileDailyReminder(off);

  assert.deepEqual(
    channels.map(({ options }) => options.name),
    ['privacy.discreetNotificationChannel']
  );
  assert.deepEqual(schedules, []);
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

test('permission granted after a refused registration registers once, and later tries reuse it', async () => {
  // The app re-tries on every foreground and after its own permission prompt, so a
  // device that is already registered must not write user_devices again.
  const userId = nextUser();
  permission.current = 'undetermined';
  assert.equal(await notifications.registerPushToken(userId), null);

  permission.current = 'granted';
  assert.equal(await notifications.registerPushToken(userId), 'expo-token');
  await notifications.registerPushToken(userId);
  await notifications.registerPushToken(userId);

  assert.deepEqual([upsertsFor(userId).length, tokenCalls.length], [1, 1]);
  await notifications.deactivatePushToken(userId);
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

// ─── Discreet mode ───────────────────────────────────────────────────────────

const deactivationsFor = (userId: string) =>
  fake
    .callsFor('user_devices')
    .filter(
      (call) =>
        call.operation === 'update' &&
        (call.payload as { is_active: boolean }).is_active === false &&
        call.steps.some((step) => step.method === 'eq' && step.args[1] === userId)
    )
    .map(
      (call) =>
        call.steps.find((step) => step.method === 'eq' && step.args[0] === 'push_token')?.args[1]
    );

test('in discreet mode the device registers no push token', async () => {
  const uid = nextUser();
  privacyState.discreet = true;

  assert.equal(await notifications.registerPushToken(uid, deviceToken('native-token')), null);

  assert.deepEqual(tokenCalls, []);
  assert.deepEqual(upsertsFor(uid), []);
});

test('turning discreet mode on takes the registered device off the push list', async () => {
  const uid = nextUser();
  await notifications.registerPushToken(uid);
  privacyState.discreet = true;

  await notifications.suspendPushTokenForDiscreetMode(uid);

  assert.deepEqual(deactivationsFor(uid), ['expo-token']);
  assert.equal(notifications.getCachedPushToken(), null);
});

test('a discreet launch deactivates the row an earlier session left, reading the token from the device', async () => {
  const uid = nextUser();
  privacyState.discreet = true;

  await notifications.suspendPushTokenForDiscreetMode(uid);

  assert.equal(tokenCalls.length, 1);
  assert.deepEqual(deactivationsFor(uid), ['expo-token']);
  assert.deepEqual(upsertsFor(uid), []);
});

test('a registration still in flight when discreet mode turns on never activates the device', async () => {
  const uid = nextUser();
  const native = deferred<{ data: string }>();
  getToken = () => native.promise;
  const registration = notifications.registerPushToken(uid);
  await settle();

  privacyState.discreet = true;
  native.resolve({ data: 'expo-token' });

  assert.equal(await registration, null);
  assert.deepEqual(upsertsFor(uid), []);
});

test('a device without notification permission is left alone in discreet mode', async () => {
  const uid = nextUser();
  permission.current = 'denied';
  privacyState.discreet = true;

  await notifications.suspendPushTokenForDiscreetMode(uid);

  assert.deepEqual(tokenCalls, []);
  assert.deepEqual(deactivationsFor(uid), []);
});

test('the device is taken off once per session, and leaving discreet mode registers it again', async () => {
  const uid = nextUser();
  privacyState.discreet = true;
  await notifications.suspendPushTokenForDiscreetMode(uid);
  await notifications.suspendPushTokenForDiscreetMode(uid);
  assert.equal(deactivationsFor(uid).length, 1);

  privacyState.discreet = false;
  assert.equal(await notifications.registerPushToken(uid), 'expo-token');
  assert.equal((upsertsFor(uid)[0]?.payload as { is_active: boolean }).is_active, true);

  // Going discreet again after that registration takes it off again.
  privacyState.discreet = true;
  await notifications.suspendPushTokenForDiscreetMode(uid);
  assert.equal(deactivationsFor(uid).length, 2);
});

test('a deactivation the backend refused is tried again next time', async () => {
  const uid = nextUser();
  privacyState.discreet = true;
  updateResult = async () => ({ error: { message: 'offline' } });
  await notifications.suspendPushTokenForDiscreetMode(uid);

  updateResult = async () => ({ error: null });
  await notifications.suspendPushTokenForDiscreetMode(uid);

  assert.equal(deactivationsFor(uid).length, 2);
});

test('setupNotificationHandler is re-exported so callers need one notifications entry point', () => {
  assert.equal(typeof notifications.setupNotificationHandler, 'function');
});
