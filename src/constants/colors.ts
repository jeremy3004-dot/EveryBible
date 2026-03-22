// Global app palette aligned to the premium Bible reader theme
export const colors = {
  // Background colors
  background: '#101113',
  cardBackground: '#17191d',
  cardBorder: '#262a31',

  // Text colors
  primaryText: '#f5f2ea',
  secondaryText: '#a09b93',

  // Accent colors
  accent: '#C0392B',
  accentGreen: '#C0392B',
  accentPrimary: '#C0392B',
  accentSecondary: '#d0c2af',
  accentTertiary: '#868b95',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#C0392B',
  tibetanMaroonLight: '#A03025',
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
  bibleBackground: '#101113',
  bibleSurface: '#17191d',
  bibleElevatedSurface: '#1d2026',
  bibleDivider: '#2a2f37',
  biblePrimaryText: '#f5f2ea',
  bibleSecondaryText: '#a09b93',
  bibleAccent: '#C0392B',
  bibleControlBackground: '#f5f2ea',
} as const;

export type ColorKey = keyof typeof colors;
