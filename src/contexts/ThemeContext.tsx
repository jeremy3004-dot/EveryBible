import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import type { AppearancePaletteId } from '../constants/appearancePalettes';
import {
  APPEARANCE_PALETTES,
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../constants/appearancePalettes';

export type ThemeMode = 'dark' | 'light' | 'low-light';

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

const defaultPalette = APPEARANCE_PALETTES.find((palette) => palette.id === DEFAULT_APPEARANCE_PALETTE) ?? APPEARANCE_PALETTES[0];
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

  return { ...baseDarkColors, ...accentTokens };
};

export { baseDarkColors as darkColors, baseLightColors as lightColors, baseLowLightColors as lowLightColors };
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
  const systemColorScheme = useColorScheme();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const storedTheme = ['dark', 'light', 'low-light'].includes(preferences.theme)
    ? preferences.theme
    : null;
  const themeMode: ThemeMode =
    storedTheme ?? (systemColorScheme === 'light' ? 'light' : 'dark');

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
