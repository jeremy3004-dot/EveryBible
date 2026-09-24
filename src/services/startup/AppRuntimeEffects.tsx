import { installUsageQueueReporting } from '../analytics/usageQueue';
import { installCrashReporting } from '../diagnostics/crashReportQueue';
import { useEffect } from 'react';
import { useAuthDeepLink } from '../../hooks/useAuthDeepLink';
import { usePrivacyLock } from '../../hooks/usePrivacyLock';
import { useSync } from '../../hooks/useSync';

export function AppRuntimeEffects() {
  useSync();
  usePrivacyLock();
  useAuthDeepLink();

  // Usage-queue reporting subscribes to AppState; this component is already
  // deferred until after the first interactions, so it is the right owner.
  // Crash reports (including a fatal from the previous launch) upload under the
  // same policy, so they install here too.
  useEffect(() => {
    const stopUsageReporting = installUsageQueueReporting();
    const stopCrashReporting = installCrashReporting();
    return () => {
      stopCrashReporting();
      stopUsageReporting();
    };
  }, []);

  return null;
}
