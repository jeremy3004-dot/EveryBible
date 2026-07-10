import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import type { AppearancePaletteId } from '../constants/appearancePalettes';
import {
  APPEARANCE_PALETTES,
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../constants/appearancePalettes';

export type ThemeMode = 'dark' | 'light' | 'low-light' | 'parchment' | 'midnight';

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
  onAccent: string;
  error: string;
  success: string;
  warning: string;
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
}

export interface AppearancePaletteOption {
  id: AppearancePaletteId;
  labelKey: string;
  descriptionKey: string;
  previewColors: [string, string, string];
}

interface ThemeContextValue {
  colors: ThemeColors;
  themeMode: ThemeMode;
  appearancePalette: AppearancePaletteId;
  isDark: boolean;
  isLowLight: boolean;
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

// Convert a #RRGGBB hex to an rgba() string at the given alpha. Used for the
// soft tinted accent fill (accentSoft) so a single accent hue drives both solid
// and 12–14% wash treatments without shipping a second token per palette.
const withAlpha = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const ACCENT_SOFT_ALPHA = 0.13;

// Placeholder accent fill for the base palette literals below — every value here
// is overwritten by createThemeColors() with the mode-aware accent, but the keys
// must exist so each base palette satisfies ThemeColors.
const defaultPaletteColors = {
  accentPrimary: defaultPaletteSwatches.primary,
  accentSecondary: defaultPaletteSwatches.secondary,
  accentGreen: defaultPaletteSwatches.primary,
  accentTertiary: defaultPaletteSwatches.tertiary,
  accentSoft: withAlpha(defaultPaletteSwatches.primary, ACCENT_SOFT_ALPHA),
  onAccent: onAccentDark,
  bibleAccent: defaultPaletteSwatches.primary,
} as const;

// Warm ink — the default surface for new users. Ink-on-near-black paper with
// hairline alpha borders; surfaces separate by tone, not lines.
const baseDarkColors: ThemeColors = {
  background: '#161412',
  cardBackground: '#1E1B18',
  cardBorder: 'rgba(242, 237, 227, 0.08)',
  borderStrong: 'rgba(242, 237, 227, 0.14)',
  primaryText: '#F2EDE3',
  secondaryText: '#A8A094',
  textTertiary: 'rgba(242, 237, 227, 0.45)',
  ...defaultPaletteColors,
  error: '#FF7B72',
  success: '#80C16F',
  warning: '#D0A35A',
  overlay: 'rgba(12, 10, 8, 0.6)',
  tabActive: '#F2EDE3',
  tabInactive: '#857D72',
  bibleBackground: '#161412',
  bibleSurface: '#1E1B18',
  bibleElevatedSurface: '#262220',
  bibleDivider: 'rgba(242, 237, 227, 0.08)',
  biblePrimaryText: '#F2EDE3',
  bibleSecondaryText: '#A8A094',
  bibleControlBackground: '#F2EDE3',
};

// Warm paper — light mode reads as a printed page, not a white app chrome.
const baseLightColors: ThemeColors = {
  background: '#FAF7F1',
  cardBackground: '#FFFFFF',
  cardBorder: 'rgba(60, 50, 36, 0.1)',
  borderStrong: 'rgba(60, 50, 36, 0.16)',
  primaryText: '#211D18',
  secondaryText: '#6E665B',
  textTertiary: 'rgba(33, 29, 24, 0.45)',
  ...defaultPaletteColors,
  error: '#C43F3A',
  success: '#247756',
  warning: '#9A6A24',
  overlay: 'rgba(33, 29, 24, 0.32)',
  tabActive: '#211D18',
  tabInactive: '#8C8375',
  bibleBackground: '#FAF7F1',
  bibleSurface: '#FFFFFF',
  bibleElevatedSurface: '#F3EEE5',
  bibleDivider: 'rgba(60, 50, 36, 0.1)',
  biblePrimaryText: '#211D18',
  bibleSecondaryText: '#6E665B',
  bibleControlBackground: '#211D18',
};

const baseLowLightColors: ThemeColors = {
  background: '#18130F',
  cardBackground: '#221B17',
  cardBorder: 'rgba(244, 232, 215, 0.1)',
  borderStrong: 'rgba(244, 232, 215, 0.16)',
  primaryText: '#F4E8D7',
  secondaryText: '#C6B7A5',
  textTertiary: 'rgba(244, 232, 215, 0.45)',
  ...defaultPaletteColors,
  error: '#E96B63',
  success: '#89C98A',
  warning: '#D1A05B',
  overlay: 'rgba(0, 0, 0, 0.52)',
  tabActive: '#F4E8D7',
  tabInactive: '#908679',
  bibleBackground: '#18130F',
  bibleSurface: '#221B17',
  bibleElevatedSurface: '#2A221D',
  bibleDivider: 'rgba(244, 232, 215, 0.1)',
  biblePrimaryText: '#F4E8D7',
  bibleSecondaryText: '#C6B7A5',
  bibleControlBackground: '#F4E8D7',
};

const baseParchmentColors: ThemeColors = {
  background: '#F4E9D2',
  cardBackground: '#FFF9ED',
  cardBorder: 'rgba(74, 56, 34, 0.16)',
  borderStrong: 'rgba(74, 56, 34, 0.24)',
  primaryText: '#241A12',
  secondaryText: '#756651',
  textTertiary: 'rgba(36, 26, 18, 0.45)',
  ...defaultPaletteColors,
  error: '#B44139',
  success: '#397A54',
  warning: '#9C6E2E',
  overlay: 'rgba(30, 22, 14, 0.36)',
  tabActive: '#241A12',
  tabInactive: '#7D6F5C',
  bibleBackground: '#F4E9D2',
  bibleSurface: '#FFF7E8',
  bibleElevatedSurface: '#EBDCC2',
  bibleDivider: 'rgba(74, 56, 34, 0.16)',
  biblePrimaryText: '#241A12',
  bibleSecondaryText: '#756651',
  bibleControlBackground: '#241A12',
};

// Cool navy — a deliberate night option; the only non-warm base palette.
const baseMidnightColors: ThemeColors = {
  background: '#080B12',
  cardBackground: '#101623',
  cardBorder: 'rgba(190, 205, 235, 0.1)',
  borderStrong: 'rgba(190, 205, 235, 0.16)',
  primaryText: '#F2F6FF',
  secondaryText: '#A5B0C3',
  textTertiary: 'rgba(242, 246, 255, 0.45)',
  ...defaultPaletteColors,
  error: '#FF7B72',
  success: '#7FCB9B',
  warning: '#D5A65D',
  overlay: 'rgba(0, 0, 0, 0.66)',
  tabActive: '#F2F6FF',
  tabInactive: '#7E899A',
  bibleBackground: '#080B12',
  bibleSurface: '#101623',
  bibleElevatedSurface: '#172033',
  bibleDivider: 'rgba(190, 205, 235, 0.1)',
  biblePrimaryText: '#F2F6FF',
  bibleSecondaryText: '#A5B0C3',
  bibleControlBackground: '#F2F6FF',
};

// Light-family modes (paper + parchment) use the deep accent so it reads on a
// light surface; dark-family modes use the lighter pastel primary.
const LIGHT_FAMILY_MODES: ReadonlySet<ThemeMode> = new Set(['light', 'parchment']);

const createThemeColors = (mode: ThemeMode, paletteId: AppearancePaletteId): ThemeColors => {
  const palette =
    APPEARANCE_PALETTES.find((entry) => entry.id === paletteId)?.swatches ?? defaultPaletteSwatches;

  const isLightFamily = LIGHT_FAMILY_MODES.has(mode);
  const accentBase = isLightFamily ? palette.primaryDeep : palette.primary;

  const accentTokens = {
    accentPrimary: accentBase,
    accentSecondary: palette.secondary,
    accentGreen: accentBase,
    accentTertiary: palette.tertiary,
    accentSoft: withAlpha(accentBase, ACCENT_SOFT_ALPHA),
    onAccent: isLightFamily ? onAccentLight : onAccentDark,
    bibleAccent: accentBase,
  };

  if (mode === 'light') {
    return { ...baseLightColors, ...accentTokens };
  }

  if (mode === 'low-light') {
    return { ...baseLowLightColors, ...accentTokens };
  }

  if (mode === 'parchment') {
    return { ...baseParchmentColors, ...accentTokens };
  }

  if (mode === 'midnight') {
    return { ...baseMidnightColors, ...accentTokens };
  }

  return { ...baseDarkColors, ...accentTokens };
};

export {
  baseDarkColors as darkColors,
  baseLightColors as lightColors,
  baseLowLightColors as lowLightColors,
  baseParchmentColors as parchmentColors,
  baseMidnightColors as midnightColors,
};
export type { AppearancePaletteId } from '../constants/appearancePalettes';

export const appearancePaletteOptions: AppearancePaletteOption[] = [
  {
    id: 'ember',
    labelKey: 'settings.appearanceEmberTitle',
    descriptionKey: 'settings.appearanceEmberBody',
    previewColors: ['#D96C57', '#E08573', '#A39B8F'],
  },
  {
    id: 'sapphire',
    labelKey: 'settings.appearanceSapphireTitle',
    descriptionKey: 'settings.appearanceSapphireBody',
    previewColors: ['#7E96F2', '#9DB0F6', '#6C7FA6'],
  },
  {
    id: 'teal',
    labelKey: 'settings.appearanceTealTitle',
    descriptionKey: 'settings.appearanceTealBody',
    previewColors: ['#4AA5A1', '#7BC4C0', '#4E8AA0'],
  },
  {
    id: 'olive',
    labelKey: 'settings.appearanceOliveTitle',
    descriptionKey: 'settings.appearanceOliveBody',
    previewColors: ['#8FAF52', '#A9C374', '#7E8B65'],
  },
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const storedTheme = ['dark', 'light', 'low-light', 'parchment', 'midnight'].includes(
    preferences.theme
  )
    ? preferences.theme
    : null;
  // New users default to warm-ink dark; existing saved preferences are untouched.
  const themeMode: ThemeMode = storedTheme ?? 'dark';

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
      isLowLight: themeMode === 'low-light',
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
