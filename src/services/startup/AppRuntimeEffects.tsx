import { usePrivacyLock } from '../../hooks/usePrivacyLock';
import { useSync } from '../../hooks/useSync';

export function AppRuntimeEffects() {
  useSync();
  usePrivacyLock();

  return null;
}
