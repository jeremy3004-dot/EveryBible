import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { addNotificationPermissionRequestListener } from '../services/notifications/notificationPermissionEvents';

/**
 * Why the system keeps the daily reminder from appearing, or null when nothing does:
 * - 'needs-permission': this device has not allowed notifications yet, and asking would
 *   still show the system prompt. Typical when the reminder was turned on on another
 *   device and arrived here by sync; one tap in Settings asks.
 * - 'blocked': notifications (or, on Android, just the reminder's channel) are switched
 *   off in system settings, which is the only way back.
 */
export type ReminderSystemBlock = 'needs-permission' | 'blocked';

/**
 * Whether the daily reminder is on in the app while the system keeps it from
 * appearing, and why.
 *
 * The permission can change in system settings at any time, so it is read when the
 * reminder is on, again each time the app returns to the foreground, and after the
 * app itself asks for it. A permission that cannot be read is not reported: a false
 * alarm is worse than no warning.
 */
export function useNotificationsBlockedBySystem(
  reminderEnabled: boolean
): ReminderSystemBlock | null {
  const [block, setBlock] = useState<ReminderSystemBlock | null>(null);

  useEffect(() => {
    if (!reminderEnabled) {
      return;
    }

    let isCurrentEffect = true;
    let latestCheck = 0;

    const check = () => {
      const checkId = ++latestCheck;
      import('../services/notifications')
        .then(({ getDailyReminderSystemState }) => getDailyReminderSystemState())
        .then((state) => {
          if (isCurrentEffect && checkId === latestCheck) {
            setBlock(state === 'allowed' ? null : state);
          }
        })
        .catch(() => {
          if (isCurrentEffect && checkId === latestCheck) {
            setBlock(null);
          }
        });
    };

    check();
    const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        check();
      }
    });
    const permissionSubscription = addNotificationPermissionRequestListener(check);

    return () => {
      isCurrentEffect = false;
      appStateSubscription.remove();
      permissionSubscription.remove();
    };
  }, [reminderEnabled]);

  return reminderEnabled ? block : null;
}
