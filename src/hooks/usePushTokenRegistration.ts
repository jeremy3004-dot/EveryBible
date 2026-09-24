import { useEffect } from 'react';
import { addPushTokenListener } from '../services/notifications/notificationBootstrap';
import { useAuthStore } from '../stores/authStore';

/**
 * Registers this device's push token for the signed-in account, and re-registers when
 * the OS rotates the token. The notification service is imported lazily so it stays off
 * the startup path. Auth can change while that import resolves, so each registration
 * checks it is still for the same account and auth generation, and unmounting cancels
 * anything still pending.
 */
export function usePushTokenRegistration(isAuthenticated: boolean, userId: string | undefined) {
  // Re-runs whenever the user changes.
  useEffect(() => {
    let isCurrentEffect = true;
    const authGeneration = useAuthStore.getState().authGeneration;
    if (isAuthenticated && userId) {
      void import('../services/notifications').then(({ registerPushToken }) => {
        const currentAuth = useAuthStore.getState();
        if (
          isCurrentEffect &&
          currentAuth.isAuthenticated &&
          currentAuth.user?.uid === userId &&
          currentAuth.authGeneration === authGeneration
        ) {
          return registerPushToken(userId);
        }
      });
    }
    return () => {
      isCurrentEffect = false;
    };
  }, [isAuthenticated, userId]);

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
