// Deep imports, not the 'expo-notifications' root. The root index re-exports the
// whole API and imports DevicePushTokenAutoRegistration.fx for its side effect,
// which pulls @ide/backoff and the Node `assert`/`util` polyfills in with it:
// about 125 modules (~0.34 MB unminified) evaluated before the first frame.
// These files are the same modules the root re-exports, so the handler and
// listeners registered here are the ones notificationService sees later.
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';

export {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
export { addPushTokenListener } from 'expo-notifications/build/TokenEmitter';

/**
 * Register the foreground notification handler before React renders.
 *
 * Keep this bootstrap module intentionally small so cold start does not
 * evaluate Supabase/i18n-backed notification services, or the rest of
 * expo-notifications, before the first screen.
 */
export function setupNotificationHandler(): void {
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
