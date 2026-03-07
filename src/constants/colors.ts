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
  accent: '#e35d5b',
  accentGreen: '#e35d5b',
  accentPrimary: '#e35d5b',
  accentSecondary: '#d0c2af',
  accentTertiary: '#868b95',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#e35d5b',
  tibetanMaroonLight: '#d55b57',
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
  bibleAccent: '#e35d5b',
  bibleControlBackground: '#f5f2ea',
} as const;

export type ColorKey = keyof typeof colors;
