import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockReactNative } from '../testing/mockModules';

// Import-time constants: a notched iPhone whose window is landscape at launch.
// Height is then under 812 and the width carries the notch signal instead.
mockReactNative(mock, { os: 'ios', version: '18.0', width: 844, height: 390 });

test('a landscape iPhone is still recognised as notched via its width', async () => {
  const platform = await import('./platform');

  assert.equal(platform.hasNotch, true);
});

test('a landscape iPhone is not mistaken for a tablet', async () => {
  const platform = await import('./platform');

  assert.equal(platform.isTablet, false);
});
