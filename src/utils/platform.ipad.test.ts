import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an 11" iPad in portrait. Its 834pt width is wide enough
// to trip isLargeScreen and its 834pt short edge makes it a tablet, which is
// exactly the combination that must NOT be treated as a notched iPhone.
mockReactNative(mock, { os: 'ios', version: '18.0', width: 834, height: 1194 });

test('an iPad is recognised as a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, true);
});

test('an iPad is never treated as a notched iPhone even though it is over 812pt tall', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, false);
});

test('an iPad counts as a large screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { large: platform.isLargeScreen, small: platform.isSmallScreen },
    { large: true, small: false }
  );
});

test('an iPad still reports the iOS platform', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { ios: platform.isIOS, android: platform.isAndroid },
    { ios: true, android: false }
  );
});
