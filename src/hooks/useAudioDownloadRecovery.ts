import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Reattaches persisted background audio downloads once the app is ready, and again each
 * time it returns to the foreground (the OS may have suspended or finished them). The
 * Bible store is imported lazily so it stays off the startup path, and each run goes
 * through `schedule` (after interactions, delayed on Android) so it never competes with
 * the first frames. A newer run or unmount cancels a pending one.
 */
export function useAudioDownloadRecovery(
  enabled: boolean,
  schedule: (task: () => void) => () => void
): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelRecovery: (() => void) | null = null;

    const recoverAudioDownloads = () => {
      cancelRecovery?.();
      cancelRecovery = schedule(() => {
        void import('../stores/bibleStore')
          .then(({ useBibleStore }) => useBibleStore.getState().reattachAudioDownloads())
          .catch((error) => {
            console.error('Failed to reattach persisted audio downloads:', error);
          });
      });
    };

    recoverAudioDownloads();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        recoverAudioDownloads();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      cancelRecovery?.();
      subscription.remove();
    };
    // `schedule` is a module-level helper in App; the effect keys on readiness only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
