import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_BAR_CAPSULE_FILL_ALPHA,
  TAB_BAR_GLASS_EFFECT_STYLE,
  getTabBarCapsuleFill,
} from './tabBarCapsuleStyle';

const alphaOf = (hex8: string) => parseInt(hex8.slice(7, 9), 16) / 255;

test('the glass capsule uses the frosted regular material, not clear lensing glass', () => {
  // Clear glass magnified the verse text behind the bar ("God called the
  // expanse sky" smeared under the tab labels) and made the labels hard to read.
  assert.equal(TAB_BAR_GLASS_EFFECT_STYLE, 'regular');
});

test('the capsule is backed by the scope surface opaque enough to mute busy content', () => {
  const fill = getTabBarCapsuleFill('#F4EFE4');

  assert.equal(fill.slice(0, 7), '#F4EFE4', 'the backing is the surface colour itself');
  assert.ok(alphaOf(fill) >= 0.8, `backing alpha ${alphaOf(fill)} lets too much text through`);
  assert.ok(alphaOf(fill) < 1, 'the backing keeps a little translucency so the bar stays glass');
  assert.equal(Math.round(alphaOf(fill) * 100) / 100, TAB_BAR_CAPSULE_FILL_ALPHA);
});

test('dark surfaces get the same backing strength as light ones', () => {
  assert.equal(alphaOf(getTabBarCapsuleFill('#1B1A17')), alphaOf(getTabBarCapsuleFill('#F4EFE4')));
});
