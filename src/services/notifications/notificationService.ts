import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import i18n from '../../i18n';
import { supabase } from '../supabase';

/**
 * Module-level cache for the current push token.
 * Used by deactivatePushToken to identify which row to mark inactive on sign-out.
 */
let cachedPushToken: string | null = null;

/**
 * Register the foreground notification handler so banners are shown instead
 * of being silently dropped while the app is in the foreground.
 *
 * Must be called at module scope (before any component renders) in App.tsx.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
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
export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    cachedPushToken = tokenResult.data;

    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    await supabase.from('user_devices').upsert(
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
    // Non-fatal: simulator, offline, or RLS error — do not crash sign-in or startup
    return null;
  }
}

/**
 * Mark the cached push token as inactive in user_devices when the user signs out.
 *
 * Best-effort: if the token is not cached (e.g. never successfully registered)
 * or if Supabase is unavailable, the call is a no-op.
 */
export async function deactivatePushToken(userId: string): Promise<void> {
  try {
    if (!cachedPushToken) return;
    await supabase
      .from('user_devices')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', cachedPushToken);
    cachedPushToken = null;
  } catch {
    // Non-fatal
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
