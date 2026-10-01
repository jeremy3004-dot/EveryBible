import assert from 'node:assert/strict';
import { test } from 'node:test';

import { globeFitZoom, storyPadding } from './atlas-story';

test('the globe fit grows by one zoom level when the space doubles', () => {
  const small = globeFitZoom(400, 400, 20);
  const large = globeFitZoom(800, 800, 20);
  assert.ok(Math.abs(large - small - 1) < 1e-9);
  assert.equal(globeFitZoom(400, 900, 20), globeFitZoom(900, 400, 20), 'fits the smaller side');
});

test('desktop keeps the globe right of the copy; phones keep it above the copy', () => {
  const desktop = storyPadding(1440, 900, 72);
  assert.ok(desktop.left > desktop.right);
  const phone = storyPadding(375, 812, 64);
  assert.ok(phone.bottom > phone.top);
  assert.equal(phone.left, phone.right);
});

test('right-to-left pages mirror the globe to the left of the copy', () => {
  const ltr = storyPadding(1440, 900, 72);
  const rtl = storyPadding(1440, 900, 72, true);
  assert.equal(rtl.left, ltr.right);
  assert.equal(rtl.right, ltr.left);
  assert.equal(rtl.top, ltr.top);
  assert.deepEqual(storyPadding(375, 812, 64, true), storyPadding(375, 812, 64));
});
