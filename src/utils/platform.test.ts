import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// utils/platform.ts derives every export at import time from Platform and
// Dimensions, so each device shape needs its own file (one module cache per
// file). This one is an iPhone on iOS 18.
mockReactNative(mock, { os: 'ios', version: '18.1.1', width: 390, height: 844 });

test('an iPhone reports the iOS platform and not Android', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid },
    { isIOS: true, isAndroid: false }
  );
});

test('screen dimensions are taken from the window, not the physical screen', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { width: platform.screenWidth, height: platform.screenHeight },
    { width: 390, height: 844 }
  );
});

test('a 390pt-wide phone is not a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, false);
});

test('iosVersion parses the leading major number out of a dotted iOS version', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 18);
});
