import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { resolveThemeMode, type ThemeMode } from '../design/themeMode';
import { hexWithAlpha } from '../utils/color';
import type { AppearancePaletteId } from '../constants/appearancePalettes';
import {
  APPEARANCE_PALETTES,
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../constants/appearancePalettes';

// The Every Language design system ships exactly two scopes: the vellum default
// and `.dark`. The modes the reskin retired, and where a saved preference naming
// one lands, are decided in one place — see src/design/themeMode.ts.
export type { ThemeMode } from '../design/themeMode';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  cardBorder: string;
  borderStrong: string;
  primaryText: string;
  secondaryText: string;
  textTertiary: string;
  accentPrimary: string;
  accentSecondary: string;
  accentGreen: string;
  accentTertiary: string;
  accentSoft: string;
  /** EL `--accent`: a real selected-surface fill, not an alpha wash. */
  accentSurface: string;
  /** EL `--accent-foreground`: the glyph/label colour on `accentSurface`. */
  onAccentSurface: string;
  onAccent: string;
  /** EL `--muted`: an inert, un-tinted well — empty ledger cells, segment tracks. */
  muted: string;
  error: string;
  success: string;
  /** EL `--success-soft` pair: a status chip fill and its own foreground. */
  successSoft: string;
  onSuccessSoft: string;
  warning: string;
  /** EL `--warning-soft`: a missed-day fill, always paired with a `warning` border. */
  warningSoft: string;
  /**
   * The foreground for warning copy — the `--warning-soft` counterpart to
   * `onSuccessSoft`. `warning` itself is a saturated mid-tone that only reaches
   * 2.83:1 on vellum, so it may tint a fill or draw a border but must never be
   * the colour of words. This token clears 4.5:1 on `warningSoft`,
   * `background` and `cardBackground` in both scopes.
   */
  onWarningSoft: string;
  overlay: string;
  tabActive: string;
  tabInactive: string;
  bibleBackground: string;
  bibleSurface: string;
  bibleElevatedSurface: string;
  bibleDivider: string;
  biblePrimaryText: string;
  bibleSecondaryText: string;
  bibleAccent: string;
  bibleControlBackground: string;
  /** Band behind the verse being read aloud. A cool neutral: it separates from
   *  the warm page far better than a warm grey of the same darkness, and keeps
   *  the accent for controls rather than competing with scripture. */
  bibleFollowHighlight: string;
  /**
   * Verse numbers sitting on `bibleFollowHighlight`. `bibleSecondaryText` only
   * reaches 3.18:1 on the light band, so the follow band gets its own quiet
   * foreground rather than borrowing the page's.
   */
  bibleFollowVerseNumber: string;
}

interface ThemeContextValue {
  colors: ThemeColors;
  themeMode: ThemeMode;
  appearancePalette: AppearancePaletteId;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setAppearancePalette: (palette: AppearancePaletteId) => void;
}

const themeContext = createContext<ThemeContextValue | null>(null);

const defaultPalette =
  APPEARANCE_PALETTES.find((palette) => palette.id === DEFAULT_APPEARANCE_PALETTE) ??
  APPEARANCE_PALETTES[0];
const defaultPaletteSwatches = defaultPalette.swatches;

// Dark-family accents are light pastels, so a warm near-black reads on top of
// them; light-family accents are the deep variants, so pure white reads on them.
// Both directions are verified ≥ 4.5:1 in themeColors.test.ts.
const onAccentDark = '#1A140F';
const onAccentLight = '#FFFFFF';

const ACCENT_SOFT_ALPHA = 0.13;

// Placeholder accent fill for the base palette literals below — every value here
// is overwritten by createThemeColors() with the mode-aware accent, but the keys
// must exist so each base palette satisfies ThemeColors.
const defaultPaletteColors = {
  accentPrimary: defaultPaletteSwatches.primary,
  accentSecondary: defaultPaletteSwatches.secondary,
  accentGreen: defaultPaletteSwatches.primary,
  accentTertiary: defaultPaletteSwatches.tertiary,
  accentSoft: hexWithAlpha(defaultPaletteSwatches.primary, ACCENT_SOFT_ALPHA),
  onAccent: onAccentDark,
  bibleAccent: defaultPaletteSwatches.primary,
} as const;

// Field dark — the Every Language design system's own shipped dark scope. Warm
// off-black paper, ink-toned panels lifted by tone rather than lines. Every value
// is the EL token resolved to hex; see the EL kit's tokens/themes.css (.dark).
const baseDarkColors: ThemeColors = {
  background: '#11110D', // --background 48 14% 6%
  cardBackground: '#201E18', // --card 48 13% 11%
  cardBorder: '#464035', // --card-border 40 14% 24%
  borderStrong: '#3D382E', // --border 40 14% 21%
  primaryText: '#EFEBE1', // --foreground 44 30% 91%
  secondaryText: '#B0A99B', // --muted-foreground 40 12% 65%
  textTertiary: '#9A9384', // --text-faint 40 10% 56%
  ...defaultPaletteColors,
  muted: '#221F19', // --muted 45 10% 10%
  error: '#E34F5B', // --danger 355 73% 60%
  success: '#62C082', // --success 140 43% 57%
  successSoft: '#12321E', // --success-soft 147 47% 13%
  onSuccessSoft: '#8FD8A6', // --success-soft-foreground 140 47% 71%
  warning: '#E9A23F', // --warning 35 79% 58%
  warningSoft: '#3A2A12', // --warning-soft 36 53% 15%
  onWarningSoft: '#EFBF7B', // --warning-soft-foreground 35 79% 71%
  overlay: 'rgba(17, 17, 13, 0.62)',
  // accentSurface/onAccentSurface are the terracotta defaults; createThemeColors
  // replaces both with the active palette's dark pair.
  accentSurface: '#492B22',
  onAccentSurface: '#F0C8B8',
  tabActive: '#F0C8B8', // mirrors onAccentSurface — the active tab pill glyph
  tabInactive: '#B0A99B',
  bibleBackground: '#11110D',
  bibleSurface: '#201E18',
  // Reader transport discs sit on --popover so the surface stays close to the
  // page tone and only the glyph carries contrast.
  bibleElevatedSurface: '#2C2821', // --popover 40 14% 15%
  bibleDivider: '#3D382E',
  biblePrimaryText: '#EFEBE1',
  bibleSecondaryText: '#B0A99B',
  // Page-inverse fill for primary CTAs (onboarding Continue, sign-in). Callers
  // pair it with `bibleBackground` as the label colour, so it must stay inverted.
  bibleControlBackground: '#EFEBE1',
  bibleFollowHighlight: '#334152', // 1.8:1 against the near-black page
  bibleFollowVerseNumber: '#B7B1A4', // 4.87:1 on the follow band
};

// Vellum — the canonical EL canvas. Warm paper, never white; lit-paper panels on
// a vellum ground, warm ink rather than a cool gray. EL kit tokens/colors.css.
const baseLightColors: ThemeColors = {
  background: '#F0ECE5', // --vellum 40 26% 92%
  cardBackground: '#FAF9F4', // --vellum-lit 44 40% 97%
  cardBorder: '#CAC5B9', // --card-border 42 14% 76%
  borderStrong: '#D2CEC6', // --border 42 12% 80%
  primaryText: '#1A1914', // --ink 48 13% 9%
  secondaryText: '#69624F', // --graphite 45 14% 36%
  textTertiary: '#6F6958', // --text-faint 45 12% 39%
  ...defaultPaletteColors,
  muted: '#EAE6DD', // --muted 42 22% 89%
  error: '#C62A3A', // --danger 354 65% 47%
  success: '#2E8E5A', // --success 147 51% 37%
  successSoft: '#C9EBD3', // --success-soft 140 47% 85%
  onSuccessSoft: '#1F6A3F', // --success-soft-foreground 147 55% 27%
  warning: '#D27519', // --warning 30 79% 46%
  warningSoft: '#F6E3CC', // --warning-soft 36 68% 88%
  onWarningSoft: '#8D4F11', // --warning-soft-foreground 30 79% 31%
  overlay: 'rgba(26, 25, 20, 0.34)',
  // accentSurface/onAccentSurface are the terracotta defaults; createThemeColors
  // replaces both with the active palette's light pair.
  accentSurface: '#F4E1D8',
  onAccentSurface: '#9F503B',
  tabActive: '#9F503B', // mirrors onAccentSurface — the active tab pill glyph
  tabInactive: '#69624F',
  bibleBackground: '#F0ECE5',
  bibleSurface: '#FAF9F4',
  // Reader controls (chapter pill, transport discs) sit a step DARKER than the
  // vellum page so they read as pressed into the paper rather than lifted off it.
  bibleElevatedSurface: '#E3DED5',
  bibleDivider: '#CAC5B9',
  biblePrimaryText: '#1A1914',
  bibleSecondaryText: '#69624F',
  bibleControlBackground: '#1A1914',
  bibleFollowHighlight: '#B2BDC9', // 1.6:1 against vellum; text stays 9:1
  bibleFollowVerseNumber: '#494437', // 5.09:1 on the follow band
};

// The vellum scope uses the deep accent so terracotta reads on warm paper; Field
// dark uses the lighter primary so it reads on the near-black ground.
const LIGHT_FAMILY_MODES: ReadonlySet<ThemeMode> = new Set(['light']);

const createThemeColors = (mode: ThemeMode, paletteId: AppearancePaletteId): ThemeColors => {
  const palette =
    APPEARANCE_PALETTES.find((entry) => entry.id === paletteId)?.swatches ?? defaultPaletteSwatches;

  const isLightFamily = LIGHT_FAMILY_MODES.has(mode);
  const accentBase = isLightFamily ? palette.primaryDeep : palette.primary;
  // The selected-surface pair travels with the palette, so switching accents
  // moves the tab pill, chips and avatar wells together instead of leaving a
  // terracotta well under a blue glyph.
  const accentSurface = isLightFamily ? palette.lightAccentSurface : palette.darkAccentSurface;
  const onAccentSurface = isLightFamily
    ? palette.lightOnAccentSurface
    : palette.darkOnAccentSurface;

  const accentTokens = {
    accentPrimary: accentBase,
    accentSecondary: isLightFamily ? palette.secondaryDeep : palette.secondary,
    accentGreen: accentBase,
    accentTertiary: palette.tertiary,
    accentSoft: hexWithAlpha(accentBase, ACCENT_SOFT_ALPHA),
    accentSurface,
    onAccentSurface,
    onAccent: isLightFamily ? onAccentLight : onAccentDark,
    // The active tab pill is an accentSurface well, so its glyph is the surface
    // foreground — not a second, drift-prone copy of the accent.
    tabActive: onAccentSurface,
    bibleAccent: accentBase,
  };

  if (mode === 'light') {
    return { ...baseLightColors, ...accentTokens };
  }

  return { ...baseDarkColors, ...accentTokens };
};

export { baseDarkColors as darkColors, baseLightColors as lightColors };
export type { AppearancePaletteId } from '../constants/appearancePalettes';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  // Retired modes fold onto a live scope here rather than leaving the provider
  // in a scope it can no longer render.
  const themeMode: ThemeMode = resolveThemeMode(preferences.theme);

  const appearancePalette: AppearancePaletteId = APPEARANCE_PALETTE_IDS.includes(
    preferences.appearancePalette
  )
    ? preferences.appearancePalette
    : DEFAULT_APPEARANCE_PALETTE;

  const colors = useMemo(
    () => createThemeColors(themeMode, appearancePalette),
    [themeMode, appearancePalette]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      themeMode,
      appearancePalette,
      isDark: themeMode !== 'light',
      setTheme: (mode) => {
        setPreferences({ theme: mode });
      },
      toggleTheme: () => {
        setPreferences({ theme: themeMode === 'dark' ? 'light' : 'dark' });
      },
      setAppearancePalette: (palette) => {
        setPreferences({ appearancePalette: palette });
      },
    }),
    [appearancePalette, colors, setPreferences, themeMode]
  );

  return <themeContext.Provider value={value}>{children}</themeContext.Provider>;
}

export function useTheme() {
  const context = useContext(themeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
