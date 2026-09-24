import test, { afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';
import { assertDefined } from '../utils/assertDefined';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import type { UserPreferences } from '../types';
import {
  APPEARANCE_PALETTE_IDS,
  APPEARANCE_PALETTES,
  DEFAULT_APPEARANCE_PALETTE,
} from '../constants/appearancePalettes';
import { DEFAULT_THEME_MODE, THEME_MODES, resolveThemeMode } from '../design/themeMode';
import {
  defaultAuthPreferences,
  sanitizeUserPreferences,
} from '../stores/persistedStateSanitizers';
import { mergePreferences } from '../services/sync/syncMerge';

// The real ThemeContext, loaded with `react` replaced by the shared hook runtime and the
// auth store by a mutable preferences object. The provider's value comes from
// useThemeContextValue, so it is mounted as a hook rather than rendered.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let preferences: Partial<UserPreferences> = {};
const setPreferencesCalls: Partial<UserPreferences>[] = [];
const authState = {
  get preferences() {
    return preferences;
  },
  setPreferences: (update: Partial<UserPreferences>) => {
    setPreferencesCalls.push(update);
  },
};
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: <T>(selector: (state: typeof authState) => T) => selector(authState),
});

type ThemeModule = typeof import('./ThemeContext');
let theme: ThemeModule;

before(async () => {
  theme = await import('./ThemeContext');
});

afterEach(() => {
  runtime.unmountAll();
  preferences = {};
  setPreferencesCalls.length = 0;
});

const themeFor = (stored: Partial<UserPreferences>) => {
  preferences = stored;
  return runtime.mount(theme.useThemeContextValue).result;
};

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [...hex.matchAll(/[A-Fa-f0-9]{2}/g)]
      .map(([channel]) => parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
      );
    const channel = (index: number) => assertDefined(channels[index], `channel ${index} of ${hex}`);
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

test('both base scopes declare the same set of color keys', () => {
  assert.deepEqual(Object.keys(theme.lightColors).sort(), Object.keys(theme.darkColors).sort());
  assert.ok(Object.keys(theme.darkColors).length > 0);
});

test('the dead palette-options export stays deleted', () => {
  assert.equal('appearancePaletteOptions' in theme, false);
});

test('the design system ships exactly the vellum and Field dark scopes', () => {
  assert.deepEqual([...THEME_MODES], ['dark', 'light']);
});

test('both scopes declare the EL status and muted tokens the redesign added', () => {
  const expected: Record<string, [string, string]> = {
    // token: [light value, dark value]
    muted: ['#EAE6DD', '#221F19'],
    successSoft: ['#C9EBD3', '#12321E'],
    onSuccessSoft: ['#1F6A3F', '#8FD8A6'],
    warningSoft: ['#F6E3CC', '#3A2A12'],
    // `warning` itself is only 2.83:1 on vellum, so amber words use this.
    onWarningSoft: ['#8D4F11', '#EFBF7B'],
    // Verse numbers on the audio follow band; bibleSecondaryText was 3.18:1 there.
    bibleFollowVerseNumber: ['#494437', '#B7B1A4'],
    onAccentSurface: ['#9F503B', '#F0C8B8'],
  };
  const light = theme.lightColors as unknown as Record<string, string>;
  const dark = theme.darkColors as unknown as Record<string, string>;

  for (const [token, [lightValue, darkValue]] of Object.entries(expected)) {
    assert.equal(light[token], lightValue, `vellum ${token} should be ${lightValue}`);
    assert.equal(dark[token], darkValue, `Field dark ${token} should be ${darkValue}`);
  }
});

test('the vellum accent (primaryDeep) of every palette is readable on page and card', () => {
  for (const palette of APPEARANCE_PALETTES) {
    const colors = theme.createThemeColors('light', palette.id);
    assert.equal(colors.accentPrimary, palette.swatches.primaryDeep);
    assert.ok(
      contrastRatio(colors.accentPrimary, theme.lightColors.background) >= 4.5,
      `${palette.id} accent must be readable on the vellum page`
    );
    assert.ok(
      contrastRatio(colors.accentPrimary, theme.lightColors.cardBackground) >= 4.5,
      `${palette.id} accent must be readable on lit-paper cards`
    );
  }
});

test('every palette carries its own selected-surface pair into both scopes', () => {
  // accentSurface/onAccentSurface are the "you are here" fill and its foreground
  // (tab pill, chips, avatar wells); they travel with the palette.
  for (const palette of APPEARANCE_PALETTES) {
    const light = theme.createThemeColors('light', palette.id);
    const dark = theme.createThemeColors('dark', palette.id);

    assert.equal(light.accentSurface, palette.swatches.lightAccentSurface);
    assert.equal(light.onAccentSurface, palette.swatches.lightOnAccentSurface);
    assert.equal(dark.accentSurface, palette.swatches.darkAccentSurface);
    assert.equal(dark.onAccentSurface, palette.swatches.darkOnAccentSurface);
    // The active tab glyph is the accent-surface foreground, not a copy of the accent.
    assert.equal(light.tabActive, light.onAccentSurface);
    assert.equal(dark.tabActive, dark.onAccentSurface);
  }
});

test('terracotta keeps the stored el-blue id and default; retired ids stay retired', () => {
  assert.deepEqual([...APPEARANCE_PALETTE_IDS], ['el-blue', 'el-blue-brand']);
  assert.equal(DEFAULT_APPEARANCE_PALETTE, 'el-blue');
  for (const retired of ['ember', 'sapphire', 'teal', 'olive']) {
    assert.ok(!APPEARANCE_PALETTES.some((palette) => palette.id === retired), retired);
  }
});

// ---------------------------------------------------------------------------
// Resolving the stored preference
// ---------------------------------------------------------------------------

test('a stored theme preference picks the scope, and isDark follows it', () => {
  const dark = themeFor({ theme: 'dark', appearancePalette: 'el-blue' });
  assert.equal(dark.themeMode, 'dark');
  assert.equal(dark.isDark, true);
  assert.deepEqual(dark.colors, theme.createThemeColors('dark', 'el-blue'));

  const light = themeFor({ theme: 'light', appearancePalette: 'el-blue-brand' });
  assert.equal(light.themeMode, 'light');
  assert.equal(light.isDark, false);
  assert.equal(light.appearancePalette, 'el-blue-brand');
  assert.equal('isLowLight' in light, false, 'isLowLight went with the low-light mode');
});

test('a missing preference opens on vellum with the default accent', () => {
  const value = themeFor({});

  assert.equal(DEFAULT_THEME_MODE, 'light');
  assert.equal(value.themeMode, 'light');
  assert.equal(value.appearancePalette, DEFAULT_APPEARANCE_PALETTE);
});

test('a retired theme or palette falls back at the provider, the sanitizer and sync', () => {
  for (const retired of ['low-light', 'parchment', 'midnight']) {
    const value = themeFor({ theme: retired as UserPreferences['theme'] });
    assert.equal(value.themeMode, 'light', `provider: ${retired}`);
    assert.equal(resolveThemeMode(retired), 'light', `resolver: ${retired}`);
    assert.equal(
      sanitizeUserPreferences({ theme: retired }).theme,
      'light',
      `sanitizer: ${retired}`
    );

    const merged = mergePreferences(
      { preferences: defaultAuthPreferences, updatedAt: '2026-01-01T00:00:00.000Z' },
      {
        id: 'prefs-1',
        user_id: 'user-1',
        font_size: 'medium',
        theme: retired,
        appearance_palette: 'ember',
        language: 'en',
        synced_at: '2026-09-01T00:00:00.000Z',
      } as Parameters<typeof mergePreferences>[1]
    );
    assert.equal(merged.preferences.theme, 'light', `sync: ${retired}`);
    assert.equal(merged.preferences.appearancePalette, DEFAULT_APPEARANCE_PALETTE);
  }

  assert.equal(themeFor({ appearancePalette: 'ember' as never }).appearancePalette, 'el-blue');
});

test('the theme actions write the preference', () => {
  const value = themeFor({ theme: 'dark' });

  value.toggleTheme();
  value.setTheme('dark');
  value.setAppearancePalette('el-blue-brand');

  assert.deepEqual(setPreferencesCalls, [
    { theme: 'light' },
    { theme: 'dark' },
    { appearancePalette: 'el-blue-brand' },
  ]);
});
