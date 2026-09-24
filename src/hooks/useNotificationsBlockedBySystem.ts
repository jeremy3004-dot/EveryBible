import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Whether the daily reminder is on in the app while the system has blocked
 * EveryBible's notifications, so the reminder can never appear.
 *
 * The permission can be revoked in system settings at any time, and the only
 * way back is system settings too, so it is read when the reminder is on and
 * again each time the app returns to the foreground. A permission that cannot be
 * read is not reported as blocked: a false alarm is worse than no warning.
 */
export function useNotificationsBlockedBySystem(reminderEnabled: boolean): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!reminderEnabled) {
      return;
    }

    let isCurrentEffect = true;
    let latestCheck = 0;

    const check = () => {
      const checkId = ++latestCheck;
      import('../services/notifications')
        .then(({ getNotificationPermissionStatus }) => getNotificationPermissionStatus())
        .then((status) => {
          if (isCurrentEffect && checkId === latestCheck) {
            setBlocked(status === 'denied');
          }
        })
        .catch(() => {
          if (isCurrentEffect && checkId === latestCheck) {
            setBlocked(false);
          }
        });
    };

    check();
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        check();
      }
    });

    return () => {
      isCurrentEffect = false;
      subscription.remove();
    };
  }, [reminderEnabled]);

  return reminderEnabled && blocked;
}
