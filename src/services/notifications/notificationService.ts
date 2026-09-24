import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DevicePushToken } from 'expo-notifications';
import Constants from 'expo-constants';
import i18n from '../../i18n';
import { parseReminderTime } from '../preferences/reminderPreferences';
import { supabase } from '../supabase';
import { isDeviceOffline } from '../../utils/connectivity';
import { DAILY_REMINDER_NOTIFICATION_DATA } from './notificationTapRouting';
import { notifyNotificationPermissionRequested } from './notificationPermissionEvents';
import {
  markDailyReminderCancelled,
  markDailyReminderMayBeScheduled,
  mayDailyReminderBeScheduled,
} from './dailyReminderScheduleMarker';
import {
  clearPendingPushTokenDeactivation,
  recordPendingPushTokenDeactivation,
} from './pendingPushTokenDeactivation';
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
/** The account and auth generation whose device row discreet mode already deactivated. */
let discreetSuspension: { userId: string; authGeneration: number } | null = null;
// Only database writes and their cleanup belong here, never native token acquisition.
// Serialize each user's writes so old cleanup cannot deactivate a newer registration.
const deviceWrites = new Map<string, Promise<unknown>>();
/**
 * Sign-out waits this long for the device row to be marked inactive, then goes ahead.
 * Offline with an expired login, auth-js retries the token refresh for about 25 s
 * before a request can even be sent, which used to hold sign-out for that long.
 */
export const PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS = 3_000;
/**
 * Per account, the signal of its latest sign-out cleanup. Once the time limit aborts it,
 * no device-row update for that account is sent any more, so a request cannot run later
 * with whatever session is current by then (RLS would also make it a no-op, since every
 * update is pinned to the old user_id). Dropped when that account starts a new write.
 */
const signOutCleanupSignals = new Map<string, AbortSignal>();
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

/**
 * Read lazily, like the auth identity above: the privacy store is already loaded by App.tsx,
 * and a static import would pull it into every notificationService test. Anything that
 * cannot be read counts as discreet, so a failure never shows Bible text.
 */
function isDiscreetMode(): boolean {
  try {
    const { isDiscreetModeActive } =
      require('../../stores/privacyStore') as typeof import('../../stores/privacyStore');
    return isDiscreetModeActive();
  } catch {
    return true;
  }
}

/** Resolves whether the backend confirmed the change; it never rejects. */
async function markPushTokenInactive(
  userId: string,
  token: string,
  signal?: AbortSignal
): Promise<boolean> {
  if (signal?.aborted) return false;
  try {
    const query = supabase
      .from('user_devices')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('push_token', token);
    const { error } = await (signal ? query.abortSignal(signal) : query);
    return !error;
  } catch {
    // Best-effort: an unavailable backend must not prevent sign-out.
    return false;
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

const DAILY_REMINDER_CHANNEL_ID = 'daily-reminder';

// One in-flight/completed channel setup per channel name. Startup fires this and
// the reminder scheduler awaits it, so without memoization the two racing callers
// would configure the channels twice — and a scheduled reminder could still name
// a channel Android has not been told about yet. Keyed by the localized name
// because startup usually runs before a non-English interface language has
// loaded; the next caller after it loads renames the channel.
let androidChannelSetup: { name: string; promise: Promise<void> } | null = null;

/**
 * Create Android notification channels required for scheduled notifications.
 * Memoized per launch and idempotent — safe to call on every app launch and
 * before every schedule. A failed attempt is not cached, so the next caller retries.
 * No-ops on iOS.
 */
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // The channel name is listed in Android's notification settings, so discreet mode
  // renames it rather than advertising a Bible reading reminder.
  const name = i18n.t(
    isDiscreetMode() ? 'privacy.discreetNotificationChannel' : 'notifications.channelDailyReminder'
  );
  if (!androidChannelSetup || androidChannelSetup.name !== name) {
    const setup = { name, promise: Promise.resolve() };
    setup.promise = Notifications.setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    }).then(
      () => undefined,
      (error: unknown) => {
        if (androidChannelSetup === setup) {
          androidChannelSetup = null;
        }
        throw error;
      }
    );
    androidChannelSetup = setup;
  }

  await androidChannelSetup.promise;
}

/**
 * Request notification permissions.
 * Returns true if permissions are already granted or the user grants them.
 * Returns false if the user denies or has previously denied permissions.
 */
export type NotificationPermissionOutcome = 'granted' | 'denied' | 'blocked';

/**
 * Asks for notification permission and says whether asking again could help.
 *
 * 'blocked' means the system will not show the prompt again (Android 13+ after repeated
 * denials, or an iOS denial), so only the device's settings can turn notifications on.
 */
export async function requestNotificationPermissionOutcome(): Promise<NotificationPermissionOutcome> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return 'granted';
  }

  let response: Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>;
  try {
    response = await Notifications.requestPermissionsAsync();
  } finally {
    // Whatever the answer, whoever shows or depends on the permission re-reads it.
    notifyNotificationPermissionRequested();
  }
  if (response.status === 'granted') {
    return 'granted';
  }
  return response.canAskAgain === false ? 'blocked' : 'denied';
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * The current notification permission, read without prompting. Settings uses it
 * to warn when the daily reminder is on in the app but blocked by the system.
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted' || status === 'denied') {
    return status;
  }
  return 'undetermined';
}

/**
 * Whether the system lets the daily reminder appear on this device:
 * - 'needs-permission': notifications have not been allowed, and asking would still
 *   show the system prompt (never asked, or an Android denial it will ask about again).
 *   A reminder synced on from another device lands here until the user is asked.
 * - 'blocked': notifications are denied for good, or (Android only) the user switched
 *   off the reminder's own channel while the app-level permission stays granted. Only
 *   system settings can change it.
 * - 'allowed': nothing in the system stands in the way.
 * A channel that cannot be read is not reported: a false alarm is worse than none.
 */
export type DailyReminderSystemState = 'allowed' | 'needs-permission' | 'blocked';

export async function getDailyReminderSystemState(): Promise<DailyReminderSystemState> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return status === 'undetermined' || canAskAgain === true ? 'needs-permission' : 'blocked';
  }
  if (Platform.OS !== 'android') {
    return 'allowed';
  }
  try {
    const channel = await Notifications.getNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID);
    return channel?.importance === Notifications.AndroidImportance.NONE ? 'blocked' : 'allowed';
  } catch {
    return 'allowed';
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  return (await requestNotificationPermissionOutcome()) === 'granted';
}

const DAILY_REMINDER_ID = 'daily-reading-reminder';

/**
 * What the scheduled reminder was last set to in this process: `null` when
 * unknown (a fresh launch — a reminder from an older build, or one left behind
 * by a signed-out account, may still be armed), `'off'` once it is cancelled,
 * otherwise a signature of everything that is fixed at scheduling time.
 */
let scheduledReminderSignature: string | null = null;

/**
 * The reminder's text. The lock screen shows it to anyone holding the phone, so in
 * discreet mode it is neutral copy that names neither the app nor the Bible.
 */
function getReminderContent(): { discreet: boolean; title: string; body: string } {
  const discreet = isDiscreetMode();
  return discreet
    ? {
        discreet,
        title: i18n.t('privacy.discreetNotificationTitle'),
        body: i18n.t('privacy.discreetNotificationBody'),
      }
    : {
        discreet,
        title: i18n.t('settings.notificationTitle'),
        body: i18n.t('settings.notificationBody'),
      };
}

/**
 * Everything a scheduled reminder bakes in: its time, its text (resolved in the
 * app language and privacy mode of the moment) and the zone offset Android turned
 * that local time into an absolute alarm with. When any of them changes it must be
 * rescheduled.
 */
function getReminderSignature(
  hour: number,
  minute: number,
  content: ReturnType<typeof getReminderContent>
): string {
  return JSON.stringify([
    hour,
    minute,
    content.discreet,
    content.title,
    content.body,
    new Date().getTimezoneOffset(),
  ]);
}

/**
 * Schedule a daily reading reminder at the given hour and minute.
 *
 * Uses the stable identifier 'daily-reading-reminder' so repeated calls
 * replace the existing schedule rather than accumulating duplicate notifications.
 */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  // The trigger below names the 'daily-reminder' channel. On Android a trigger
  // pointing at a channel that does not exist yet is dropped, and startup's
  // channel setup is fire-and-forget — so make sure it has finished first.
  if (Platform.OS === 'android') {
    await setupAndroidChannels();
  }

  // Cancel the existing scheduled notification first (if any).
  // Use catch() so that a missing notification does not throw.
  scheduledReminderSignature = null;
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});

  const content = getReminderContent();
  const signature = getReminderSignature(hour, minute, content);
  // Recorded before the native call: a schedule that fails partway may still be armed.
  markDailyReminderMayBeScheduled();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: content.title,
      body: content.body,
      sound: true,
      data: { ...DAILY_REMINDER_NOTIFICATION_DATA },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: DAILY_REMINDER_CHANNEL_ID,
    },
  });
  scheduledReminderSignature = signature;
}

/**
 * Cancel the daily reading reminder.
 *
 * Cancels only the 'daily-reading-reminder' identifier — does NOT cancel all
 * scheduled notifications. This preserves any other app notifications (e.g.
 * group session alerts) that the user may have enabled.
 */
export async function cancelDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
    // Only a cancel that worked lets a later launch skip this (see dailyReminderScheduleMarker).
    markDailyReminderCancelled();
  } catch {
    // Not an error for the caller; the flag stays set, so the next launch cancels again.
  }
  scheduledReminderSignature = 'off';
}

export interface DailyReminderPreference {
  notificationsEnabled: boolean;
  reminderTime: string | null;
}

/**
 * Brings the device's scheduled reminder in line with the saved preference.
 *
 * Settings schedules the reminder when the user picks a time, but the schedule
 * then drifts from the preference: its text stays in the language it was set in,
 * Android keeps the old zone's alarm after travel, a preference pulled from
 * another device (or reset by sign-out) never touches this device's schedule.
 * Reconciling on launch, on foreground and on each change closes all of those.
 * Only work that would change something reaches the native module.
 */
export async function reconcileDailyReminder({
  notificationsEnabled,
  reminderTime,
}: DailyReminderPreference): Promise<void> {
  // Keeps the channel's user-visible name in step with the language and discreet mode
  // even while no reminder is scheduled. Memoized, so an unchanged name costs nothing.
  if (Platform.OS === 'android') {
    await setupAndroidChannels();
  }

  const schedule = notificationsEnabled ? parseReminderTime(reminderTime) : null;

  if (!schedule) {
    // Unknown in this process (a fresh launch), but nothing was scheduled since the last
    // cancel that succeeded: there is nothing to cancel.
    if (scheduledReminderSignature === null && !mayDailyReminderBeScheduled()) {
      scheduledReminderSignature = 'off';
    }
    if (scheduledReminderSignature !== 'off') {
      await cancelDailyReminder();
    }
    return;
  }

  if (
    scheduledReminderSignature ===
    getReminderSignature(schedule.hour, schedule.minute, getReminderContent())
  ) {
    return;
  }

  // A reminder turned on on another device arrives here by sync, on a device that may
  // never have been asked for notification permission. Scheduling it then would look
  // done while it can never appear, and a system prompt nobody asked for is not ours
  // to show at launch: Settings flags it and asks with one tap. Nothing is recorded as
  // scheduled, so the reconcile after permission is granted (foreground, or Settings)
  // schedules it.
  if ((await getNotificationPermissionStatus()) !== 'granted') {
    return;
  }

  await scheduleDailyReminder(schedule.hour, schedule.minute);
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
  if (
    auth?.userId !== userId ||
    invalidatedAuthGenerations.get(userId) === auth.generation ||
    isDiscreetMode()
  ) {
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
      invalidatedAuthGenerations.get(userId) !== authGeneration &&
      !isDiscreetMode()
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
      // A new session for this account: its writes are no longer bound by an old sign-out.
      signOutCleanupSignals.delete(userId);

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
          discreetSuspension = null;
          lastRegisteredUserId = userId;
          lastRegisteredAuthGeneration = authGeneration;
          lastRegisteredDevicePushTokenKey = devicePushTokenKey;
          // This device's token now belongs to this account (see pendingPushTokenDeactivation.ts).
          clearPendingPushTokenDeactivation();
          return tokenResult.data;
        } catch {
          return null;
        } finally {
          // The upsert may already have reached the server when auth/token state changed.
          if (
            !isCurrentRegistration() &&
            !(await markPushTokenInactive(
              userId,
              tokenResult.data,
              signOutCleanupSignals.get(userId)
            ))
          ) {
            recordPendingPushTokenDeactivation({ token: tokenResult.data, userId });
          }
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
 * Native token acquisition is never awaited. Backend cleanup is best-effort and
 * waited for at most PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS; anything it could not confirm is
 * recorded as a pending deactivation (see pendingPushTokenDeactivation.ts).
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
  const controller = new AbortController();
  signOutCleanupSignals.set(userId, controller.signal);
  const previousWrite = deviceWrites.get(userId);
  const cleanup = (async (): Promise<boolean> => {
    if (previousWrite) await previousWrite;
    if (!token) return true;
    // Offline, the request would first start an auth-js refresh of an expired token that
    // keeps retrying after sign-out (and could save the old session again if the
    // connection came back); it could not be confirmed anyway.
    if (await isDeviceOffline()) return false;
    return markPushTokenInactive(userId, token, controller.signal);
  })();
  // Later writes for this account still queue behind the whole cleanup, not the time limit.
  deviceWrites.set(userId, cleanup);
  void cleanup.finally(() => {
    if (deviceWrites.get(userId) === cleanup) deviceWrites.delete(userId);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), PUSH_TOKEN_SIGN_OUT_TIMEOUT_MS);
  });
  const outcome = await Promise.race([cleanup, timeLimit]);
  clearTimeout(timer);
  if (outcome === 'timed-out') controller.abort();

  if (!token) return;
  if (outcome === true) {
    clearPendingPushTokenDeactivation({ token, userId });
  } else {
    recordPendingPushTokenDeactivation({ token, userId });
  }
}

/**
 * Discreet mode takes this device off the push list. Pushes are written by the server,
 * which does not know the device is disguised, and the OS shows them on the lock screen
 * under the app's real name (a group push also names the group); the foreground handler
 * only hides them while the app is open. So the device row is marked inactive, whether
 * this launch registered it or an earlier one did (then the token is read from the
 * device), and registerPushToken refuses until discreet mode is off again.
 *
 * Done once per account and auth generation; a refused update is tried again next time.
 */
export async function suspendPushTokenForDiscreetMode(userId: string): Promise<void> {
  const auth = getAuthIdentity();
  if (auth?.userId !== userId) {
    return;
  }
  if (
    discreetSuspension?.userId === userId &&
    discreetSuspension.authGeneration === auth.generation
  ) {
    return;
  }
  // A registration still in flight must not activate the row after this.
  if (registrationInFlight?.userId === userId) {
    registrationSequence++;
    registrationInFlight = null;
  }
  let token = lastRegisteredUserId === userId ? cachedPushToken : null;
  if (lastRegisteredUserId === userId) {
    cachedPushToken = null;
    lastRegisteredUserId = null;
    lastRegisteredAuthGeneration = null;
    lastRegisteredDevicePushTokenKey = null;
  }

  const previousWrite = deviceWrites.get(userId);
  const cleanup = (async () => {
    if (previousWrite) await previousWrite;
    token ??= await readThisDevicePushToken();
    // Without permission (or a token) the OS shows no push from this device anyway.
    if (token && (await markPushTokenInactive(userId, token))) {
      discreetSuspension = { userId, authGeneration: auth.generation };
      clearPendingPushTokenDeactivation({ token, userId });
    }
  })();
  deviceWrites.set(userId, cleanup);
  try {
    await cleanup;
  } finally {
    if (deviceWrites.get(userId) === cleanup) deviceWrites.delete(userId);
  }
}

/** This device's Expo push token when notifications are allowed; null otherwise. */
async function readThisDevicePushToken(): Promise<string | null> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    await disableExpoAutoServerRegistration();
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId,
      baseUrl: EXPO_NOTIFICATIONS_BASE_URL,
    });
    return data;
  } catch {
    return null;
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
