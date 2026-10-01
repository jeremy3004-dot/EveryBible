import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { APPEARANCE_PALETTE_IDS } from '../constants/appearancePalettes';
import { mockModule, sourcePath } from '../testing/mockModules';
import { WCAG_NON_TEXT, contrastRatio } from './contrast';
import { getSwitchColors } from './switchColors';

mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: () => undefined });
const theme = createRequire(import.meta.url)(
  '../contexts/ThemeContext.tsx'
) as typeof import('../contexts/ThemeContext');

// The switch's thumb and track are the whole control, so each needs the 1.4.11
// 3:1 floor against what it sits on.
test('an off switch keeps thumb, track and card at 3:1 in every scope and palette', () => {
  const failures: string[] = [];
  for (const scope of ['light', 'dark'] as const) {
    for (const palette of APPEARANCE_PALETTE_IDS) {
      const colors = theme.createThemeColors(scope, palette);
      const off = getSwitchColors(colors, false, scope === 'dark');
      const pairs: Array<[string, string, string]> = [
        [off.thumbColor, off.trackColor.false, 'off thumb on its track'],
        [off.trackColor.false, colors.cardBackground, 'off track on the card'],
      ];
      // The Android thumb overhangs the track, so in dark scopes (where the card-coloured
      // thumb vanished into the card) it must also stand off the card itself.
      if (scope === 'dark')
        pairs.push([off.thumbColor, colors.cardBackground, 'off thumb on card']);
      for (const [fg, bg, what] of pairs) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < WCAG_NON_TEXT)
          failures.push(`${scope}/${palette} ${what}: ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('an on switch keeps its thumb distinct from the accent track', () => {
  for (const scope of ['light', 'dark'] as const) {
    for (const palette of APPEARANCE_PALETTE_IDS) {
      const colors = theme.createThemeColors(scope, palette);
      const on = getSwitchColors(colors, true, scope === 'dark');
      assert.equal(on.trackColor.true, colors.accentPrimary);
      assert.ok(
        contrastRatio(on.thumbColor, on.trackColor.true) >= WCAG_NON_TEXT,
        `${scope}/${palette} on thumb`
      );
    }
  }
});
