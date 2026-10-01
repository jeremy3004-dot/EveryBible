import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../testing/render';
import { TAB_BAR_ANDROID_FILL_ALPHA } from '../tabBarCapsuleStyle';

const harness = installRenderHarness(mock, { os: 'android' });
mockModule(mock, 'expo-glass-effect', {
  GlassView: () => null,
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
});

const alphaOf = (hex8: string) => parseInt(hex8.slice(7, 9), 16) / 255;

test('on Android the capsule is the surface colour, near-opaque, with no blur', async () => {
  const { TabBarBackground } = await import('./TabBarBackground');
  const view = await harness.render(
    <TabBarBackground isDark fill="#1B1A17D6" stroke="#FFFFFF33" />
  );

  assert.equal(view.queryAllByType('BlurView').length, 0, 'Android blur does not hide content');
  const fills = view
    .queryAllByType('View')
    .map((node) => flattenStyle(node.props.style)?.backgroundColor)
    .filter((color): color is string => typeof color === 'string');
  assert.equal(fills.length, 1);
  const fill = fills[0] as string;
  assert.equal(fill.slice(0, 7), '#1B1A17');
  assert.ok(alphaOf(fill) >= 0.94, `alpha ${alphaOf(fill)} lets verse text show through`);
  assert.equal(Math.round(alphaOf(fill) * 100) / 100, TAB_BAR_ANDROID_FILL_ALPHA);
});
