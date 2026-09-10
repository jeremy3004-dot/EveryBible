/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// design/system reads Platform at import time, and the hook's only other
// dependency is the safe-area provider — replaced here with a stub whose insets
// this file mutates between tests (one mock configuration per file).
mockReactNative(mock, { os: 'ios' });

const insets = { top: 59, bottom: 34, left: 0, right: 0 };
mockModule(mock, 'react-native-safe-area-context', {
  useSafeAreaInsets: () => insets,
});

const withBottomInset = async (bottom: number) => {
  insets.bottom = bottom;
  const { useTabBarHeight } = await import('./useTabBarHeight');
  return useTabBarHeight();
};

test('the capsule geometry constants describe a 64pt bar inset 16pt with a 32pt radius', async () => {
  const module = await import('./useTabBarHeight');

  assert.deepEqual(
    {
      height: module.TAB_BAR_CAPSULE_HEIGHT,
      sideInset: module.TAB_BAR_CAPSULE_SIDE_INSET,
      radius: module.TAB_BAR_CAPSULE_RADIUS,
      gap: module.TAB_BAR_CONTENT_GAP,
    },
    { height: 64, sideInset: 16, radius: 32, gap: 16 }
  );
});

test('a device with a home indicator tucks the capsule 22pt above the screen bottom', async () => {
  const metrics = await withBottomInset(34);

  assert.equal(metrics.bottomPadding, 22);
});

test('a device with a home indicator reserves the capsule plus its 22pt gap', async () => {
  const metrics = await withBottomInset(34);

  assert.deepEqual(metrics, {
    bottomPadding: 22,
    barHeight: 64,
    sideInset: 16,
    height: 86,
    contentClearance: 102,
  });
});

test('a device without a home indicator falls back to the standard 16pt gutter', async () => {
  const metrics = await withBottomInset(0);

  assert.deepEqual(metrics, {
    bottomPadding: 16,
    barHeight: 64,
    sideInset: 16,
    height: 80,
    contentClearance: 96,
  });
});

test('any positive bottom inset counts as a home indicator, however small', async () => {
  const metrics = await withBottomInset(0.5);

  assert.equal(metrics.bottomPadding, 22);
});

test('the reported height ignores the size of the inset itself', async () => {
  const shallow = await withBottomInset(21);
  const deep = await withBottomInset(48);

  assert.equal(shallow.height, deep.height);
  assert.equal(deep.height, 86);
});

test('contentClearance always sits one breathing gap above the reserved height', async () => {
  const withIndicator = await withBottomInset(34);
  const withoutIndicator = await withBottomInset(0);

  assert.equal(withIndicator.contentClearance - withIndicator.height, 16);
  assert.equal(withoutIndicator.contentClearance - withoutIndicator.height, 16);
});

test('the side inset does not vary with the safe-area insets', async () => {
  const withIndicator = await withBottomInset(34);
  const withoutIndicator = await withBottomInset(0);

  assert.equal(withIndicator.sideInset, 16);
  assert.equal(withoutIndicator.sideInset, 16);
});
