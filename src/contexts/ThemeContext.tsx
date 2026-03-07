import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '../stores/authStore';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  cardBorder: string;
  primaryText: string;
  secondaryText: string;
  accentGreen: string; // Legacy alias for backward compatibility
  accentPrimary: string; // Primary accent
  accentSecondary: string; // Secondary accent
  accentTertiary: string; // Tertiary accent
  tabActive: string;
  tabInactive: string;
  error: string;
  success: string;
  warning: string;
  overlay: string;
  bibleBackground: string;
  bibleSurface: string;
  bibleElevatedSurface: string;
  bibleDivider: string;
  biblePrimaryText: string;
  bibleSecondaryText: string;
  bibleAccent: string;
  bibleControlBackground: string;
}

// Global dark palette inspired by premium Bible reading apps with charcoal neutrals
const darkColors: ThemeColors = {
  background: '#101113',
  cardBackground: '#17191d',
  cardBorder: '#262a31',
  primaryText: '#f5f2ea',
  secondaryText: '#a09b93',
  accentGreen: '#e35d5b', // Legacy alias for existing components
  accentPrimary: '#e35d5b',
  accentSecondary: '#d0c2af',
  accentTertiary: '#868b95',
  tabActive: '#f5f2ea',
  tabInactive: '#7e8188',
  error: '#ff7b72',
  success: '#80c16f',
  warning: '#d0a35a',
  overlay: 'rgba(0, 0, 0, 0.6)',
  bibleBackground: '#101113',
  bibleSurface: '#17191d',
  bibleElevatedSurface: '#1d2026',
  bibleDivider: '#2a2f37',
  biblePrimaryText: '#f5f2ea',
  bibleSecondaryText: '#a09b93',
  bibleAccent: '#e35d5b',
  bibleControlBackground: '#f5f2ea',
};

// Light mode keeps the same visual direction with softer parchment surfaces
const lightColors: ThemeColors = {
  background: '#f4efe8',
  cardBackground: '#fffaf2',
  cardBorder: '#ddd1c0',
  primaryText: '#1d2027',
  secondaryText: '#766f64',
  accentGreen: '#d55b57',
  accentPrimary: '#d55b57',
  accentSecondary: '#8c7558',
  accentTertiary: '#6e7f9e',
  tabActive: '#1d2027',
  tabInactive: '#9a9186',
  error: '#d55b57',
  success: '#6e9f5c',
  warning: '#b98b46',
  overlay: 'rgba(0, 0, 0, 0.24)',
  bibleBackground: '#f6f0e5',
  bibleSurface: '#ffffff',
  bibleElevatedSurface: '#efe6d8',
  bibleDivider: '#ddd1c0',
  biblePrimaryText: '#1d2027',
  bibleSecondaryText: '#766f64',
  bibleAccent: '#d55b57',
  bibleControlBackground: '#1d2027',
};

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const isDark = useMemo(() => {
    // Use user preference if set, otherwise use system preference
    if (preferences.theme === 'dark') return true;
    if (preferences.theme === 'light') return false;
    return systemColorScheme === 'dark';
  }, [preferences.theme, systemColorScheme]);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const toggleTheme = useCallback(() => {
    setPreferences({ theme: isDark ? 'light' : 'dark' });
  }, [isDark, setPreferences]);

  const value = useMemo(
    () => ({
      colors,
      isDark,
      toggleTheme,
    }),
    [colors, isDark, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Export static colors for use outside of React context (e.g., in styles)
export { darkColors, lightColors };
