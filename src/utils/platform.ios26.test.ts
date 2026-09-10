import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: this file pins an iOS 26 Pro Max, which is the
// combination that turns supportsLiquidGlass and isLargeScreen on.
mockReactNative(mock, { os: 'ios', version: '26.0', width: 440, height: 956 });

test('iOS 26 advertises Liquid Glass support', async () => {
  const platform = await import('./platform');

  assert.equal(platform.supportsLiquidGlass, true);
});

test('a 440pt-wide phone counts as a large screen but not a tablet', async () => {
  const platform = await import('./platform');

  assert.deepEqual(
    { large: platform.isLargeScreen, small: platform.isSmallScreen, tablet: platform.isTablet },
    { large: true, small: false, tablet: false }
  );
});

test('a tall large iPhone still reports a notch', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, true);
});

test('iosVersion reads 26 from a major.minor version string', async () => {
  const platform = await import('./platform');

  assert.equal(platform.iosVersion, 26);
});
