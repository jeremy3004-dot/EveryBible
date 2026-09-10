import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an iOS 26 Pro Max — the widest iPhone the app targets,
// which must still not be mistaken for a tablet.
mockReactNative(mock, { os: 'ios', version: '26.0', width: 440, height: 956 });

test('iosVersion reads 26 from a major.minor version string', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 26);
});

test('a 440pt-wide phone is still not a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, false);
});
