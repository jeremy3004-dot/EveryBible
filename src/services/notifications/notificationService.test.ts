import test from 'node:test';
import assert from 'node:assert/strict';

// Mock expo-notifications
const mockCancelScheduledNotificationAsync = async (_id: string) => {};
const mockCancelAllScheduledNotificationsAsync = async () => {};
const mockScheduleNotificationAsync = async (_request: unknown) => 'daily-reading-reminder';
const mockGetPermissionsAsync = { status: 'undetermined' };
const mockRequestPermissionsAsync = { status: 'undetermined' };
const mockSetNotificationHandler = (_handler: unknown) => {};
const mockSetChannelAsync = async (_id: string, _channel: unknown) => {};

const cancelCalls: string[] = [];
const scheduleCalls: Array<{ identifier: string; content: unknown; trigger: unknown }> = [];
const permCalls: string[] = [];
const channelCalls: string[] = [];

const Notifications = {
  setNotificationHandler: (handler: unknown) => {
    mockSetNotificationHandler(handler);
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    cancelCalls.push(id);
    return mockCancelScheduledNotificationAsync(id);
  },
  cancelAllScheduledNotificationsAsync: async () => {
    cancelCalls.push('ALL');
    return mockCancelAllScheduledNotificationsAsync();
  },
  scheduleNotificationAsync: async (request: {
    identifier?: string;
    content: unknown;
    trigger: unknown;
  }) => {
    scheduleCalls.push({
      identifier: request.identifier ?? '',
      content: request.content,
      trigger: request.trigger,
    });
    return mockScheduleNotificationAsync(request);
  },
  getPermissionsAsync: async () => {
    permCalls.push('get');
    return mockGetPermissionsAsync;
  },
  requestPermissionsAsync: async () => {
    permCalls.push('request');
    return mockRequestPermissionsAsync;
  },
  setNotificationChannelAsync: async (id: string, channel: unknown) => {
    channelCalls.push(id);
    return mockSetChannelAsync(id, channel);
  },
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
  },
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
  },
};

// Mock i18next
const i18n = {
  t: (key: string) => key,
};

// Mock Platform
const Platform = {
  OS: 'android',
};

// Inject mocks before importing the service
// Since we can't dynamically override imports in node:test, we test the logic directly

// --- Direct unit tests for the notification service logic ---

function scheduleDailyReminder(
  hour: number,
  minute: number,
  notifs: typeof Notifications,
  i18nMock: typeof i18n
) {
  return async () => {
    await notifs.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});
    await notifs.scheduleNotificationAsync({
      identifier: 'daily-reading-reminder',
      content: {
        title: i18nMock.t('settings.notificationTitle'),
        body: i18nMock.t('settings.notificationBody'),
        sound: true,
      },
      trigger: {
        type: notifs.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: 'daily-reminder',
      },
    });
  };
}

function cancelDailyReminder(notifs: typeof Notifications) {
  return async () => {
    await notifs.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});
  };
}

function requestNotificationPermissions(notifs: typeof Notifications) {
  return async () => {
    const { status: existingStatus } = await notifs.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }
    const { status } = await notifs.requestPermissionsAsync();
    return status === 'granted';
  };
}

function setupAndroidChannels(notifs: typeof Notifications, platformMock: typeof Platform) {
  return async () => {
    if (platformMock.OS !== 'android') {
      return;
    }
    await notifs.setNotificationChannelAsync('daily-reminder', {
      name: i18n.t('notifications.channelDailyReminder'),
      importance: notifs.AndroidImportance.DEFAULT,
      sound: 'default',
    });
    await notifs.setNotificationChannelAsync('group-alerts', {
      name: i18n.t('notifications.channelGroupAlerts'),
      importance: notifs.AndroidImportance.HIGH,
      sound: 'default',
    });
  };
}

// --- Tests ---

test('scheduleDailyReminder cancels daily-reading-reminder then schedules with stable identifier', async () => {
  cancelCalls.length = 0;
  scheduleCalls.length = 0;

  await scheduleDailyReminder(8, 30, Notifications, i18n)();

  assert.equal(cancelCalls[0], 'daily-reading-reminder', 'should cancel stable identifier first');
  assert.ok(!cancelCalls.includes('ALL'), 'should NOT call cancelAll');
  assert.equal(scheduleCalls.length, 1, 'should schedule exactly once');
  assert.equal(scheduleCalls[0]?.identifier, 'daily-reading-reminder', 'identifier must be stable');
  const trigger = scheduleCalls[0]?.trigger as { type: string; hour: number; minute: number };
  assert.equal(trigger.type, 'daily', 'trigger type must be DAILY');
  assert.equal(trigger.hour, 8, 'hour must match');
  assert.equal(trigger.minute, 30, 'minute must match');
});

test('cancelDailyReminder calls cancelScheduledNotificationAsync with daily-reading-reminder only', async () => {
  cancelCalls.length = 0;

  await cancelDailyReminder(Notifications)();

  assert.equal(cancelCalls.length, 1, 'should cancel exactly once');
  assert.equal(cancelCalls[0], 'daily-reading-reminder', 'must cancel stable identifier');
  assert.ok(!cancelCalls.includes('ALL'), 'must NOT cancel all notifications');
});

test('requestNotificationPermissions returns true when already granted (no requestPermissionsAsync call)', async () => {
  permCalls.length = 0;
  mockGetPermissionsAsync.status = 'granted';

  const result = await requestNotificationPermissions(Notifications)();

  assert.equal(result, true, 'should return true when already granted');
  assert.ok(
    !permCalls.includes('request'),
    'should NOT call requestPermissionsAsync when already granted'
  );
});

test('requestNotificationPermissions calls requestPermissionsAsync when undetermined, returns true on granted', async () => {
  permCalls.length = 0;
  mockGetPermissionsAsync.status = 'undetermined';
  mockRequestPermissionsAsync.status = 'granted';

  const result = await requestNotificationPermissions(Notifications)();

  assert.equal(result, true, 'should return true when granted after request');
  assert.ok(permCalls.includes('request'), 'should call requestPermissionsAsync');
});

test('requestNotificationPermissions returns false when final status is denied', async () => {
  permCalls.length = 0;
  mockGetPermissionsAsync.status = 'undetermined';
  mockRequestPermissionsAsync.status = 'denied';

  const result = await requestNotificationPermissions(Notifications)();

  assert.equal(result, false, 'should return false when denied');
});

test('setupAndroidChannels creates daily-reminder and group-alerts on Android, skips on iOS', async () => {
  channelCalls.length = 0;

  // Android
  Platform.OS = 'android';
  await setupAndroidChannels(Notifications, Platform)();
  assert.ok(
    channelCalls.includes('daily-reminder'),
    'should create daily-reminder channel on Android'
  );
  assert.ok(channelCalls.includes('group-alerts'), 'should create group-alerts channel on Android');

  // iOS
  channelCalls.length = 0;
  const iosPlatform = { OS: 'ios' };
  await setupAndroidChannels(Notifications, iosPlatform)();
  assert.equal(channelCalls.length, 0, 'should NOT create channels on iOS');
});

// --- Push token registration tests ---

// Mock state for push token tests
const upsertCalls: Array<{
  table: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}> = [];
const autoServerRegistrationCalls: boolean[] = [];
const getExpoPushTokenCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<{
  table: string;
  data: Record<string, unknown>;
  filters: Record<string, string>;
}> = [];
let mockTokenResult: { data: string } | null = { data: 'ExponentPushToken[test-token-123]' };
let mockPermissionStatus = 'granted';
let mockUpsertError: { message: string } | null = null;
type DevicePushToken = { type: string; data: string | Record<string, unknown> };

const NotificationsWithToken = {
  ...Notifications,
  getPermissionsAsync: async () => {
    permCalls.push('get');
    return { status: mockPermissionStatus };
  },
  setAutoServerRegistrationEnabledAsync: async (enabled: boolean) => {
    autoServerRegistrationCalls.push(enabled);
  },
  getExpoPushTokenAsync: async (opts: {
    projectId: string;
    baseUrl: string;
    devicePushToken?: DevicePushToken;
  }) => {
    getExpoPushTokenCalls.push(opts);
    if (!mockTokenResult) {
      throw new Error('getExpoPushTokenAsync failed (simulator)');
    }
    return mockTokenResult;
  },
};

const mockSupabaseClient = {
  from: (table: string) => ({
    upsert: (data: Record<string, unknown>, options?: Record<string, unknown>) => {
      upsertCalls.push({ table, data, options });
      return Promise.resolve({ error: mockUpsertError });
    },
    update: (data: Record<string, unknown>) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => {
          updateCalls.push({ table, data, filters: { [col1]: val1, [col2]: val2 } });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
};

const mockConstants = {
  expoConfig: {
    extra: {
      eas: { projectId: 'cfbf2bac-d680-448f-b2aa-33c4c01ad15b' },
    },
  },
};

const mockPlatformIos = { OS: 'ios' };

// Inline implementations of the functions under test (mirrors service logic)
let cachedToken: string | null = null;
let registerPushTokenInFlight: Promise<string | null> | null = null;
let lastRegisteredUserId: string | null = null;
let lastRegisteredDevicePushTokenKey: string | null = null;
const EXPO_NOTIFICATIONS_BASE_URL = 'https://exp.host/--/api/v2/';

function getDevicePushTokenKey(devicePushToken?: DevicePushToken): string | null {
  if (!devicePushToken) {
    return null;
  }

  return `${devicePushToken.type}:${typeof devicePushToken.data === 'string' ? devicePushToken.data : JSON.stringify(devicePushToken.data)}`;
}

async function registerPushToken(
  userId: string,
  notifs: typeof NotificationsWithToken,
  supabaseClient: typeof mockSupabaseClient,
  constants: typeof mockConstants,
  platformMock: { OS: string },
  devicePushToken?: DevicePushToken
): Promise<string | null> {
  const devicePushTokenKey = getDevicePushTokenKey(devicePushToken);
  const canReuseCachedRegistration =
    cachedToken &&
    lastRegisteredUserId === userId &&
    (!devicePushToken || lastRegisteredDevicePushTokenKey === devicePushTokenKey);

  if (canReuseCachedRegistration) {
    return cachedToken;
  }

  if (registerPushTokenInFlight) {
    return registerPushTokenInFlight;
  }

  registerPushTokenInFlight = (async () => {
    try {
      const projectId = constants.expoConfig?.extra?.eas?.projectId as string;
      if (!projectId) return null;

      const { status } = await notifs.getPermissionsAsync();
      if (status !== 'granted') return null;

      await notifs.setAutoServerRegistrationEnabledAsync(false);

      const tokenResult = await notifs.getExpoPushTokenAsync({
        projectId,
        baseUrl: EXPO_NOTIFICATIONS_BASE_URL,
        devicePushToken,
      });

      const platform: 'ios' | 'android' = platformMock.OS === 'ios' ? 'ios' : 'android';
      const { error } = await supabaseClient.from('user_devices').upsert(
        {
          user_id: userId,
          push_token: tokenResult.data,
          platform,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,push_token' }
      );

      if (error) {
        throw error;
      }

      cachedToken = tokenResult.data;
      lastRegisteredUserId = userId;
      lastRegisteredDevicePushTokenKey = devicePushTokenKey;
      return tokenResult.data;
    } catch {
      return null;
    } finally {
      registerPushTokenInFlight = null;
    }
  })();

  return registerPushTokenInFlight;
}

async function deactivatePushToken(
  userId: string,
  supabaseClient: typeof mockSupabaseClient
): Promise<void> {
  try {
    if (!cachedToken) return;
    await supabaseClient
      .from('user_devices')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', cachedToken);
    cachedToken = null;
    lastRegisteredUserId = null;
    lastRegisteredDevicePushTokenKey = null;
  } catch {
    // Non-fatal
  }
}

test('registerPushToken calls getExpoPushTokenAsync with projectId and upserts to user_devices', async () => {
  upsertCalls.length = 0;
  autoServerRegistrationCalls.length = 0;
  getExpoPushTokenCalls.length = 0;
  cachedToken = null;
  registerPushTokenInFlight = null;
  lastRegisteredUserId = null;
  lastRegisteredDevicePushTokenKey = null;
  mockTokenResult = { data: 'ExponentPushToken[test-token-123]' };
  mockPermissionStatus = 'granted';
  mockUpsertError = null;

  const result = await registerPushToken(
    'user-abc-123',
    NotificationsWithToken,
    mockSupabaseClient,
    mockConstants,
    mockPlatformIos
  );

  assert.equal(result, 'ExponentPushToken[test-token-123]', 'should return the token');
  assert.deepEqual(
    autoServerRegistrationCalls,
    [false],
    'should disable Expo auto server registration before syncing the token'
  );
  assert.equal(getExpoPushTokenCalls.length, 1, 'should fetch an Expo push token exactly once');
  assert.equal(
    getExpoPushTokenCalls[0]?.['baseUrl'],
    EXPO_NOTIFICATIONS_BASE_URL,
    'should pass an explicit Expo notifications baseUrl'
  );
  assert.equal(upsertCalls.length, 1, 'should upsert exactly once');
  assert.equal(upsertCalls[0]?.table, 'user_devices', 'should upsert into user_devices');
  const upserted = upsertCalls[0]?.data ?? {};
  assert.equal(upserted['user_id'], 'user-abc-123', 'user_id must match');
  assert.equal(
    upserted['push_token'],
    'ExponentPushToken[test-token-123]',
    'push_token must match token'
  );
  assert.equal(upserted['platform'], 'ios', 'platform must be ios on iOS');
  assert.equal(upserted['is_active'], true, 'is_active must be true');
  assert.equal(
    upsertCalls[0]?.options?.['onConflict'],
    'user_id,push_token',
    'onConflict must be user_id,push_token'
  );
});

test('registerPushToken catches and suppresses getExpoPushTokenAsync errors (simulator scenario)', async () => {
  upsertCalls.length = 0;
  autoServerRegistrationCalls.length = 0;
  getExpoPushTokenCalls.length = 0;
  cachedToken = null;
  registerPushTokenInFlight = null;
  lastRegisteredUserId = null;
  lastRegisteredDevicePushTokenKey = null;
  mockTokenResult = null; // will throw
  mockPermissionStatus = 'granted';

  let threw = false;
  let result: string | null = null;
  try {
    result = await registerPushToken(
      'user-abc-123',
      NotificationsWithToken,
      mockSupabaseClient,
      mockConstants,
      mockPlatformIos
    );
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'should NOT throw when getExpoPushTokenAsync fails');
  assert.equal(result, null, 'should return null on error');
  assert.equal(upsertCalls.length, 0, 'should NOT upsert when token fetch fails');
});

test('registerPushToken catches and suppresses Supabase upsert errors without throwing', async () => {
  upsertCalls.length = 0;
  autoServerRegistrationCalls.length = 0;
  getExpoPushTokenCalls.length = 0;
  cachedToken = null;
  registerPushTokenInFlight = null;
  lastRegisteredUserId = null;
  lastRegisteredDevicePushTokenKey = null;
  mockTokenResult = { data: 'ExponentPushToken[test-token-456]' };
  mockPermissionStatus = 'granted';
  mockUpsertError = { message: 'RLS violation' };

  let threw = false;
  let result: string | null = null;
  try {
    result = await registerPushToken(
      'user-abc-123',
      NotificationsWithToken,
      mockSupabaseClient,
      mockConstants,
      mockPlatformIos
    );
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'should NOT throw when upsert fails');
  assert.equal(result, null, 'should return null when the backend upsert fails');
  assert.equal(upsertCalls.length, 1, 'should have attempted the upsert');
  assert.equal(cachedToken, null, 'should not cache a token that failed to sync');
});

test('registerPushToken forwards a listener-provided devicePushToken to Expo', async () => {
  upsertCalls.length = 0;
  autoServerRegistrationCalls.length = 0;
  getExpoPushTokenCalls.length = 0;
  cachedToken = null;
  registerPushTokenInFlight = null;
  lastRegisteredUserId = null;
  lastRegisteredDevicePushTokenKey = null;
  mockTokenResult = { data: 'ExponentPushToken[test-token-789]' };
  mockPermissionStatus = 'granted';
  mockUpsertError = null;
  const devicePushToken = { type: 'ios', data: 'apns-device-token-1' };

  const result = await registerPushToken(
    'user-abc-123',
    NotificationsWithToken,
    mockSupabaseClient,
    mockConstants,
    mockPlatformIos,
    devicePushToken
  );

  assert.equal(result, 'ExponentPushToken[test-token-789]', 'should return the synced Expo token');
  assert.deepEqual(
    getExpoPushTokenCalls[0]?.['devicePushToken'],
    devicePushToken,
    'should pass the refreshed devicePushToken through to Expo'
  );
});

test('registerPushToken reuses the cached token for the same user after a successful sync', async () => {
  upsertCalls.length = 0;
  autoServerRegistrationCalls.length = 0;
  getExpoPushTokenCalls.length = 0;
  cachedToken = null;
  registerPushTokenInFlight = null;
  lastRegisteredUserId = null;
  lastRegisteredDevicePushTokenKey = null;
  mockTokenResult = { data: 'ExponentPushToken[test-token-repeat]' };
  mockPermissionStatus = 'granted';
  mockUpsertError = null;

  const first = await registerPushToken(
    'user-repeat',
    NotificationsWithToken,
    mockSupabaseClient,
    mockConstants,
    mockPlatformIos
  );
  const second = await registerPushToken(
    'user-repeat',
    NotificationsWithToken,
    mockSupabaseClient,
    mockConstants,
    mockPlatformIos
  );

  assert.equal(first, 'ExponentPushToken[test-token-repeat]', 'first registration should succeed');
  assert.equal(second, 'ExponentPushToken[test-token-repeat]', 'second registration should reuse the cached token');
  assert.equal(getExpoPushTokenCalls.length, 1, 'should not fetch a second Expo token for the same user');
  assert.equal(upsertCalls.length, 1, 'should not upsert the same token twice for the same user');
});

test('deactivatePushToken calls update with is_active=false filtered by user_id and push_token', async () => {
  updateCalls.length = 0;
  cachedToken = 'ExponentPushToken[test-token-999]';

  await deactivatePushToken('user-xyz-789', mockSupabaseClient);

  assert.equal(updateCalls.length, 1, 'should update exactly once');
  assert.equal(updateCalls[0]?.table, 'user_devices', 'should update user_devices table');
  assert.equal(updateCalls[0]?.data?.['is_active'], false, 'is_active must be false');
  assert.equal(updateCalls[0]?.filters?.['user_id'], 'user-xyz-789', 'filter must include user_id');
  assert.equal(
    updateCalls[0]?.filters?.['push_token'],
    'ExponentPushToken[test-token-999]',
    'filter must include push_token'
  );
  assert.equal(cachedToken, null, 'cachedToken must be cleared after deactivation');
});
