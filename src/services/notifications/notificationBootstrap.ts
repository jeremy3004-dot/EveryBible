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

export interface NotificationHandlerOptions {
  /**
   * Discreet (calculator icon) mode. The banner names the app, and group pushes carry
   * server-written group text, so a notification arriving while the app is open is not
   * shown at all. Passed in rather than imported to keep the privacy store off this module.
   */
  isDiscreet?: () => boolean;
}

/**
 * Register the foreground notification handler before React renders.
 *
 * Keep this bootstrap module intentionally small so cold start does not
 * evaluate Supabase/i18n-backed notification services, or the rest of
 * expo-notifications, before the first screen.
 */
export function setupNotificationHandler({ isDiscreet }: NotificationHandlerOptions = {}): void {
  setNotificationHandler({
    handleNotification: async () => {
      const show = !isDiscreet?.();
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}
