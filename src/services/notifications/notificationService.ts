import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DevicePushToken } from 'expo-notifications';
import Constants from 'expo-constants';
import i18n from '../../i18n';
import { supabase } from '../supabase';
export { setupNotificationHandler } from './notificationBootstrap';

/**
 * Module-level cache for the current push token.
 * Used by deactivatePushToken to identify which row to mark inactive on sign-out.
 */
let cachedPushToken: string | null = null;
let lastRegisteredUserId: string | null = null;
let lastRegisteredAuthGeneration: number | null = null;
let lastRegisteredDevicePushTokenKey: string | null = null;
let registrationSequence = 0;
let registrationInFlight: {
  sequence: number;
  userId: string;
  authGeneration: number;
  devicePushTokenKey: string | null;
  promise: Promise<string | null>;
} | null = null;
const invalidatedAuthGenerations = new Map<string, number>();
// Only database writes and their cleanup belong here, never native token acquisition.
// Serialize each user's writes so old cleanup cannot deactivate a newer registration.
const deviceWrites = new Map<string, Promise<unknown>>();
const EXPO_NOTIFICATIONS_BASE_URL = 'https://exp.host/--/api/v2/';

function getAuthIdentity(): { userId: string | null; generation: number } | null {
  try {
    const { useAuthStore } =
      require('../../stores/authStore') as typeof import('../../stores/authStore');
    const { user, authGeneration } = useAuthStore.getState();
    return { userId: user?.uid ?? null, generation: authGeneration };
  } catch {
    return null;
  }
}

async function markPushTokenInactive(userId: string, token: string): Promise<void> {
  try {
    await supabase
      .from('user_devices')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', token);
  } catch {
    // Best-effort: an unavailable backend must not prevent sign-out.
  }
}

async function disableExpoAutoServerRegistration(): Promise<void> {
  try {
    await Notifications.setAutoServerRegistrationEnabledAsync(false);
  } catch {
    // Best-effort only; continue with manual token sync.
  }
}

function getDevicePushTokenKey(devicePushToken?: DevicePushToken): string | null {
  if (!devicePushToken) {
    return null;
  }

  return `${devicePushToken.type}:${typeof devicePushToken.data === 'string' ? devicePushToken.data : JSON.stringify(devicePushToken.data)}`;
}

/**
 * Create Android notification channels required for scheduled notifications.
 * Channels are idempotent — safe to call on every app launch.
 * No-ops on iOS.
 */
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('daily-reminder', {
    name: i18n.t('notifications.channelDailyReminder'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('group-alerts', {
    name: i18n.t('notifications.channelGroupAlerts'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * Request notification permissions.
 * Returns true if permissions are already granted or the user grants them.
 * Returns false if the user denies or has previously denied permissions.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule a daily reading reminder at the given hour and minute.
 *
 * Uses the stable identifier 'daily-reading-reminder' so repeated calls
 * replace the existing schedule rather than accumulating duplicate notifications.
 */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  // Cancel the existing scheduled notification first (if any).
  // Use catch() so that a missing notification does not throw.
  await Notifications.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-reading-reminder',
    content: {
      title: i18n.t('settings.notificationTitle'),
      body: i18n.t('settings.notificationBody'),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: 'daily-reminder',
    },
  });
}

/**
 * Cancel the daily reading reminder.
 *
 * Cancels only the 'daily-reading-reminder' identifier — does NOT cancel all
 * scheduled notifications. This preserves any other app notifications (e.g.
 * group session alerts) that the user may have enabled.
 */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('daily-reading-reminder').catch(() => {});
}

/**
 * Obtain the Expo push token for the current device and upsert it into the
 * user_devices table so the server can send push notifications to this device.
 *
 * Best-effort: errors from getExpoPushTokenAsync (e.g. running on a simulator
 * without push entitlements) or from Supabase are swallowed so that sign-in
 * and app startup are never blocked by a push token failure.
 *
 * Returns the token string on success, or null if unavailable.
 */
export async function registerPushToken(
  userId: string,
  devicePushToken?: DevicePushToken
): Promise<string | null> {
  const auth = getAuthIdentity();
  if (auth?.userId !== userId || invalidatedAuthGenerations.get(userId) === auth.generation) {
    return null;
  }
  const authGeneration = auth.generation;
  const devicePushTokenKey = getDevicePushTokenKey(devicePushToken);
  const canReuseCachedRegistration =
    cachedPushToken &&
    lastRegisteredUserId === userId &&
    lastRegisteredAuthGeneration === authGeneration &&
    (!devicePushToken || lastRegisteredDevicePushTokenKey === devicePushTokenKey);

  if (canReuseCachedRegistration) {
    return cachedPushToken;
  }

  if (
    registrationInFlight?.userId === userId &&
    registrationInFlight.authGeneration === authGeneration &&
    registrationInFlight.devicePushTokenKey === devicePushTokenKey
  ) {
    return registrationInFlight.promise;
  }

  const sequence = ++registrationSequence;
  const isCurrentRegistration = () => {
    const currentAuth = getAuthIdentity();
    return (
      sequence === registrationSequence &&
      currentAuth?.userId === userId &&
      currentAuth.generation === authGeneration &&
      invalidatedAuthGenerations.get(userId) !== authGeneration
    );
  };
  const promise = Promise.resolve().then(async () => {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!projectId || !isCurrentRegistration()) return null;

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' || !isCurrentRegistration()) return null;

      // Keep Expo token registration explicit and app-driven.
      await disableExpoAutoServerRegistration();
      if (!isCurrentRegistration()) return null;

      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId,
        baseUrl: EXPO_NOTIFICATIONS_BASE_URL,
        devicePushToken,
      });
      if (!isCurrentRegistration()) return null;

      const previousWrite = deviceWrites.get(userId);
      if (previousWrite) await previousWrite;
      if (!isCurrentRegistration()) return null;

      const write = (async () => {
        try {
          const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
          const { error } = await supabase.from('user_devices').upsert(
            {
              user_id: userId,
              push_token: tokenResult.data,
              platform,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,push_token' }
          );
          if (error || !isCurrentRegistration()) return null;

          cachedPushToken = tokenResult.data;
          lastRegisteredUserId = userId;
          lastRegisteredAuthGeneration = authGeneration;
          lastRegisteredDevicePushTokenKey = devicePushTokenKey;
          return tokenResult.data;
        } catch {
          return null;
        } finally {
          // The upsert may already have reached the server when auth/token state changed.
          if (!isCurrentRegistration()) await markPushTokenInactive(userId, tokenResult.data);
        }
      })();
      deviceWrites.set(userId, write);
      try {
        return await write;
      } finally {
        if (deviceWrites.get(userId) === write) deviceWrites.delete(userId);
      }
    } catch {
      // Non-fatal: simulator, offline, or RLS error — do not crash sign-in or startup
      return null;
    } finally {
      if (registrationInFlight?.sequence === sequence) registrationInFlight = null;
    }
  });

  registrationInFlight = { sequence, userId, authGeneration, devicePushTokenKey, promise };
  return promise;
}

/**
 * Mark the cached push token as inactive in user_devices when the user signs out.
 *
 * Invalidate pending work immediately, then finish any started database write
 * and deactivate it while sign-out still retains the user's credentials.
 * Native token acquisition is never awaited. Backend cleanup is best-effort.
 */
export async function deactivatePushToken(userId: string): Promise<void> {
  const auth = getAuthIdentity();
  if (auth) invalidatedAuthGenerations.set(userId, auth.generation);
  if (registrationInFlight?.userId === userId) {
    registrationSequence++;
    registrationInFlight = null;
  }
  const token = lastRegisteredUserId === userId ? cachedPushToken : null;
  if (lastRegisteredUserId === userId) {
    cachedPushToken = null;
    lastRegisteredUserId = null;
    lastRegisteredAuthGeneration = null;
    lastRegisteredDevicePushTokenKey = null;
  }
  const previousWrite = deviceWrites.get(userId);
  const cleanup = (async () => {
    if (previousWrite) await previousWrite;
    if (token) await markPushTokenInactive(userId, token);
  })();
  deviceWrites.set(userId, cleanup);
  try {
    await cleanup;
  } finally {
    if (deviceWrites.get(userId) === cleanup) deviceWrites.delete(userId);
  }
}

/**
 * Return the currently cached push token, or null if not yet registered.
 * Used by the group service to include the sender's token in notifications
 * without needing to query the database.
 */
export function getCachedPushToken(): string | null {
  return cachedPushToken;
}
