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

// A failed icon change is reported inside the store; nothing here may break the lock.
const reconcileAppIcon = (): void => {
  try {
    void usePrivacyStore
      .getState()
      .reconcileAppIcon()
      .catch(() => undefined);
  } catch {
    // The icon retry is best effort.
  }
};

/**
 * Locks a discreet install whenever the app leaves the foreground (background, or the
 * inactive app-switcher preview). The configuration is read when that happens, not
 * captured at mount, so the lock never waits on its host re-rendering after privacy
 * settings change.
 *
 * It also retries an app icon change that did not take (iOS refuses one while the app is
 * not in the foreground): once privacy settings have loaded, and on every return to the
 * foreground, an icon that differs from the saved mode is changed again.
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

      if (nextState === 'active' && leaving !== 'active') {
        reconcileAppIcon();
      }
    });

    if (usePrivacyStore.getState().isInitialized) {
      reconcileAppIcon();
    }
    const unsubscribeFromInitialization = usePrivacyStore.subscribe((state, previous) => {
      if (state.isInitialized && !previous.isInitialized) {
        reconcileAppIcon();
      }
    });

    return () => {
      subscription.remove();
      unsubscribeFromInitialization();
    };
  }, []);
};
