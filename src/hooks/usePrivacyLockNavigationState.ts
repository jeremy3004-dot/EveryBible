import { useEffect, useState } from 'react';
import type { InitialState } from '@react-navigation/native';
import { usePrivacyStore } from '../stores/privacyStore';

// In memory only, for the life of the JS runtime; never persisted.
let stateHeldAcrossLock: InitialState | undefined;

/**
 * The navigator unmounts behind the discreet-mode lock screen, on purpose: nothing it
 * shows is rendered while locked, and none of its native modals can sit above the lock.
 * A remounted NavigationContainer starts over on Home, though, so every unlock lost the
 * reader's place. When the lock engages over a mounted navigator, the navigation tree it
 * reports is held here and returned, once, as the initial state of the next container.
 * A remount for any other reason (onboarding reset, a failed load) starts fresh.
 */
export function usePrivacyLockNavigationState(
  getRootState: () => InitialState | undefined
): InitialState | undefined {
  const [initialState] = useState(() => {
    const held = stateHeldAcrossLock;
    stateHeldAcrossLock = undefined;
    return held;
  });

  useEffect(
    () =>
      usePrivacyStore.subscribe((state, previous) => {
        if (state.isLocked && !previous.isLocked) {
          stateHeldAcrossLock = getRootState();
        }
      }),
    [getRootState]
  );

  return initialState;
}
