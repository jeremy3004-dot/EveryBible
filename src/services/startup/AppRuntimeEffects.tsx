import { installUsageQueueReporting } from '../analytics/usageQueue';
import { useEffect } from 'react';
import { useAuthDeepLink } from '../../hooks/useAuthDeepLink';
import { usePrivacyLock } from '../../hooks/usePrivacyLock';
import { useSync } from '../../hooks/useSync';
import { installDailyReminderReconciler } from '../notifications/dailyReminderReconciler';

export function AppRuntimeEffects() {
  useSync();
  usePrivacyLock();
  useAuthDeepLink();

  // Usage-queue reporting and the daily-reminder reconciler both subscribe to
  // AppState; this component is already deferred until after the first
  // interactions, so it is the right owner of both.
  useEffect(() => {
    const uninstallReporting = installUsageQueueReporting();
    const reminders = installDailyReminderReconciler();
    return () => {
      uninstallReporting();
      reminders.uninstall();
    };
  }, []);

  return null;
}
