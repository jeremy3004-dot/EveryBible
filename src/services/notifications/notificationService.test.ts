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
const updateCalls: Array<{
  table: string;
  data: Record<string, unknown>;
  filters: Record<string, string>;
}> = [];
let mockTokenResult: { data: string } | null = { data: 'ExponentPushToken[test-token-123]' };
let mockPermissionStatus = 'granted';
let mockUpsertError: { message: string } | null = null;

const NotificationsWithToken = {
  ...Notifications,
  getPermissionsAsync: async () => {
    permCalls.push('get');
    return { status: mockPermissionStatus };
  },
  getExpoPushTokenAsync: async (_opts: { projectId: string }) => {
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

async function registerPushToken(
  userId: string,
  notifs: typeof NotificationsWithToken,
  supabaseClient: typeof mockSupabaseClient,
  constants: typeof mockConstants,
  platformMock: { OS: string }
): Promise<string | null> {
  try {
    const projectId = constants.expoConfig?.extra?.eas?.projectId as string;
    if (!projectId) return null;

    const { status } = await notifs.getPermissionsAsync();
    if (status !== 'granted') return null;

    const tokenResult = await notifs.getExpoPushTokenAsync({ projectId });
    cachedToken = tokenResult.data;

    const platform: 'ios' | 'android' = platformMock.OS === 'ios' ? 'ios' : 'android';
    await supabaseClient.from('user_devices').upsert(
      {
        user_id: userId,
        push_token: tokenResult.data,
        platform,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' }
    );

    return tokenResult.data;
  } catch {
    return null;
  }
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
  } catch {
    // Non-fatal
  }
}

test('registerPushToken calls getExpoPushTokenAsync with projectId and upserts to user_devices', async () => {
  upsertCalls.length = 0;
  cachedToken = null;
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
  cachedToken = null;
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
  cachedToken = null;
  mockTokenResult = { data: 'ExponentPushToken[test-token-456]' };
  mockPermissionStatus = 'granted';
  mockUpsertError = { message: 'RLS violation' };

  let threw = false;
  try {
    await registerPushToken(
      'user-abc-123',
      NotificationsWithToken,
      mockSupabaseClient,
      mockConstants,
      mockPlatformIos
    );
  } catch {
    threw = true;
  }

  // Even with upsert error, function should not throw (returns token since error is post-upsert)
  assert.equal(threw, false, 'should NOT throw when upsert fails');
  assert.equal(upsertCalls.length, 1, 'should have attempted the upsert');
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
