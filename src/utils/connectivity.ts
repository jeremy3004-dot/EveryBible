import type { NetInfoState } from '@react-native-community/netinfo';

type NetInfoModule = typeof import('@react-native-community/netinfo').default;

// NetInfo is loaded lazily so it stays off the import graph of everything that imports
// this module.
const loadNetInfo = (): NetInfoModule =>
  require('@react-native-community/netinfo').default as NetInfoModule;

// A link that is up with no internet behind it (captive portal) counts as offline. An
// unreadable or not-yet-probed state counts as online, so callers still try the request.
const isOfflineState = ({
  isConnected,
  isInternetReachable,
}: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  isConnected === false || isInternetReachable === false;

// Cheap offline check: one NetInfo read, no network.
export const isDeviceOffline = async (): Promise<boolean> => {
  try {
    return isOfflineState(await loadNetInfo().fetch());
  } catch {
    return false;
  }
};

/**
 * Calls `listener` with the current offline state and again on every change, until the
 * returned function is called. If NetInfo cannot be loaded the device is treated as online.
 */
export const subscribeToDeviceOffline = (listener: (offline: boolean) => void): (() => void) => {
  try {
    return loadNetInfo().addEventListener((state) => listener(isOfflineState(state)));
  } catch {
    return () => {};
  }
};
