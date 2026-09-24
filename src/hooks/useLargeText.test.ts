/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';

// The stub reports a fixed fontScale of 1; this file drives the OS text size
// through a mutable window instead (one mock configuration per file).
const window = { width: 390, height: 844, scale: 3, fontScale: 1 };
const rn = createReactNativeStub({ os: 'ios' });
mockModule(mock, 'react-native', { ...rn, useWindowDimensions: () => window });

const atFontScale = async (fontScale: number) => {
  window.fontScale = fontScale;
  const { useLargeText } = await import('./useLargeText');
  return useLargeText();
};

test('the default text size reports the side-by-side layout', async () => {
  assert.deepEqual(await atFontScale(1), { fontScale: 1, isLargeText: false, rowDirection: 'row' });
});

test('an accessibility text size reports the stacked layout', async () => {
  assert.deepEqual(await atFontScale(2), {
    fontScale: 2,
    isLargeText: true,
    rowDirection: 'column',
  });
});

test('a corrupt window font scale falls back to the default size', async () => {
  assert.deepEqual(await atFontScale(Number.NaN), {
    fontScale: 1,
    isLargeText: false,
    rowDirection: 'row',
  });
});
