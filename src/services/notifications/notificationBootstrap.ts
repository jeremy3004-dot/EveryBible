import * as Notifications from 'expo-notifications';

/**
 * Register the foreground notification handler before React renders.
 *
 * Keep this bootstrap module intentionally small so Android cold start does not
 * evaluate Supabase/i18n-backed notification services before the first screen.
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
