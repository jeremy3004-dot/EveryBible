import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LARGE_TEXT_FONT_SCALE,
  getLargeTextRowDirection,
  isLargeTextScale,
  normalizeFontScale,
} from './largeTextLayout';

// Real OS text-size steps, so the threshold is checked against what users pick.
const IOS_DEFAULT = 1;
const IOS_XXL = 1.24;
const IOS_XXXL = 1.35;
const IOS_AX1 = 1.65;
const IOS_AX5 = 3.12;
const ANDROID_LARGEST = 1.3;
const ANDROID_14_MAX = 2;

test('the shared threshold sits between the largest standard sizes and the accessibility sizes', () => {
  assert.equal(LARGE_TEXT_FONT_SCALE, 1.3);
});

test('default and slightly enlarged text keep the side-by-side layout', () => {
  assert.deepEqual(
    [IOS_DEFAULT, IOS_XXL, 0.82].map((scale) => isLargeTextScale(scale)),
    [false, false, false]
  );
});

test('the largest standard sizes and every accessibility size switch to the stacked layout', () => {
  assert.deepEqual(
    [ANDROID_LARGEST, IOS_XXXL, IOS_AX1, ANDROID_14_MAX, IOS_AX5].map((scale) =>
      isLargeTextScale(scale)
    ),
    [true, true, true, true, true]
  );
});

test('a caller can move the threshold for a row that has more room', () => {
  assert.equal(isLargeTextScale(IOS_XXXL, 1.6), false);
  assert.equal(isLargeTextScale(IOS_AX1, 1.6), true);
});

test('a missing or corrupt font scale is treated as the default size rather than stacking', () => {
  assert.deepEqual(
    [Number.NaN, Number.POSITIVE_INFINITY, 0, -2].map((scale) => normalizeFontScale(scale)),
    [1, 1, 1, 1]
  );
  assert.equal(isLargeTextScale(Number.NaN), false);
  assert.equal(isLargeTextScale(Number.POSITIVE_INFINITY), false);
});

test('row direction follows the large-text decision', () => {
  assert.equal(getLargeTextRowDirection(IOS_DEFAULT), 'row');
  assert.equal(getLargeTextRowDirection(IOS_AX1), 'column');
  assert.equal(getLargeTextRowDirection(IOS_XXXL, 1.6), 'row');
});

test('the scaling caps still enlarge capped text past the large-text threshold', async () => {
  const { CONTROL_LABEL_MAX_FONT_SCALE, DISPLAY_TEXT_MAX_FONT_SCALE } =
    await import('./largeTextLayout');
  // A cap at or below the threshold would leave capped text no bigger than the
  // largest standard size, which is not what someone at AX sizes asked for.
  for (const cap of [DISPLAY_TEXT_MAX_FONT_SCALE, CONTROL_LABEL_MAX_FONT_SCALE]) {
    assert.ok(cap > LARGE_TEXT_FONT_SCALE && cap < IOS_AX1);
  }
  assert.equal(DISPLAY_TEXT_MAX_FONT_SCALE, 1.5);
  assert.equal(CONTROL_LABEL_MAX_FONT_SCALE, 1.6);
});
