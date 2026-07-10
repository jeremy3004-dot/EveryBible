import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Read theme source directly — avoids importing React / RN at test time
// ---------------------------------------------------------------------------

function readThemeSource(): string {
  return readFileSync(fileURLToPath(new URL('./ThemeContext.tsx', import.meta.url).href), 'utf8');
}

// Extract a color palette object from raw source text.
// Looks for `const <name>: ThemeColors = { ... }` blocks.
function extractPaletteKeys(source: string, paletteName: string): string[] {
  const paletteMatcher = new RegExp(
    `const ${paletteName}:\\s*ThemeColors\\s*=\\s*\\{([^}]+)\\}`,
    's'
  );
  const match = source.match(paletteMatcher);
  if (!match) {
    return [];
  }
  // Pull out the property keys from the block
  return [...match[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

function extractColorToken(source: string, objectName: string, tokenName: string): string | null {
  const objectMatcher = new RegExp(`const ${objectName}(?::[^=]+)?\\s*=\\s*\\{([^}]+)\\}`, 's');
  const objectMatch = source.match(objectMatcher);
  if (!objectMatch) {
    return null;
  }

  const tokenMatcher = new RegExp(`${tokenName}:\\s*['"](#(?:[A-Fa-f0-9]{6}))['"]`);
  return objectMatch[1].match(tokenMatcher)?.[1] ?? null;
}

function colorContrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [red, green, blue] = [...hex.matchAll(/[A-Fa-f0-9]{2}/g)].map(
      ([channel]) => parseInt(channel, 16) / 255
    );
    const [r, g, b] = [red, green, blue].map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  return (
    (Math.max(foregroundLum, backgroundLum) + 0.05) /
    (Math.min(foregroundLum, backgroundLum) + 0.05)
  );
}

// ---------------------------------------------------------------------------
// S16 — Theme palette completeness and consistency
// ---------------------------------------------------------------------------

test('all base theme palettes declare the same set of color keys', () => {
  const source = readThemeSource();

  const darkKeys = extractPaletteKeys(source, 'baseDarkColors');
  const lightKeys = extractPaletteKeys(source, 'baseLightColors');
  const lowLightKeys = extractPaletteKeys(source, 'baseLowLightColors');
  const parchmentKeys = extractPaletteKeys(source, 'baseParchmentColors');
  const midnightKeys = extractPaletteKeys(source, 'baseMidnightColors');

  assert.ok(darkKeys.length > 0, 'baseDarkColors palette should declare color properties');
  assert.ok(lightKeys.length > 0, 'baseLightColors palette should declare color properties');
  assert.ok(lowLightKeys.length > 0, 'baseLowLightColors palette should declare color properties');
  assert.ok(
    parchmentKeys.length > 0,
    'baseParchmentColors palette should declare color properties'
  );
  assert.ok(midnightKeys.length > 0, 'baseMidnightColors palette should declare color properties');

  const expectedKeys = [...darkKeys].sort();
  for (const [paletteName, paletteKeys] of [
    ['baseLightColors', lightKeys],
    ['baseLowLightColors', lowLightKeys],
    ['baseParchmentColors', parchmentKeys],
    ['baseMidnightColors', midnightKeys],
  ] as const) {
    assert.deepEqual(
      [...paletteKeys].sort(),
      expectedKeys,
      `${paletteName} must define the same keys as baseDarkColors`
    );
  }
});

test('ThemeContext exports theme palettes and appearance options as named constants', () => {
  const source = readThemeSource();

  assert.match(
    source,
    /export\s*\{[^}]*baseDarkColors\s+as\s+darkColors/,
    'darkColors must be a named export'
  );
  assert.match(
    source,
    /export\s*\{[^}]*baseLightColors\s+as\s+lightColors/,
    'lightColors must be a named export'
  );
  assert.match(
    source,
    /export\s*\{[^}]*baseLowLightColors\s+as\s+lowLightColors/,
    'lowLightColors must be a named export'
  );
  assert.match(source, /appearancePaletteOptions/, 'appearancePaletteOptions must be exported');
});

test('ThemeContext supports the low-light theme mode', () => {
  const source = readThemeSource();

  assert.match(source, /'low-light'/, 'ThemeContext should reference low-light as a theme mode');
  assert.match(
    source,
    /baseLowLightColors/,
    'ThemeContext should reference the baseLowLightColors palette'
  );
});

test('Light-family accents (primaryDeep) stay readable on light surfaces', () => {
  const source = readThemeSource();
  const paletteSource = readFileSync(
    fileURLToPath(new URL('../constants/appearancePalettes.ts', import.meta.url).href),
    'utf8'
  );

  // Light-family modes (light, parchment) render accents via the palette's
  // `primaryDeep` variant. Each must be readable on both light backgrounds.
  const deepAccents = [...paletteSource.matchAll(/primaryDeep:\s*'(#[A-Fa-f0-9]{6})'/g)].map(
    (match) => match[1]
  );
  assert.ok(deepAccents.length >= 4, 'each appearance palette should define a primaryDeep accent');

  const lightBackground = extractColorToken(source, 'baseLightColors', 'background');
  const lightCard = extractColorToken(source, 'baseLightColors', 'cardBackground');
  const parchmentBackground = extractColorToken(source, 'baseParchmentColors', 'background');

  assert.ok(lightBackground, 'Light theme should define a page background');
  assert.ok(lightCard, 'Light theme should define a card background');
  assert.ok(parchmentBackground, 'Parchment theme should define a page background');

  for (const accent of deepAccents) {
    assert.ok(
      colorContrastRatio(accent, lightBackground) >= 4.5,
      `Deep accent ${accent} must be readable on the light page background`
    );
    assert.ok(
      colorContrastRatio(accent, lightCard) >= 4.5,
      `Deep accent ${accent} must be readable on light card backgrounds`
    );
    assert.ok(
      colorContrastRatio(accent, parchmentBackground) >= 4.5,
      `Deep accent ${accent} must be readable on the parchment background`
    );
  }
});

test('ThemeContext defines four appearance palette options with preview swatches', () => {
  const source = readThemeSource();

  assert.match(source, /id:\s*'ember'/, 'Ember palette should be present');
  assert.match(source, /id:\s*'sapphire'/, 'Sapphire palette should be present');
  assert.match(source, /id:\s*'teal'/, 'Teal palette should be present');
  assert.match(source, /id:\s*'olive'/, 'Olive palette should be present');
  assert.match(source, /previewColors:/, 'Palette options should define preview colors');
});

test('ThemeContext exposes isDark and isLowLight flags', () => {
  const source = readThemeSource();

  assert.match(source, /isDark/, 'ThemeContextValue should include isDark');
  assert.match(source, /isLowLight/, 'ThemeContextValue should include isLowLight');
});

test('ThemeContext resolves themeMode from stored preference with warm-ink dark fallback', () => {
  const source = readThemeSource();

  assert.match(source, /preferences\.theme/, 'should read theme from stored preferences');
  assert.match(source, /storedTheme\s*\?\?\s*'dark'/, 'new users should default to dark');
});

// ---------------------------------------------------------------------------
// S16 — Supabase client URL validation (pure logic via source inspection)
// ---------------------------------------------------------------------------

test('Supabase client validates URL by requiring https protocol', () => {
  const clientSource = readFileSync(
    fileURLToPath(new URL('../services/supabase/client.ts', import.meta.url).href),
    'utf8'
  );

  assert.match(
    clientSource,
    // Accept either the WHATWG URL protocol check or a direct https:// scheme
    // test — both enforce the https: protocol for the Supabase URL.
    /url\.protocol === ['"]https:['"]|protocol.*https|\/\^https:\\\/\\\//,
    'client.ts must enforce the https: protocol when validating the Supabase URL'
  );
});

test('Supabase client falls back gracefully when env vars are absent', () => {
  const clientSource = readFileSync(
    fileURLToPath(new URL('../services/supabase/client.ts', import.meta.url).href),
    'utf8'
  );

  // The file should default to an empty string (not throw) when vars are missing
  assert.match(
    clientSource,
    /\|\|\s*['"]{2}/,
    'client.ts should fall back to an empty string for missing env vars'
  );
});

test('isSupabaseConfigured is exported so callers can guard network calls', () => {
  const clientSource = readFileSync(
    fileURLToPath(new URL('../services/supabase/client.ts', import.meta.url).href),
    'utf8'
  );

  assert.match(
    clientSource,
    /export\s+const\s+isSupabaseConfigured/,
    'client.ts must export isSupabaseConfigured'
  );
});
