import { installUsageQueueReporting } from '../analytics/usageQueue';
import { installCrashReporting } from '../diagnostics/crashReportQueue';
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
  // interactions, so it is the right owner of both. Crash reports (including a
  // fatal from the previous launch) upload under the same policy, so they
  // install here too.
  useEffect(() => {
    const uninstallReporting = installUsageQueueReporting();
    const stopCrashReporting = installCrashReporting();
    const reminders = installDailyReminderReconciler();
    return () => {
      stopCrashReporting();
      uninstallReporting();
      reminders.uninstall();
    };
  }, []);

  return null;
}
