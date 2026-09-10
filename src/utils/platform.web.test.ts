import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: the web build (`npm run web`), where neither native
// platform branch applies.
mockReactNative(mock, { os: 'web', version: '1', width: 1280, height: 800 });

test('the web build reports the web platform and neither native one', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid, isWeb: platform.isWeb },
    { isIOS: false, isAndroid: false, isWeb: true }
  );
});

test('both native version numbers are 0 on the web', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { ios: platform.iosVersion, android: platform.androidVersion },
    { ios: 0, android: 0 }
  );
});

test('the web build never advertises Liquid Glass support', async () => {
  const platform = await import('./platform');

  assert.equal(platform.supportsLiquidGlass, false);
});

test('a desktop-sized window is classified as a large tablet-class screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { large: platform.isLargeScreen, tablet: platform.isTablet, small: platform.isSmallScreen },
    { large: true, tablet: true, small: false }
  );
});

test('a wide web window is not treated as a notched device', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, false);
});

test('platformSelect returns the default on the web even when both native values exist', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ ios: 'a', android: 'b', default: 'c' }), 'c');
});
