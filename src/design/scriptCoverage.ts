// Script coverage for the bundled faces.
//
// Dependency-free on purpose: it holds no react-native import, so the node test
// runner can exercise the resolvers directly (importing `fonts.ts` drags in
// react-native's flow-typed sources, which esbuild cannot transform).

// Languages whose scripts Lora does not cover. Kept as an allowlist-of-exclusions
// so new Latin/Cyrillic translations get Lora automatically. Accepts BOTH ISO
// codes ('hi') and the English display names our translation catalog stores
// ('Hindi'), because callers pass whichever they have — extend when adding a
// reading translation in an unsupported script.
export const NON_LATIN_READING_SCRIPTS = new Set([
  // Devanagari
  'hi',
  'hindi',
  'ne',
  'nepali',
  'mr',
  'marathi',
  'sa',
  'sanskrit',
  // Other non-Latin scripts Lora lacks (ISO code + display name)
  'ar',
  'arabic',
  'fa',
  'persian',
  'ur',
  'urdu',
  'he',
  'hebrew',
  'zh',
  'chinese',
  'ja',
  'japanese',
  'ko',
  'korean',
  'th',
  'thai',
  'lo',
  'lao',
  'my',
  'burmese',
  'km',
  'khmer',
  'ta',
  'tamil',
  'te',
  'telugu',
  'kn',
  'kannada',
  'ml',
  'malayalam',
  'bn',
  'bengali',
  'gu',
  'gujarati',
  'pa',
  'punjabi',
  'or',
  'odia',
  'si',
  'sinhala',
  'am',
  'amharic',
  'ti',
  'tigrinya',
  'ka',
  'georgian',
  'hy',
  'armenian',
  'dz',
  'dzongkha',
  'bo',
  'tibetan',
]);

// Alte Haas lacks Cyrillic and Vietnamese precomposed diacritics on top of every
// script Lora also lacks, so the display exclusion list extends the reading one.
const NON_LATIN_DISPLAY_SCRIPTS = new Set([
  ...NON_LATIN_READING_SCRIPTS,
  'ru',
  'russian',
  'uk',
  'ukrainian',
  'bg',
  'bulgarian',
  'sr',
  'serbian',
  'mk',
  'macedonian',
  'vi',
  'vietnamese',
]);

export type DisplayWeight = 400 | 700;

const ALTE_HAAS_BY_WEIGHT: Record<DisplayWeight, string> = {
  400: 'AlteHaasGrotesk-Regular',
  700: 'AlteHaasGrotesk-Bold',
};

/** Nearest Alte Haas face for a requested weight. 500/600/800 round to the ends. */
export function displayFamily(weight: DisplayWeight = 700): string {
  return ALTE_HAAS_BY_WEIGHT[weight] ?? ALTE_HAAS_BY_WEIGHT[700];
}

/**
 * Resolve the display font family for an interface language. Latin-script
 * locales get Alte Haas; any script the face lacks returns `undefined` so React
 * Native falls back to the platform UI font, which has the glyphs.
 *
 * Accepts an ISO code ('hi', 'ru') or an English display name ('Hindi').
 */
export function getDisplayFontFamily(
  language?: string | null,
  weight: DisplayWeight = 700
): string | undefined {
  if (!language) {
    return displayFamily(weight);
  }

  const normalized = language.trim().toLowerCase();
  const base = normalized.split(/[-_]/)[0];

  if (NON_LATIN_DISPLAY_SCRIPTS.has(normalized) || NON_LATIN_DISPLAY_SCRIPTS.has(base)) {
    return undefined;
  }

  return displayFamily(weight);
}
