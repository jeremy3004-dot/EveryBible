// Kept free of react-native imports so the node test runner can load it.

/**
 * OS text scale at which side-by-side layouts (two cards in a row, a title beside
 * its buttons, a Cancel/Save pair) stop fitting and stack vertically instead.
 *
 * 1.3 is Android's "Largest" step and sits just under iOS's largest standard
 * size (xxxLarge, 1.35); every iOS accessibility size (AX1 1.65 to AX5 3.12)
 * and Android 14's 1.5-2.0 steps are above it. Below it, text still fits beside
 * its neighbour; above it, two-up rows squeeze each side to a word per line.
 */
export const LARGE_TEXT_FONT_SCALE = 1.3;

export type LargeTextRowDirection = 'row' | 'column';

/** `useWindowDimensions().fontScale`, with anything unusable read as the default size. */
export function normalizeFontScale(fontScale: number): number {
  return Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
}

export function isLargeTextScale(fontScale: number, threshold = LARGE_TEXT_FONT_SCALE): boolean {
  return normalizeFontScale(fontScale) >= threshold;
}

/** `flexDirection` for a row that should stack once the text is large. */
export function getLargeTextRowDirection(
  fontScale: number,
  threshold = LARGE_TEXT_FONT_SCALE
): LargeTextRowDirection {
  return isLargeTextScale(fontScale, threshold) ? 'column' : 'row';
}

// ---------------------------------------------------------------------------
// Scaling caps (`maxFontSizeMultiplier`)
//
// Body copy is never capped: it wraps and its container grows. These caps are
// for text that sits in a slot sized for one or two words, where an uncapped
// accessibility size (AX5 is 3.12) makes a single word wider than its slot and
// iOS then breaks it mid-word ("Gathe/r", "We/ek") or truncates it. At the cap
// the text is still clearly larger than the default size.
// ---------------------------------------------------------------------------

/**
 * Screen titles, greetings, sheet titles and big numerals in the display face
 * (typography.displayHero, screenTitle, pageTitle and the numeral tokens).
 * At 1.5 a 32pt hero title renders at 48pt, which still fits "Gather" or
 * "Select Translation" word by word on a 320pt-wide phone.
 */
export const DISPLAY_TEXT_MAX_FONT_SCALE = 1.5;

/**
 * Labels inside a control whose slot does not grow sideways: segmented-control
 * (TabSwitch) segments, the Settings size stepper value, tab bar labels and
 * button labels.
 */
export const CONTROL_LABEL_MAX_FONT_SCALE = 1.6;
