// Legacy global palette — mirrors the warm-ink dark theme from ThemeContext so
// any code still importing this static table stays in sync with the live theme.
// Prefer useTheme() tokens in components; this exists only for backward compat.
export const colors = {
  // Background colors
  background: '#161412',
  cardBackground: '#1E1B18',
  cardBorder: 'rgba(242, 237, 227, 0.08)',

  // Text colors
  primaryText: '#F2EDE3',
  secondaryText: '#A8A094',

  // Accent colors — Illuminated ember (default palette, dark-family primary)
  accent: '#D96C57',
  accentGreen: '#D96C57', // Legacy name — actual brand color
  accentPrimary: '#D96C57',
  accentSecondary: '#E08573',
  accentTertiary: '#A39B8F',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#D96C57',
  tibetanMaroonLight: '#E08573',
  saffronGold: '#d0c2af',
  saffronGoldLight: '#8c7558',
  skyBlue: '#A39B8F',
  skyBlueLight: '#6e7f9e',

  // Tab colors
  tabActive: '#F2EDE3',
  tabInactive: '#857D72',

  // Additional utility colors
  error: '#ff7b72',
  success: '#80c16f',
  warning: '#d0a35a',

  // Overlay
  overlay: 'rgba(12, 10, 8, 0.6)',

  // Premium Bible experience palette
  bibleBackground: '#161412',
  bibleSurface: '#1E1B18',
  bibleElevatedSurface: '#262220',
  bibleDivider: 'rgba(242, 237, 227, 0.08)',
  biblePrimaryText: '#F2EDE3',
  bibleSecondaryText: '#A8A094',
  bibleAccent: '#D96C57',
  bibleControlBackground: '#F2EDE3',
} as const;

export type ColorKey = keyof typeof colors;
