import { useCallback, useEffect, useRef, useState } from 'react';
import type { InitialState } from '@react-navigation/native';
import { usePrivacyStore } from '../stores/privacyStore';

// In memory only, for the life of the JS runtime; never persisted.
let stateHeldAcrossLock: InitialState | undefined;

/**
 * The navigator unmounts behind the discreet-mode lock screen, on purpose: nothing it
 * shows is rendered while locked, and none of its native modals can sit above the lock.
 * A remounted NavigationContainer starts over on Home, though, so every unlock lost the
 * reader's place. The navigator reports every state it reaches (`rememberState`, from
 * onReady and onStateChange); when it unmounts because the lock engaged, the last one is
 * held here and returned, once, as the initial state of the next container. A remount for
 * any other reason (onboarding reset, a failed load) starts fresh.
 *
 * The state is not read when the lock engages. On the old architecture the app renders on
 * a legacy root, where lock() from an AppState event re-renders synchronously inside the
 * store update: the screen that gates on the lock (subscribed long before the navigator
 * mounted) unmounts the navigator, and with it any store listener registered here, before
 * such a listener would run. By then the navigation ref is detached too.
 */
export function usePrivacyLockNavigationState(): {
  initialState: InitialState | undefined;
  rememberState: (state: InitialState | undefined) => void;
} {
  const [initialState] = useState(() => {
    const held = stateHeldAcrossLock;
    stateHeldAcrossLock = undefined;
    return held;
  });
  const latestState = useRef<InitialState | undefined>(initialState);
  const rememberState = useCallback((state: InitialState | undefined) => {
    latestState.current = state;
  }, []);

  useEffect(
    () => () => {
      // The lock is already set when it is what unmounts the navigator.
      if (usePrivacyStore.getState().isLocked) {
        stateHeldAcrossLock = latestState.current;
      }
    },
    []
  );

  return { initialState, rememberState };
}
