import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an iPhone SE (1st gen) sized window — the smallest
// screen the app targets, on the oldest iOS it still runs on.
mockReactNative(mock, { os: 'ios', version: '15.8', width: 320, height: 568 });

test('the smallest supported window is not a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, false);
});

test('an old iOS major version is parsed without the minor part', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 15);
});
