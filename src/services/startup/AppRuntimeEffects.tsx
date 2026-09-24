import { installUsageQueueReporting } from '../analytics/usageQueue';
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
  useEffect(() => installUsageQueueReporting(), []);

  return null;
}
