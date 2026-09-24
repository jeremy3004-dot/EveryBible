import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../testing/mockModules';

type NetInfoState = { isConnected: boolean | null; isInternetReachable: boolean | null };
type NetInfoListener = (state: NetInfoState) => void;

const listeners = new Set<NetInfoListener>();
let current: NetInfoState = { isConnected: true, isInternetReachable: true };
// connectivity.ts reaches NetInfo through a lazy CommonJS `require(...).default`, so the
// fake answers whether the loader hands back the namespace or the interop default.
const netInfoFake: Record<string, unknown> = {
  fetch: async () => current,
  addEventListener: (listener: NetInfoListener) => {
    listeners.add(listener);
    // Like NetInfo, a new subscriber hears the current state straight away.
    listener(current);
    return () => listeners.delete(listener);
  },
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

const emit = (state: NetInfoState) => {
  current = state;
  for (const listener of listeners) listener(state);
};

test('subscribers hear the offline state now and on every change until they unsubscribe', async () => {
  const { subscribeToDeviceOffline } = await import('./connectivity');
  const heard: boolean[] = [];

  const unsubscribe = subscribeToDeviceOffline((offline) => heard.push(offline));
  emit({ isConnected: false, isInternetReachable: false });
  // A link that is up with no internet behind it (captive portal) is offline too.
  emit({ isConnected: true, isInternetReachable: false });
  // Reachability not probed yet counts as online, so callers still try.
  emit({ isConnected: true, isInternetReachable: null });
  unsubscribe();
  emit({ isConnected: false, isInternetReachable: false });

  assert.deepEqual(heard, [false, true, true, false]);
  assert.equal(listeners.size, 0);
});

test('a one-off check reads the same rule', async () => {
  const { isDeviceOffline } = await import('./connectivity');

  current = { isConnected: false, isInternetReachable: null };
  assert.equal(await isDeviceOffline(), true);
  current = { isConnected: true, isInternetReachable: null };
  assert.equal(await isDeviceOffline(), false);
});
