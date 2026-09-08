// Legacy global palette — mirrors the Field dark theme from ThemeContext so any
// code still importing this static table stays in sync with the live theme.
// Prefer useTheme() tokens in components; this exists only for backward compat.
export const colors = {
  // Background colors
  background: '#11110D',
  cardBackground: '#201E18',
  cardBorder: '#464035',

  // Text colors
  primaryText: '#EFEBE1',
  secondaryText: '#B0A99B',

  // Accent colors — Terracotta (default palette, dark-family primary)
  accent: '#D88D74',
  accentGreen: '#D88D74', // Legacy name — actual brand color
  accentPrimary: '#D88D74',
  accentSecondary: '#F0C8B8',
  accentTertiary: '#B0A99B',
  accentSurface: '#492B22',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#D88D74',
  tibetanMaroonLight: '#F0C8B8',
  saffronGold: '#ECE8DF',
  saffronGoldLight: '#69624F',
  skyBlue: '#B0A99B',
  skyBlueLight: '#9F503B',

  // Tab colors
  tabActive: '#F0C8B8',
  tabInactive: '#B0A99B',

  // Additional utility colors
  error: '#E34F5B',
  success: '#62C082',
  warning: '#E9A23F',

  // Overlay
  overlay: 'rgba(17, 17, 13, 0.62)',

  // Premium Bible experience palette
  bibleBackground: '#11110D',
  bibleSurface: '#201E18',
  bibleElevatedSurface: '#2C2821',
  bibleDivider: '#3D382E',
  biblePrimaryText: '#EFEBE1',
  bibleSecondaryText: '#B0A99B',
  bibleAccent: '#D88D74',
  bibleControlBackground: '#EFEBE1',
} as const;

export type ColorKey = keyof typeof colors;
