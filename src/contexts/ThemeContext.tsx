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
  primaryText: string;
  secondaryText: string;
  accentPrimary: string;
  accentSecondary: string;
  accentGreen: string;
  accentTertiary: string;
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
const accentContrast = '#FDFAF5';

const defaultPaletteColors = {
  accentPrimary: defaultPaletteSwatches.primary,
  accentSecondary: defaultPaletteSwatches.secondary,
  accentGreen: defaultPaletteSwatches.primary,
  accentTertiary: defaultPaletteSwatches.tertiary,
  onAccent: accentContrast,
  bibleAccent: defaultPaletteSwatches.primary,
} as const;

const baseDarkColors: ThemeColors = {
  background: '#101113',
  cardBackground: '#17191D',
  cardBorder: '#262A31',
  primaryText: '#F5F2EA',
  secondaryText: '#A09B93',
  ...defaultPaletteColors,
  error: '#FF7B72',
  success: '#80C16F',
  warning: '#D0A35A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabActive: '#F5F2EA',
  tabInactive: '#7E8188',
  bibleBackground: '#101113',
  bibleSurface: '#17191D',
  bibleElevatedSurface: '#1D2026',
  bibleDivider: '#2A2F37',
  biblePrimaryText: '#F5F2EA',
  bibleSecondaryText: '#A09B93',
  bibleControlBackground: '#F5F2EA',
};

const baseLightColors: ThemeColors = {
  background: '#FBF6EC',
  cardBackground: '#FFFDFC',
  cardBorder: '#E7DCC9',
  primaryText: '#1C1713',
  secondaryText: '#6B6258',
  ...defaultPaletteColors,
  error: '#C8453D',
  success: '#2D7A56',
  warning: '#A97834',
  overlay: 'rgba(0, 0, 0, 0.34)',
  tabActive: '#1C1713',
  tabInactive: '#7B7166',
  bibleBackground: '#FBF6EC',
  bibleSurface: '#FFFDFC',
  bibleElevatedSurface: '#F4EBDD',
  bibleDivider: '#E1D6C4',
  biblePrimaryText: '#1C1713',
  bibleSecondaryText: '#6B6258',
  bibleControlBackground: '#1C1713',
};

const baseLowLightColors: ThemeColors = {
  background: '#18130F',
  cardBackground: '#221B17',
  cardBorder: '#352B25',
  primaryText: '#F4E8D7',
  secondaryText: '#C6B7A5',
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
  bibleDivider: '#352B25',
  biblePrimaryText: '#F4E8D7',
  bibleSecondaryText: '#C6B7A5',
  bibleControlBackground: '#F4E8D7',
};

const baseParchmentColors: ThemeColors = {
  background: '#F4E9D2',
  cardBackground: '#FFF9ED',
  cardBorder: '#DECDAF',
  primaryText: '#241A12',
  secondaryText: '#756651',
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
  bibleDivider: '#DAC7A8',
  biblePrimaryText: '#241A12',
  bibleSecondaryText: '#756651',
  bibleControlBackground: '#241A12',
};

const baseMidnightColors: ThemeColors = {
  background: '#080B12',
  cardBackground: '#101623',
  cardBorder: '#212B3D',
  primaryText: '#F2F6FF',
  secondaryText: '#A5B0C3',
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
  bibleDivider: '#233049',
  biblePrimaryText: '#F2F6FF',
  bibleSecondaryText: '#A5B0C3',
  bibleControlBackground: '#F2F6FF',
};

const createThemeColors = (mode: ThemeMode, paletteId: AppearancePaletteId): ThemeColors => {
  const palette =
    APPEARANCE_PALETTES.find((entry) => entry.id === paletteId)?.swatches ?? defaultPaletteSwatches;

  const accentTokens = {
    accentPrimary: palette.primary,
    accentSecondary: palette.secondary,
    accentGreen: palette.primary,
    accentTertiary: palette.tertiary,
    bibleAccent: palette.primary,
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
    previewColors: ['#A23A2A', '#D26A5C', '#8F5A46'],
  },
  {
    id: 'sapphire',
    labelKey: 'settings.appearanceSapphireTitle',
    descriptionKey: 'settings.appearanceSapphireBody',
    previewColors: ['#2F5BEA', '#6E84F4', '#4B6792'],
  },
  {
    id: 'teal',
    labelKey: 'settings.appearanceTealTitle',
    descriptionKey: 'settings.appearanceTealBody',
    previewColors: ['#0F766E', '#4AA5A1', '#2C6B8D'],
  },
  {
    id: 'olive',
    labelKey: 'settings.appearanceOliveTitle',
    descriptionKey: 'settings.appearanceOliveBody',
    previewColors: ['#4C6B1F', '#7C9A3D', '#66754E'],
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
  const themeMode: ThemeMode = storedTheme ?? 'midnight';

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
