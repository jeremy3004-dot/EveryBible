import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { serifFamily } from './fonts';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// Concentric radius rule: a child's corner radius should be its parent's radius
// minus the padding between them (childRadius = parentRadius − padding), floored
// at `xs` (4). Pick from these tokens rather than raw values so nested corners
// stay optically concentric.
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  sheet: 28,
  pill: 999,
} as const;

const uiFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

// Identity + reading serif faces (Lora). Reading surfaces additionally route
// through getReadingFontFamily() so non-Latin scripts fall back to the platform
// serif; these token defaults cover Latin-script content.
const serifRegular = serifFamily(400);
const serifMedium = serifFamily(500);
const serifSemiBold = serifFamily(600);
const serifItalic = serifFamily(400, true);

export const typography = {
  displayHero: {
    fontFamily: serifMedium,
    fontSize: 30,
    lineHeight: 40,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  screenTitle: {
    fontFamily: serifSemiBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  } satisfies TextStyle,
  pageTitle: {
    fontFamily: serifSemiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  serifQuote: {
    fontFamily: serifItalic,
    fontSize: 20,
    lineHeight: 30,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: uiFontFamily,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: -0.2,
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: uiFontFamily,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
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
    letterSpacing: 0.1,
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
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  button: {
    fontFamily: uiFontFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  } satisfies TextStyle,
  tabLabel: {
    fontFamily: uiFontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  readingDisplay: {
    fontFamily: serifItalic,
    fontSize: 28,
    lineHeight: 38,
  } satisfies TextStyle,
  chapterNumeral: {
    fontFamily: serifRegular,
    fontSize: 64,
    lineHeight: 68,
  } satisfies TextStyle,
  readingHeading: {
    fontFamily: serifSemiBold,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.1,
  } satisfies TextStyle,
  readingBody: {
    fontFamily: serifRegular,
    fontSize: 18,
    lineHeight: 29,
    letterSpacing: 0.05,
  } satisfies TextStyle,
  readingVerseNumber: {
    fontFamily: uiFontFamily,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  } satisfies TextStyle,
} as const;

// Apply to any glyph-aligned number that changes in place — timers, counters,
// streaks, percentages, elapsed/remaining time — so digits don't jitter.
export const numeric: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export const layout = {
  screenPadding: spacing.xl,
  sectionGap: spacing.xl,
  cardGap: spacing.lg,
  compactGap: spacing.md,
  cardPadding: 20,
  denseCardPadding: spacing.lg,
  minTouchTarget: 44,
  tabBarBaseHeight: 52,
} as const;

export const shadows = {
  // Hierarchy via tone, not shadow — card surfaces sit lighter than the page
  // background and are separated by hairline alpha borders, so resting cards
  // stay flat.
  card: {} as ViewStyle,
  // Reserved for surfaces that genuinely float above the page: docks, pills,
  // sheets, and FABs. Do not apply to resting cards.
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    android: {
      elevation: 6,
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
