import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an iPhone SE (1st gen) sized window — the smallest
// screen the app targets, and short enough to have no notch.
mockReactNative(mock, { os: 'ios', version: '15.8', width: 320, height: 568 });

test('a 320pt-wide window is reported as a small screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { small: platform.isSmallScreen, large: platform.isLargeScreen, tablet: platform.isTablet },
    { small: true, large: false, tablet: false }
  );
});

test('a short iPhone reports no notch', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, false);
});

test('an old iOS major version is parsed without the minor part', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 15);
});
