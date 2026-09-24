import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { shouldLockForAppStateChange } from '../services/privacy';
import { usePrivacyStore } from '../stores/privacyStore';

const shouldStayLocked = (): boolean => {
  const { mode, hasPin } = usePrivacyStore.getState();
  return mode === 'discreet' && hasPin;
};

// Setting the flag directly cannot fail the way a store action (or its callers) might.
const forceLocked = (): void => {
  usePrivacyStore.setState({ isLocked: true });
};

/**
 * Discreet mode fails closed: when the lock machinery itself breaks, a configured
 * discreet install shows the lock screen rather than silently staying open. Used by
 * the listener below and by the error boundary around the lock's host in App.tsx.
 */
export function lockAfterPrivacyLockFailure(error: unknown): void {
  console.error('Privacy lock failed; locking discreet mode:', error);
  if (shouldStayLocked()) {
    forceLocked();
  }
}

/**
 * Locks a discreet install whenever the app leaves the foreground (background, or the
 * inactive app-switcher preview). The configuration is read when that happens, not
 * captured at mount, so the lock never waits on its host re-rendering after privacy
 * settings change.
 */
export const usePrivacyLock = () => {
  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const leaving = previousState;
      previousState = nextState;

      try {
        if (shouldLockForAppStateChange(leaving, nextState) && shouldStayLocked()) {
          usePrivacyStore.getState().lock();
        }
      } catch (error) {
        lockAfterPrivacyLockFailure(error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
};
