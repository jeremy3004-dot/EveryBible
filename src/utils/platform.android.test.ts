import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: a Pixel-class Android phone. Android's Platform.Version
// is a number (API level), not a dotted string.
mockReactNative(mock, { os: 'android', version: 34, width: 412, height: 915 });

test('an Android phone reports the Android platform and neither iOS nor web', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid, isWeb: platform.isWeb },
    { isIOS: false, isAndroid: true, isWeb: false }
  );
});

test('androidVersion is the numeric API level', async () => {
  const platform = await import('./platform');

  assert.equal(platform.androidVersion, 34);
});

test('iosVersion is 0 on Android', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 0);
});

test('a tall Android phone never reports a notch, which is an iOS-only concept here', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, false);
});

test('Android never advertises Liquid Glass support', async () => {
  const platform = await import('./platform');

  assert.equal(platform.supportsLiquidGlass, false);
});

test('platformSelect prefers the android value on Android', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ ios: 'a', android: 'b', default: 'c' }), 'b');
});

test('platformSelect falls back to default when no android value is given', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ ios: 'a', default: 'c' }), 'c');
});
