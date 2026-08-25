import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { displayFamily, serifFamily } from './fonts';

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
// Every Language geometry: the EL kit runs tighter corners than the previous
// ember scale — 10 for paper panels, 14 for the hero card, 20 for sheets.
export const radius = {
  xs: 4,
  sm: 6, // EL --radius-sm
  md: 8, // EL --radius-md
  lg: 10, // EL --radius-lg — the atlas-paper card radius
  xl: 14, // EL --radius-xl
  sheet: 20, // EL --radius-2xl
  pill: 999, // EL --radius-full
} as const;

const uiFontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

// Identity display face (Alte Haas Grotesk) — the Every Language display family.
// Screen titles, greetings and chapter numerals carry it. Surfaces that render
// user-selected interface languages must route through getDisplayFontFamily()
// instead: the face is Latin-only, so these token defaults cover Latin content
// and non-Latin locales fall back to the platform UI font.
const displayBold = displayFamily(700);
const displayRegular = displayFamily(400);

// Reading serif face (Lora). The EL system ships no serif, so the reading
// surface deliberately keeps Lora — swapping Scripture onto a grotesque is a
// separate decision. Reading surfaces route through getReadingFontFamily() so
// non-Latin scripts fall back to the platform serif.
const serifRegular = serifFamily(400);
const serifSemiBold = serifFamily(600);
const serifItalic = serifFamily(400, true);

export const typography = {
  displayHero: {
    fontFamily: displayBold,
    fontSize: 30,
    lineHeight: 31, // EL --leading-display 0.92, floored so descenders clear
    letterSpacing: -1.2, // EL --tracking-display -0.04em at 30px
  } satisfies TextStyle,
  screenTitle: {
    fontFamily: displayBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.98, // EL --tracking-heading -0.035em
  } satisfies TextStyle,
  pageTitle: {
    fontFamily: displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.84,
  } satisfies TextStyle,
  serifQuote: {
    fontFamily: displayRegular,
    fontSize: 24,
    lineHeight: 33,
    letterSpacing: -0.48,
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
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: 1.98, // EL --tracking-eyebrow 0.18em at 11px
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
    fontFamily: displayBold,
    fontSize: 64,
    lineHeight: 62,
    letterSpacing: -2.56,
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

// One interaction physics for the whole app. `spring` is the press/slide feel
// shared by PressableScale, sheets, and animated fills; durations/easing drive
// entrance choreography. All motion must respect useReducedMotion().
export const motion = {
  duration: {
    fast: 140,
    base: 220,
    slow: 320,
  },
  // Standard "decelerate" curve — cubic-bezier(0.2, 0, 0, 1).
  easing: [0.2, 0, 0, 1] as const,
  spring: {
    damping: 20,
    stiffness: 260,
  },
} as const;

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
  // EL paper: a warm hairline shadow under every panel (--shadow-xs), so cards
  // read as paper lifted off the vellum rather than tone-only blocks. Kept very
  // low so it survives on the dark scope without haloing.
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1A1916',
      shadowOpacity: 0.06,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    android: {
      elevation: 1,
    },
    default: {},
  }) as ViewStyle,
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
