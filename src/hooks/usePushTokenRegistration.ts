import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { addPushTokenListener } from '../services/notifications/notificationBootstrap';
import { addNotificationPermissionRequestListener } from '../services/notifications/notificationPermissionEvents';
import { useAuthStore } from '../stores/authStore';
import { usePrivacyStore } from '../stores/privacyStore';

/**
 * Registers this device's push token for the signed-in account, and re-registers when
 * the OS rotates the token or notification permission may have been granted since. The
 * notification service is imported lazily so it stays off the startup path. Auth can change while that import resolves, so each registration
 * checks it is still for the same account and auth generation, and unmounting cancels
 * anything still pending. A session restored offline with an expired token registers
 * only once auth-js has refreshed it.
 */
export function usePushTokenRegistration(isAuthenticated: boolean, userId: string | undefined) {
  const awaitingTokenRefresh = useAuthStore((state) => state.awaitingTokenRefresh);
  // Null until privacy settings load. A discreet device takes itself off the push list
  // instead (see suspendPushTokenForDiscreetMode): the OS would show a push on the lock
  // screen under the app's real name.
  const privacyMode = usePrivacyStore((state) => (state.isInitialized ? state.mode : null));

  // Re-runs whenever the user changes, or their session's token is refreshed. Registration
  // needs notification permission, which can be granted after launch: by the app's own
  // prompt (announced in-app, since Android's prompt does not reliably background the
  // app) or in system settings (seen on the return to the foreground). Both try again.
  // The service reuses a registration it already made for this account and device
  // without native or server work, so repeated tries do not write user_devices again.
  useEffect(() => {
    if (!isAuthenticated || !userId || awaitingTokenRefresh || privacyMode === null) {
      return;
    }
    let isCurrentEffect = true;

    const register = () => {
      const authGeneration = useAuthStore.getState().authGeneration;
      void import('../services/notifications').then(
        ({ registerPushToken, suspendPushTokenForDiscreetMode }): Promise<unknown> | undefined => {
          const currentAuth = useAuthStore.getState();
          if (
            isCurrentEffect &&
            currentAuth.isAuthenticated &&
            !currentAuth.awaitingTokenRefresh &&
            currentAuth.user?.uid === userId &&
            currentAuth.authGeneration === authGeneration
          ) {
            return privacyMode === 'discreet'
              ? suspendPushTokenForDiscreetMode(userId)
              : registerPushToken(userId);
          }
        }
      );
    };

    register();
    const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        register();
      }
    });
    const permissionSubscription = addNotificationPermissionRequestListener(register);

    return () => {
      isCurrentEffect = false;
      appStateSubscription.remove();
      permissionSubscription.remove();
    };
  }, [isAuthenticated, userId, awaitingTokenRefresh, privacyMode]);

  useEffect(() => {
    let isMounted = true;
    const subscription = addPushTokenListener((devicePushToken) => {
      const { user: currentUser, authGeneration } = useAuthStore.getState();
      if (currentUser?.uid) {
        void import('../services/notifications').then(({ registerPushToken }) => {
          const currentAuth = useAuthStore.getState();
          if (
            isMounted &&
            currentAuth.isAuthenticated &&
            !currentAuth.awaitingTokenRefresh &&
            currentAuth.user?.uid === currentUser.uid &&
            currentAuth.authGeneration === authGeneration
          ) {
            return registerPushToken(currentUser.uid, devicePushToken);
          }
        });
      }
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
}
