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

// ---------------------------------------------------------------------------
// S16 — Theme palette completeness and consistency
// ---------------------------------------------------------------------------

test('baseDarkColors, baseLightColors, and baseLowLightColors all declare the same set of color keys', () => {
  const source = readThemeSource();

  const darkKeys = extractPaletteKeys(source, 'baseDarkColors');
  const lightKeys = extractPaletteKeys(source, 'baseLightColors');
  const lowLightKeys = extractPaletteKeys(source, 'baseLowLightColors');

  assert.ok(darkKeys.length > 0, 'baseDarkColors palette should declare color properties');
  assert.ok(lightKeys.length > 0, 'baseLightColors palette should declare color properties');
  assert.ok(lowLightKeys.length > 0, 'baseLowLightColors palette should declare color properties');

  assert.deepEqual(
    [...darkKeys].sort(),
    [...lightKeys].sort(),
    'baseLightColors must define the same keys as baseDarkColors'
  );
  assert.deepEqual(
    [...darkKeys].sort(),
    [...lowLightKeys].sort(),
    'baseLowLightColors must define the same keys as baseDarkColors'
  );
});

test('ThemeContext exports all three palettes and appearance options as named constants', () => {
  const source = readThemeSource();

  assert.match(source, /export\s*\{[^}]*baseDarkColors\s+as\s+darkColors/, 'darkColors must be a named export');
  assert.match(source, /export\s*\{[^}]*baseLightColors\s+as\s+lightColors/, 'lightColors must be a named export');
  assert.match(source, /export\s*\{[^}]*baseLowLightColors\s+as\s+lowLightColors/, 'lowLightColors must be a named export');
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

test('ThemeContext resolves themeMode from stored preference with system fallback', () => {
  const source = readThemeSource();

  // Must read preferences.theme and fall back to systemColorScheme
  assert.match(source, /preferences\.theme/, 'should read theme from stored preferences');
  assert.match(source, /systemColorScheme/, 'should fall back to system color scheme');
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
    /url\.protocol === ['"]https:['"]|protocol.*https/,
    "client.ts must enforce the https: protocol when validating the Supabase URL"
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
