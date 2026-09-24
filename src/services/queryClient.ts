import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

// Keep this module off every startup path. No screen uses react-query yet, and
// mounting a root QueryClientProvider in App.tsx evaluated ~48 modules
// (@tanstack/query-core and react-query, ~0.23 MB unminified) before Home could
// paint. A screen or stack that adopts react-query wraps itself in
// `<QueryClientProvider client={getQueryClient()}>`; every provider gets this
// one client, so the cache is shared across screens.

// Re-fetch stale queries when app returns to foreground
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

/**
 * Wires react-query's focus/online managers to AppState and NetInfo.
 *
 * Deliberately NOT run at module scope: it pulls in
 * @react-native-community/netinfo and makes a native bridge call. It runs
 * once, when the client is first requested.
 */
function installQueryClientListeners(): void {
  // Track online/offline status via NetInfo (already installed)
  onlineManager.setEventListener((setOnline) => {
    const NetInfo = require('@react-native-community/netinfo')
      .default as typeof import('@react-native-community/netinfo').default;
    return NetInfo.addEventListener((state) => {
      // A Wi-Fi link can stay connected while its internet connection is down.
      // Unknown reachability is still usable while NetInfo finishes its probe.
      setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
  });

  // Listen for app state changes — the subscription lives for the app lifetime.
  AppState.addEventListener('change', onAppStateChange);
  // The client may be created long after launch, or while backgrounded.
  onAppStateChange(AppState.currentState);
}

let queryClient: QueryClient | null = null;

/**
 * The app's single QueryClient, created on first use together with its
 * focus/online listeners.
 */
export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 2,
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 10 * 60 * 1000, // 10 minutes (garbage collect inactive queries)
        },
      },
    });
    installQueryClientListeners();
  }
  return queryClient;
}
