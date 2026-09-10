import test from 'node:test';
import assert from 'node:assert/strict';

import { hexWithAlpha } from './color';

test('hexWithAlpha appends the alpha byte to a 6-digit hex colour', () => {
  assert.equal(hexWithAlpha('#C8463C', 0.5), '#C8463C80');
});

test('hexWithAlpha keeps lowercase hex input as written', () => {
  assert.equal(hexWithAlpha('#c8463c', 1), '#c8463cff');
});

test('hexWithAlpha renders a fully transparent colour as the 00 suffix', () => {
  assert.equal(hexWithAlpha('#000000', 0), '#00000000');
});

test('hexWithAlpha pads single-digit alpha bytes to two characters', () => {
  // 0.02 * 255 = 5.1 -> 5 -> '05', not '5'.
  assert.equal(hexWithAlpha('#FFFFFF', 0.02), '#FFFFFF05');
});

test('hexWithAlpha clamps an alpha above 1 to fully opaque', () => {
  assert.equal(hexWithAlpha('#FFFFFF', 4), '#FFFFFFff');
});

test('hexWithAlpha clamps a negative alpha to fully transparent', () => {
  assert.equal(hexWithAlpha('#FFFFFF', -3), '#FFFFFF00');
});

test('hexWithAlpha rounds the alpha byte to the nearest integer', () => {
  // 0.5 * 255 = 127.5 rounds up to 128 (0x80); 0.3 * 255 = 76.5 -> 77 (0x4d).
  assert.equal(hexWithAlpha('#123456', 0.3), '#1234564d');
});

test('hexWithAlpha returns a 3-digit shorthand hex unchanged rather than corrupting it', () => {
  assert.equal(hexWithAlpha('#fff', 0.5), '#fff');
});

test('hexWithAlpha returns an 8-digit hex unchanged instead of stacking a second alpha', () => {
  assert.equal(hexWithAlpha('#C8463C80', 0.25), '#C8463C80');
});

test('hexWithAlpha returns an rgba() colour unchanged', () => {
  assert.equal(hexWithAlpha('rgba(200, 70, 60, 0.4)', 0.5), 'rgba(200, 70, 60, 0.4)');
});

test('hexWithAlpha returns a named colour unchanged', () => {
  assert.equal(hexWithAlpha('transparent', 0.5), 'transparent');
});

test('hexWithAlpha rejects a 6-digit hex without the leading hash', () => {
  assert.equal(hexWithAlpha('C8463C', 0.5), 'C8463C');
});

test('hexWithAlpha rejects a hex containing a non-hex digit', () => {
  assert.equal(hexWithAlpha('#GGGGGG', 0.5), '#GGGGGG');
});

test('hexWithAlpha returns an empty string unchanged', () => {
  assert.equal(hexWithAlpha('', 0.5), '');
});

test('hexWithAlpha currently produces an invalid colour for a NaN alpha', () => {
  // Documented, not endorsed: Math.max/Math.min propagate NaN and
  // (NaN).toString(16) is the string 'NaN', so the clamp does not catch it.
  // Unreachable from today's call sites (every one passes a literal alpha), but
  // the same invalid-colour failure mode the 6-digit guard exists to prevent.
  assert.equal(hexWithAlpha('#FFFFFF', Number.NaN), '#FFFFFFNaN');
});
