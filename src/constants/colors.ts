// Global app palette — Midnight Crimson theme
export const colors = {
  // Background colors
  background: '#0C0D0F',
  cardBackground: '#15171b',
  cardBorder: '#232529',

  // Text colors
  primaryText: '#f5f2ea',
  secondaryText: '#a09b93',

  // Accent colors — Midnight Crimson: brighter crimson over near-black canvas
  accent: '#C8463C',
  accentGreen: '#C8463C', // Legacy name — actual brand color
  accentPrimary: '#C8463C',
  accentSecondary: '#d0c2af',
  accentTertiary: '#868b95',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#C8463C',
  tibetanMaroonLight: '#e05a50',
  saffronGold: '#d0c2af',
  saffronGoldLight: '#8c7558',
  skyBlue: '#868b95',
  skyBlueLight: '#6e7f9e',

  // Tab colors
  tabActive: '#f5f2ea',
  tabInactive: '#7e8188',

  // Additional utility colors
  error: '#ff7b72',
  success: '#80c16f',
  warning: '#d0a35a',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',

  // Premium Bible experience palette
  bibleBackground: '#0C0D0F',
  bibleSurface: '#15171b',
  bibleElevatedSurface: '#1d2026',
  bibleDivider: '#232529',
  biblePrimaryText: '#f5f2ea',
  bibleSecondaryText: '#a09b93',
  bibleAccent: '#C8463C',
  bibleControlBackground: '#f5f2ea',
} as const;

export type ColorKey = keyof typeof colors;
