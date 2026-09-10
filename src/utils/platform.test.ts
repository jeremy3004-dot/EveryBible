import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// utils/platform.ts derives every export at import time from Platform and
// Dimensions, so each device shape needs its own file (one module cache per
// file). This one is an iPhone with a notch on iOS 18.
mockReactNative(mock, { os: 'ios', version: '18.1.1', width: 390, height: 844 });

test('an iPhone reports the iOS platform and neither Android nor web', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid, isWeb: platform.isWeb },
    { isIOS: true, isAndroid: false, isWeb: false }
  );
});

test('screen dimensions are taken from the window, not the physical screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { width: platform.screenWidth, height: platform.screenHeight },
    { width: 390, height: 844 }
  );
});

test('a 390pt-wide phone is neither a small nor a large screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { small: platform.isSmallScreen, large: platform.isLargeScreen, tablet: platform.isTablet },
    { small: false, large: false, tablet: false }
  );
});

test('an iPhone at least 812pt tall is treated as having a notch', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, true);
});

test('iosVersion parses the leading major number out of a dotted iOS version', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 18);
});

test('androidVersion is 0 on iOS', async () => {
  const platform = await import('./platform');

  assert.equal(platform.androidVersion, 0);
});

test('iOS 18 does not advertise Liquid Glass support', async () => {
  const platform = await import('./platform');

  assert.equal(platform.supportsLiquidGlass, false);
});

test('platformSelect prefers the ios value on iOS', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ ios: 'a', android: 'b', default: 'c' }), 'a');
});

test('platformSelect falls back to default when no ios value is given', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ android: 'b', default: 'c' }), 'c');
});

test('platformSelect treats an explicit undefined ios value as absent', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect<string | undefined>({ ios: undefined, default: 'c' }), 'c');
});

test('platformSelect passes through falsy-but-defined values such as 0', async () => {
  const { platformSelect } = await import('./platform');

  assert.equal(platformSelect({ ios: 0, default: 9 }), 0);
});
