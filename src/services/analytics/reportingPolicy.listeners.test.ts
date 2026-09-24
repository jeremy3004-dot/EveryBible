import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../../testing/mockModules';

// The reporting policy owns the app's optional-upload AppState and NetInfo listeners.
// AppRuntimeEffects installs it and removes it on unmount (its error boundary can
// remount it), so repeated installs must never stack listeners or keep reacting.
const rn = mockReactNative(mock);
const netInfoListeners = new Set<(state: unknown) => void>();
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    default: {
      refresh: async () => null,
      addEventListener: (listener: (state: unknown) => void) => {
        netInfoListeners.add(listener);
        return () => {
          netInfoListeners.delete(listener);
        };
      },
    },
  },
});

const good = {
  isConnected: true,
  isInternetReachable: true,
  details: { isConnectionExpensive: false },
};
const emitNetwork = (state: unknown) => {
  for (const listener of [...netInfoListeners]) listener(state);
};

test('installing and disposing the policy repeatedly leaves no listeners behind', async () => {
  rn.AppState.currentState = 'active';
  const policy = await import('./reportingPolicy');
  const baseline = rn.AppState.listenerCount();

  for (let cycle = 0; cycle < 5; cycle += 1) {
    const dispose = policy.installReportingPolicy(() => {});
    assert.equal(rn.AppState.listenerCount(), baseline + 1);
    assert.equal(netInfoListeners.size, 1);
    dispose();
  }

  assert.equal(rn.AppState.listenerCount(), baseline);
  assert.equal(netInfoListeners.size, 0);
});

test('a disposed policy no longer reacts, and a reinstalled one reacts exactly once', async () => {
  rn.AppState.currentState = 'active';
  const policy = await import('./reportingPolicy');
  let staleChanges = 0;
  policy.installReportingPolicy(() => {
    staleChanges += 1;
  })();
  staleChanges = 0;

  let changes = 0;
  const dispose = policy.installReportingPolicy(() => {
    changes += 1;
  });
  emitNetwork(good);
  rn.AppState.emit('background');

  assert.deepEqual([staleChanges, changes], [0, 2]);
  dispose();
});
