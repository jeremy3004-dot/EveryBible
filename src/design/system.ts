import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

const uiFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const readingFontFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});
const readingFontFamilyItalic = Platform.select({
  ios: 'Georgia-Italic',
  android: 'serif',
  default: 'Georgia-Italic',
});

export const typography = {
  screenTitle: {
    fontFamily: uiFontFamily,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
  } satisfies TextStyle,
  pageTitle: {
    fontFamily: uiFontFamily,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: uiFontFamily,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: uiFontFamily,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  } satisfies TextStyle,
  body: {
    fontFamily: uiFontFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: uiFontFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  } satisfies TextStyle,
  label: {
    fontFamily: uiFontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  micro: {
    fontFamily: uiFontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  eyebrow: {
    fontFamily: uiFontFamily,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  button: {
    fontFamily: uiFontFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.1,
  } satisfies TextStyle,
  tabLabel: {
    fontFamily: uiFontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  readingDisplay: {
    fontFamily: readingFontFamilyItalic,
    fontSize: 28,
    lineHeight: 38,
    fontStyle: 'italic',
    fontWeight: '400',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  readingHeading: {
    fontFamily: readingFontFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  readingBody: {
    fontFamily: readingFontFamily,
    fontSize: 18,
    lineHeight: 30,
    fontWeight: '400',
    letterSpacing: 0.1,
  } satisfies TextStyle,
  readingVerseNumber: {
    fontFamily: readingFontFamily,
    fontSize: 11,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0.5,
  } satisfies TextStyle,
} as const;

export const layout = {
  screenPadding: spacing.xl,
  sectionGap: spacing.xl,
  cardGap: spacing.lg,
  compactGap: spacing.md,
  cardPadding: 20,
  denseCardPadding: spacing.lg,
  minTouchTarget: 44,
  tabBarHeight: 72,
} as const;

export const shadows = {
  card: {} as ViewStyle, // Flat -- hierarchy via borders and spacing now
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 4,
    },
    default: {},
  }) as ViewStyle,
} as const;

export const navigationTypography = {
  regular: {
    fontFamily: uiFontFamily,
    fontWeight: '400',
  },
  medium: {
    fontFamily: uiFontFamily,
    fontWeight: '600',
  },
  bold: {
    fontFamily: uiFontFamily,
    fontWeight: '700',
  },
  heavy: {
    fontFamily: uiFontFamily,
    fontWeight: '700',
  },
} as const;
