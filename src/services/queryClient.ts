import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

// Re-fetch stale queries when app returns to foreground
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

let listenersInstalled = false;

/**
 * Wires react-query's focus/online managers to AppState and NetInfo.
 *
 * Deliberately NOT run at module scope: this module is on App.tsx's static boot
 * graph (the QueryClientProvider needs the client), and registering the
 * listeners there pulled @react-native-community/netinfo — plus a native
 * bridge call — into cold start before the first frame. AppRuntimeEffects
 * (loaded after interactions) calls this instead. Idempotent.
 */
export function installQueryClientListeners(): void {
  if (listenersInstalled) {
    return;
  }
  listenersInstalled = true;

  // Track online/offline status via NetInfo (already installed)
  onlineManager.setEventListener((setOnline) => {
    const NetInfo = require('@react-native-community/netinfo')
      .default as typeof import('@react-native-community/netinfo').default;
    return NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected);
    });
  });

  // Listen for app state changes — the subscription lives for the app lifetime.
  AppState.addEventListener('change', onAppStateChange);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (garbage collect inactive queries)
    },
  },
});
