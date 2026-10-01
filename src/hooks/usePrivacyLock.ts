import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  getPendingPrivacyLockGraceDeadline,
  getPrivacyLockGraceDeadline,
  isInactiveUnderIconAlert,
  notePrivacyLockAppState,
  shouldLockForAppStateChange,
  subscribeToPrivacyLockGraceChanges,
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
 * permission prompt; see privacyLockGrace) defers locking only until its grace deadline;
 * backgrounding from there still locks. On Android, where that prompt backgrounds the
 * app instead, the lock waits while the prompt is open, up to the grace cap, and is
 * dropped if the app comes back in time.
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
    // A spell away excused by our own system UI, bounded even if JS timers pause.
    let awayLockDeadline: number | null = null;
    let awayLockTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAwayLock = (): void => {
      if (awayLockTimer !== null) {
        clearTimeout(awayLockTimer);
      }
      awayLockTimer = null;
      awayLockDeadline = null;
    };

    // Mobile platforms may pause JS while away; the active handler also checks the clock.
    const lockIfStillAway = (): void => {
      awayLockTimer = null;
      try {
        if (previousState !== 'active' && shouldStayLocked()) {
          usePrivacyStore.getState().lock();
        }
      } catch (error) {
        lockAfterPrivacyLockFailure(error);
      }
    };

    const deferAwayLock = (deadline: number): void => {
      // Repeated lifecycle events or another prompt must not extend the same absence.
      const boundedDeadline = Math.min(awayLockDeadline ?? deadline, deadline);
      clearAwayLock();
      awayLockDeadline = boundedDeadline;
      awayLockTimer = setTimeout(lockIfStillAway, Math.max(0, boundedDeadline - Date.now()));
    };

    const unsubscribeFromGrace = subscribeToPrivacyLockGraceChanges(() => {
      try {
        if (inactiveLockDeferred && previousState === 'inactive' && awayLockDeadline !== null) {
          deferAwayLock(getPrivacyLockGraceDeadline() ?? Date.now());
        }
      } catch (error) {
        lockAfterPrivacyLockFailure(error);
      }
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      const leaving = previousState;
      previousState = nextState;
      const lockDeferred = inactiveLockDeferred;
      inactiveLockDeferred = lockDeferred && nextState === 'inactive';
      const awayDeadline = awayLockDeadline;
      if (nextState === 'active') {
        clearAwayLock();
      }

      try {
        notePrivacyLockAppState(nextState);
        if (
          nextState === 'active' &&
          awayDeadline !== null &&
          Date.now() >= awayDeadline &&
          shouldStayLocked()
        ) {
          // The prompt outlasted its grace while the app was away.
          usePrivacyStore.getState().lock();
        }
        const leavesForeground =
          shouldLockForAppStateChange(leaving, nextState) ||
          (lockDeferred && nextState !== 'active');
        if (leavesForeground && shouldStayLocked()) {
          const inactiveDeadline = nextState === 'inactive' ? getPrivacyLockGraceDeadline() : null;
          const pendingDeadline =
            nextState === 'background' && Platform.OS === 'android'
              ? getPendingPrivacyLockGraceDeadline()
              : null;
          if (nextState === 'inactive' && isInactiveUnderIconAlert()) {
            // The icon alert waits for the reader's OK; no timer may lock under it.
            inactiveLockDeferred = true;
            clearAwayLock();
          } else if (inactiveDeadline !== null) {
            inactiveLockDeferred = true;
            deferAwayLock(inactiveDeadline);
          } else if (pendingDeadline !== null) {
            deferAwayLock(pendingDeadline);
          } else {
            clearAwayLock();
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
      clearAwayLock();
      unsubscribeFromGrace();
      unsubscribeFromInitialization();
    };
  }, []);
};
