import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// Platform is read when the hook runs, but design/system reads it at import time, so
// Android gets its own file (one mock configuration per file).
mockReactNative(mock, { os: 'android' });

const insets = { top: 24, bottom: 48, left: 0, right: 0 };
mockModule(mock, 'react-native-safe-area-context', {
  useSafeAreaInsets: () => insets,
});

test('on Android the capsule clears a three-button navigation bar from the real inset', async () => {
  insets.bottom = 48;
  const { useTabBarHeight } = await import('./useTabBarHeight');

  assert.deepEqual(useTabBarHeight(), {
    bottomPadding: 48,
    barHeight: 64,
    sideInset: 16,
    height: 112,
    contentClearance: 128,
  });
});

test('on Android gesture navigation keeps the standard 16pt gutter', async () => {
  insets.bottom = 12;
  const { useTabBarHeight } = await import('./useTabBarHeight');

  assert.equal(useTabBarHeight().bottomPadding, 16);
});
