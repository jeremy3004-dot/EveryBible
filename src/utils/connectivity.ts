// Cheap offline check: one NetInfo read, no network. Loaded lazily so NetInfo
// stays off the import graph of everything that imports this module. An
// unreadable state counts as online, so callers still try the request.
export const isDeviceOffline = async (): Promise<boolean> => {
  try {
    const NetInfo = require('@react-native-community/netinfo')
      .default as typeof import('@react-native-community/netinfo').default;
    const { isConnected, isInternetReachable } = await NetInfo.fetch();
    return isConnected === false || isInternetReachable === false;
  } catch {
    return false;
  }
};
