import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an 11" iPad in portrait. Its 834pt short edge is what
// makes isTablet true.
mockReactNative(mock, { os: 'ios', version: '18.0', width: 834, height: 1194 });

test('an iPad is recognised as a tablet by its short edge', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, true);
});

test('an iPad still reports the iOS platform and its iOS version', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { ios: platform.isIOS, android: platform.isAndroid, version: platform.iosVersion },
    { ios: true, android: false, version: 18 }
  );
});
