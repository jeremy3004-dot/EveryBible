import { useEffect } from 'react';
import { useAuthDeepLink } from '../../hooks/useAuthDeepLink';
import { usePrivacyLock } from '../../hooks/usePrivacyLock';
import { useSync } from '../../hooks/useSync';
import { installQueryClientListeners } from '../queryClient';

export function AppRuntimeEffects() {
  useSync();
  usePrivacyLock();
  useAuthDeepLink();

  // react-query's NetInfo/AppState listeners used to register at queryClient
  // module scope, which is on the static boot path. This component is already
  // deferred until after the first interactions, so it is the right owner.
  useEffect(() => {
    installQueryClientListeners();
  }, []);

  return null;
}
