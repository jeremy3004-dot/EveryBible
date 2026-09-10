import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: an iPhone whose window is landscape at launch, so the
// larger number is the width. isTablet compares the short edge, not the height.
mockReactNative(mock, { os: 'ios', version: '18.0', width: 844, height: 390 });

test('a landscape iPhone is not mistaken for a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, false);
});

test('the reported dimensions follow the window orientation', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { width: platform.screenWidth, height: platform.screenHeight },
    { width: 844, height: 390 }
  );
});
