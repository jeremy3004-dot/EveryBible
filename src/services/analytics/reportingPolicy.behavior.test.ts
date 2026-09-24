import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../../testing/mockModules';

// The real policy over the React Native stub and a scripted NetInfo, checking that
// secondary subscribers (the crash-report uploader) follow the same decisions as the
// usage queue that owns the listeners.
const rn = mockReactNative(mock);
let network: ((state: unknown) => void) | undefined;
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    default: {
      refresh: async () => null,
      addEventListener: (listener: typeof network) => {
        network = listener;
        return () => {};
      },
    },
  },
});

const good = {
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
};

test('subscribers hear every policy change and stop hearing after unsubscribing', async () => {
  rn.AppState.currentState = 'active';
  const policy = await import('./reportingPolicy');
  const seen: boolean[] = [];
  const unsubscribe = policy.subscribeToReportingPolicy(() => {
    seen.push(policy.canReportUsage());
  });
  let ownerChanges = 0;
  const dispose = policy.installReportingPolicy(() => {
    ownerChanges += 1;
  });

  network?.(good);
  network?.({ ...good, isConnected: false });
  assert.deepEqual(seen, [true, false]);
  assert.equal(ownerChanges, 2);

  unsubscribe();
  network?.(good);
  assert.deepEqual(seen, [true, false]);
  dispose();
});

test('a throwing subscriber does not break the policy owner', async () => {
  rn.AppState.currentState = 'active';
  const policy = await import('./reportingPolicy');
  const unsubscribe = policy.subscribeToReportingPolicy(() => {
    throw new Error('subscriber exploded');
  });
  let ownerChanges = 0;
  const dispose = policy.installReportingPolicy(() => {
    ownerChanges += 1;
  });

  assert.doesNotThrow(() => network?.(good));
  assert.equal(ownerChanges, 1);
  assert.equal(policy.canReportUsage(), true);
  dispose();
  unsubscribe();
});
