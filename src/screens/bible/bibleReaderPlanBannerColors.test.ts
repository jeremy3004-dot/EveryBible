import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { APPEARANCE_PALETTES } from '../../constants/appearancePalettes';
import { THEME_MODES } from '../../design/themeMode';
import { WCAG_AA_TEXT, contrastRatio } from '../../design/contrast';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { getPlanSessionBannerColors } from './bibleReaderModel';

// The banner is fed the live theme, so the colours come from the real ThemeContext
// createThemeColors for every palette and scope. ThemeContext reads the auth store only
// at render time; a stub keeps the native store graph out of the runner, and the
// module is required synchronously because the tests below are declared at load time.
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: () => undefined });
const { createThemeColors } = createRequire(import.meta.url)(
  '../../contexts/ThemeContext.tsx'
) as typeof import('../../contexts/ThemeContext');

for (const palette of APPEARANCE_PALETTES) {
  for (const mode of THEME_MODES) {
    test(`plan banner text and completion control reach 4.5:1 — ${palette.id} ${mode}`, () => {
      const banner = getPlanSessionBannerColors(createThemeColors(mode, palette.id));

      const checks: Array<[string, string, string]> = [
        ['banner text on banner fill', banner.text, banner.fill],
        ['completion glyph on its disc', banner.completeIcon, banner.completeFill],
      ];
      for (const [label, fg, bg] of checks) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(ratio >= WCAG_AA_TEXT, `${label}: ${ratio.toFixed(2)}:1`);
      }
    });
  }
}
