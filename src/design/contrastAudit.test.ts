import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// appearancePalettes.ts is dependency-free, so importing it here does not drag
// react-native's flow-typed sources into the node test runner. The base palette
// hexes live in ThemeContext.tsx (which does import RN), so those are read from
// source text — the same approach themeColors.test.ts uses.
import { APPEARANCE_PALETTES } from '../constants/appearancePalettes';

// ---------------------------------------------------------------------------
// WCAG contrast audit for the Illuminated palette matrix: every core text/accent
// token must stay legible across all 5 theme modes × 4 accent palettes. Scripted
// version of the Phase 5 contrast pass — asserts the >= 4.5:1 text floor.
// ---------------------------------------------------------------------------

const AA_TEXT = 4.5;
const ON_ACCENT_DARK = '#1A140F';
const ON_ACCENT_LIGHT = '#FFFFFF';

function readThemeSource(): string {
  return readFileSync(
    fileURLToPath(new URL('../contexts/ThemeContext.tsx', import.meta.url).href),
    'utf8'
  );
}

function extractColorToken(source: string, objectName: string, tokenName: string): string {
  const objectMatch = source.match(
    new RegExp(`const ${objectName}(?::[^=]+)?\\s*=\\s*\\{([^}]+)\\}`, 's')
  );
  assert.ok(objectMatch, `could not find ${objectName} in ThemeContext`);
  const tokenMatch = objectMatch[1].match(
    new RegExp(`${tokenName}:\\s*['"](#[A-Fa-f0-9]{6})['"]`)
  );
  assert.ok(tokenMatch, `could not find ${tokenName} in ${objectName}`);
  return tokenMatch[1];
}

function relativeLuminance(hex: string): number {
  const channels = hex.replace('#', '').match(/.{2}/g)!;
  const [r, g, b] = channels.map((pair) => {
    const channel = parseInt(pair, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

const source = readThemeSource();

// The EL design system ships two scopes; low-light, parchment and midnight were
// retired with the reskin.
const MODES = [
  { name: 'dark', object: 'baseDarkColors', lightFamily: false },
  { name: 'light', object: 'baseLightColors', lightFamily: true },
] as const;

for (const palette of APPEARANCE_PALETTES) {
  for (const mode of MODES) {
    const background = extractColorToken(source, mode.object, 'background');
    const cardBackground = extractColorToken(source, mode.object, 'cardBackground');
    const primaryText = extractColorToken(source, mode.object, 'primaryText');
    const secondaryText = extractColorToken(source, mode.object, 'secondaryText');
    const accent = mode.lightFamily ? palette.swatches.primaryDeep : palette.swatches.primary;
    const onAccent = mode.lightFamily ? ON_ACCENT_LIGHT : ON_ACCENT_DARK;

    test(`contrast: ${palette.id} on ${mode.name}`, () => {
      const checks: Array<[string, string, string]> = [
        ['primaryText on background', primaryText, background],
        ['secondaryText on background', secondaryText, background],
        ['secondaryText on cardBackground', secondaryText, cardBackground],
        ['accent on background', accent, background],
        ['accent on cardBackground', accent, cardBackground],
        ['onAccent on accent fill', onAccent, accent],
      ];

      for (const [label, fg, bg] of checks) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(
          ratio >= AA_TEXT,
          `${palette.id}/${mode.name} — ${label}: ${ratio.toFixed(2)}:1 (need ${AA_TEXT}:1)`
        );
      }
    });
  }
}
