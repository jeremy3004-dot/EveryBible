import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { shouldLockForAppStateChange } from '../services/privacy';
import { usePrivacyStore } from '../stores/privacyStore';

export const usePrivacyLock = () => {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const hasPin = usePrivacyStore((state) => state.hasPin);
  const lock = usePrivacyStore((state) => state.lock);
  const mode = usePrivacyStore((state) => state.mode);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        mode === 'discreet' &&
        hasPin &&
        shouldLockForAppStateChange(appState.current, nextState)
      ) {
        lock();
      }

      appState.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [hasPin, lock, mode]);
};
