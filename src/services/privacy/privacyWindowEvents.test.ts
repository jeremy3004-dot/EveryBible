import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';

/**
 * The events that can put the app in a new Android window: turning active, and an icon
 * change the system accepted (the launcher alias switch).
 */
let iconAccepted = true;
const rn = createReactNativeStub({
  os: 'android',
  nativeModules: {
    EveryBiblePrivacyModule: {
      getCurrentAppIcon: async () => 'standard',
      setAppIcon: async () => iconAccepted,
    },
  },
});
mockModule(mock, 'react-native', rn);

test('each activation and each accepted icon change is reported once', async () => {
  const { subscribeToAppWindowChanges } = await import('./privacyWindowEvents');
  const { setPrivacyAppIcon } = await import('./appIcon');
  let calls = 0;
  const stop = subscribeToAppWindowChanges(() => (calls += 1));

  rn.AppState.emit('background');
  assert.equal(calls, 0, 'leaving is not a new window');
  rn.AppState.emit('active');
  assert.equal(calls, 1);

  await setPrivacyAppIcon('discreet');
  assert.equal(calls, 2);

  iconAccepted = false;
  await setPrivacyAppIcon('standard');
  assert.equal(calls, 2, 'a refused change keeps the same window');

  stop();
  rn.AppState.emit('inactive');
  rn.AppState.emit('active');
  iconAccepted = true;
  await setPrivacyAppIcon('discreet');
  assert.equal(calls, 2, 'nothing is reported after unsubscribing');
});
