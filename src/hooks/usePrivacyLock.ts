import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  getPendingPrivacyLockGraceDeadline,
  isPrivacyLockGraceActive,
  notePrivacyLockAppState,
  shouldLockForAppStateChange,
} from '../services/privacy';
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
 * Going inactive under system UI the app raised itself (an icon-change alert, a
 * permission prompt; see privacyLockGrace) does not lock, but backgrounding from there
 * still does. On Android, where that prompt backgrounds the app instead, the lock waits
 * while the prompt is open, up to the grace cap, and is dropped if the app comes back
 * in time.
 *
 * It also retries an app icon change that did not take (iOS refuses one while the app is
 * not in the foreground): once privacy settings have loaded, and on every return to the
 * foreground, an icon that differs from the saved mode is changed again.
 */
export const usePrivacyLock = () => {
  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;
    // An inactive spell left unlocked for the app's own system UI. Backgrounding from it
    // must still lock, though inactive -> background is not otherwise a lock trigger.
    let inactiveLockDeferred = false;
    // Android: a background spell left unlocked for the app's own open prompt, and the
    // time it stops being excused.
    let backgroundLockDeadline: number | null = null;
    let backgroundLockTimer: ReturnType<typeof setTimeout> | null = null;

    const clearBackgroundLock = (): void => {
      if (backgroundLockTimer !== null) {
        clearTimeout(backgroundLockTimer);
      }
      backgroundLockTimer = null;
      backgroundLockDeadline = null;
    };

    // Android pauses JS timers in the background, so this may only run on return, where
    // the check on 'active' below has already locked.
    const lockIfStillAway = (): void => {
      backgroundLockTimer = null;
      try {
        if (previousState !== 'active' && shouldStayLocked()) {
          usePrivacyStore.getState().lock();
        }
      } catch (error) {
        lockAfterPrivacyLockFailure(error);
      }
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const leaving = previousState;
      previousState = nextState;
      const lockDeferred = inactiveLockDeferred;
      inactiveLockDeferred = false;
      const backgroundDeadline = backgroundLockDeadline;
      if (nextState === 'active') {
        clearBackgroundLock();
      }

      try {
        notePrivacyLockAppState(nextState);
        if (
          nextState === 'active' &&
          backgroundDeadline !== null &&
          Date.now() >= backgroundDeadline &&
          shouldStayLocked()
        ) {
          // The prompt outlasted its grace while the app was away.
          usePrivacyStore.getState().lock();
        }
        const leavesForeground =
          shouldLockForAppStateChange(leaving, nextState) ||
          (lockDeferred && nextState === 'background');
        if (leavesForeground && shouldStayLocked()) {
          const pendingDeadline =
            nextState === 'background' && Platform.OS === 'android'
              ? getPendingPrivacyLockGraceDeadline()
              : null;
          if (nextState === 'inactive' && isPrivacyLockGraceActive()) {
            inactiveLockDeferred = true;
          } else if (pendingDeadline !== null) {
            clearBackgroundLock();
            backgroundLockDeadline = pendingDeadline;
            backgroundLockTimer = setTimeout(lockIfStillAway, pendingDeadline - Date.now());
          } else {
            usePrivacyStore.getState().lock();
          }
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
      clearBackgroundLock();
      unsubscribeFromInitialization();
    };
  }, []);
};
