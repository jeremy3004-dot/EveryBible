import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: a Pixel-class Android phone. Android's Platform.Version
// is a number (API level), not a dotted string.
mockReactNative(mock, { os: 'android', version: 34, width: 412, height: 915 });

test('an Android phone reports the Android platform and not iOS', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { isIOS: platform.isIOS, isAndroid: platform.isAndroid },
    { isIOS: false, isAndroid: true }
  );
});

test('iosVersion is 0 on Android, where Platform.Version is a bare API level', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 0);
});

test('an Android phone is not a tablet and reports its window size', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { tablet: platform.isTablet, width: platform.screenWidth, height: platform.screenHeight },
    { tablet: false, width: 412, height: 915 }
  );
});
