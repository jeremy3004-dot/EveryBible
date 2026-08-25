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

  // Accent colors — Every Language blue (default palette, dark-family primary)
  accent: '#35A7E9',
  accentGreen: '#35A7E9', // Legacy name — actual brand color
  accentPrimary: '#35A7E9',
  accentSecondary: '#ADDCFF',
  accentTertiary: '#B0A99B',
  accentSurface: '#10384C',

  // Named aliases kept for backward compatibility
  tibetanMaroon: '#35A7E9',
  tibetanMaroonLight: '#ADDCFF',
  saffronGold: '#ECE8DF',
  saffronGoldLight: '#69624F',
  skyBlue: '#B0A99B',
  skyBlueLight: '#0074AD',

  // Tab colors
  tabActive: '#ADDCFF',
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
  bibleAccent: '#35A7E9',
  bibleControlBackground: '#EFEBE1',
} as const;

export type ColorKey = keyof typeof colors;
