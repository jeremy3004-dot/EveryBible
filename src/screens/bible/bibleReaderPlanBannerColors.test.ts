import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPEARANCE_PALETTES } from '../../constants/appearancePalettes';
import { getPlanSessionBannerColors } from './bibleReaderModel';

// ThemeContext imports react-native, so its scope hexes are read from source the
// way src/design/contrastAudit.test.ts does; the palettes import directly.
const themeSource = readFileSync(
  fileURLToPath(new URL('../../contexts/ThemeContext.tsx', import.meta.url).href),
  'utf8'
);

function themeToken(objectName: string, tokenName: string): string {
  const objectMatch = themeSource.match(
    new RegExp(`const ${objectName}(?::[^=]+)?\\s*=\\s*\\{([^}]+)\\}`, 's')
  );
  assert.ok(objectMatch, `could not find ${objectName}`);
  const tokenMatch = objectMatch[1].match(new RegExp(`${tokenName}:\\s*['"](#[A-Fa-f0-9]{6})['"]`));
  assert.ok(tokenMatch, `could not find ${tokenName} in ${objectName}`);
  return tokenMatch[1];
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .replace('#', '')
      .match(/.{2}/g)!
      .map((pair) => {
        const channel = parseInt(pair, 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

const onAccentDark = themeSource.match(/const onAccentDark = '(#[A-Fa-f0-9]{6})'/)?.[1];
const onAccentLight = themeSource.match(/const onAccentLight = '(#[A-Fa-f0-9]{6})'/)?.[1];

const SCOPES = [
  { name: 'light', object: 'baseLightColors', lightFamily: true },
  { name: 'dark', object: 'baseDarkColors', lightFamily: false },
] as const;

for (const palette of APPEARANCE_PALETTES) {
  for (const scope of SCOPES) {
    test(`plan banner text and completion control reach 4.5:1 — ${palette.id} ${scope.name}`, () => {
      assert.ok(onAccentDark && onAccentLight);
      const banner = getPlanSessionBannerColors({
        accentPrimary: scope.lightFamily ? palette.swatches.primaryDeep : palette.swatches.primary,
        onAccent: scope.lightFamily ? onAccentLight : onAccentDark,
        primaryText: themeToken(scope.object, 'primaryText'),
      });

      const checks: Array<[string, string, string]> = [
        ['banner text on banner fill', banner.text, banner.fill],
        ['completion glyph on its disc', banner.completeIcon, banner.completeFill],
      ];
      for (const [label, fg, bg] of checks) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1`);
      }
    });
  }
}
