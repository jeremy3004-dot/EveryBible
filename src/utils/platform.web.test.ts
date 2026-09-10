import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: the web build (`npm run web`), where neither native
// platform branch applies.
mockReactNative(mock, { os: 'web', version: '1', width: 1280, height: 800 });

test('the web build reports neither native platform', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid },
    { isIOS: false, isAndroid: false }
  );
});

test('iosVersion is 0 on the web', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 0);
});

test('a desktop-sized window is classified as tablet-class', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, true);
});
