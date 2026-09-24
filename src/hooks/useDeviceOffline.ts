import { useEffect, useState } from 'react';
import { subscribeToDeviceOffline } from '../utils/connectivity';

/**
 * Whether NetInfo currently reports the device offline. Starts as online (false), like an
 * unprobed NetInfo state, so first paint never waits on it.
 */
export function useDeviceOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => subscribeToDeviceOffline(setOffline), []);
  return offline;
}
