import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveKeyboardBottomInset,
  type KeyboardBottomInsetInput,
} from './keyboardBottomInsetModel';

const iosEvent = (overrides: Partial<KeyboardBottomInsetInput> = {}): KeyboardBottomInsetInput => ({
  platform: 'ios',
  keyboardHeight: 336,
  keyboardTopY: 508,
  surfaceBottomY: null,
  safeAreaBottomInset: 34,
  ...overrides,
});

const androidEvent = (
  overrides: Partial<KeyboardBottomInsetInput> = {}
): KeyboardBottomInsetInput => ({
  platform: 'android',
  keyboardHeight: 300,
  keyboardTopY: 592,
  surfaceBottomY: 892,
  safeAreaBottomInset: 48,
  ...overrides,
});

test('iOS discounts only the bottom inset the layout already reserves', () => {
  assert.equal(resolveKeyboardBottomInset(iosEvent()), 302);

  assert.equal(
    resolveKeyboardBottomInset(iosEvent({ safeAreaBottomInset: 0 })),
    336,
    'a consumer that reserves nothing at the bottom should still see the raw keyboard height'
  );

  assert.equal(
    resolveKeyboardBottomInset(iosEvent({ keyboardHeight: 20, safeAreaBottomInset: 34 })),
    0,
    'an accessory bar shorter than the reserved inset must never produce a negative lift'
  );

  assert.equal(
    resolveKeyboardBottomInset(iosEvent({ keyboardHeight: Number.NaN })),
    0,
    'a missing keyboard frame should collapse to no lift rather than poison the layout with NaN'
  );

  assert.equal(
    resolveKeyboardBottomInset(iosEvent({ surfaceBottomY: 892, keyboardTopY: 100 })),
    302,
    'iOS must stay on the reported keyboard frame — a measured surface must not change its result'
  );
});

test('Android measures the surface bottom against the keyboard top', () => {
  assert.equal(
    resolveKeyboardBottomInset(androidEvent()),
    300,
    'the overlap is the part of the surface that sits below the keyboard top'
  );

  assert.equal(
    resolveKeyboardBottomInset(androidEvent({ surfaceBottomY: 700 })),
    108,
    'a surface that ends above the window bottom is only partly covered'
  );

  assert.equal(
    resolveKeyboardBottomInset(androidEvent({ surfaceBottomY: 400 })),
    0,
    'a surface entirely above the keyboard needs no extra room — this is what makes the math safe whether or not adjustResize shrank the window'
  );

  assert.equal(
    resolveKeyboardBottomInset(androidEvent({ safeAreaBottomInset: 0 })),
    300,
    'the measured overlap already accounts for the nav bar, so the safe-area inset must not be subtracted again'
  );

  assert.equal(
    resolveKeyboardBottomInset(androidEvent({ surfaceBottomY: null })),
    0,
    'an unmeasurable surface should hold the previous behavior of reporting nothing'
  );

  assert.equal(
    resolveKeyboardBottomInset(androidEvent({ keyboardTopY: Number.NaN })),
    0,
    'a keyboard frame without a usable top edge should report nothing rather than NaN'
  );
});
