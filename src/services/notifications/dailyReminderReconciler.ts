import { AppState } from 'react-native';
import i18n from '../../i18n';
import { useAuthStore } from '../../stores/authStore';

export interface DailyReminderReconciler {
  /** Resolves once every reconcile queued so far has finished. */
  idle: () => Promise<void>;
  uninstall: () => void;
}

/**
 * Keeps the scheduled daily reminder in line with the saved preference for the
 * life of the app: once on install, then whenever the reminder preference
 * changes (Settings, a pull from another device, the sign-out reset), the app
 * language changes (the reminder text is fixed when it is scheduled) or the app
 * returns to the foreground (a new timezone, a reboot the OS did not restore).
 *
 * notificationService is imported lazily: it pulls in the expo-notifications
 * root, which must stay off the startup path. Reconciles run one at a time so a
 * cancel can never land after the schedule that followed it.
 */
export function installDailyReminderReconciler(): DailyReminderReconciler {
  let queue: Promise<void> = Promise.resolve();

  const reconcile = () => {
    const { notificationsEnabled, reminderTime } = useAuthStore.getState().preferences;
    queue = queue
      .then(() => import('./notificationService'))
      .then(({ reconcileDailyReminder }) =>
        reconcileDailyReminder({ notificationsEnabled, reminderTime })
      )
      .catch(() => {
        // Best-effort: the next launch, foreground or preference change retries.
      });
  };

  const unsubscribePreferences = useAuthStore.subscribe((state, previous) => {
    if (
      state.preferences.notificationsEnabled !== previous.preferences.notificationsEnabled ||
      state.preferences.reminderTime !== previous.preferences.reminderTime
    ) {
      reconcile();
    }
  });
  i18n.on('languageChanged', reconcile);
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      reconcile();
    }
  });

  reconcile();

  return {
    idle: () => queue,
    uninstall: () => {
      unsubscribePreferences();
      i18n.off('languageChanged', reconcile);
      appStateSubscription.remove();
    },
  };
}
