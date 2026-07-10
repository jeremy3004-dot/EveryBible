import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Serif (Lora) family resolver
//
// Lora is loaded at startup in App.tsx via the existing useFonts gate. It ships
// four upright weights and a single italic (400). Every reading-surface and
// identity-serif fontFamily decision in the app routes through the helpers here
// so weight/style/script fallback logic lives in exactly one place.
// ---------------------------------------------------------------------------

export type SerifWeight = 400 | 500 | 600 | 700;

const LORA_BY_WEIGHT: Record<SerifWeight, string> = {
  400: 'Lora_400Regular',
  500: 'Lora_500Medium',
  600: 'Lora_600SemiBold',
  700: 'Lora_700Bold',
};

// Lora only bundles an italic face at 400 weight.
const LORA_ITALIC = 'Lora_400Regular_Italic';

/**
 * Resolve the bundled Lora family name for a weight/style. Any italic request
 * maps to the single 400 italic face Lora provides.
 */
export function serifFamily(weight: SerifWeight = 400, italic = false): string {
  if (italic) {
    return LORA_ITALIC;
  }
  return LORA_BY_WEIGHT[weight] ?? LORA_BY_WEIGHT[400];
}

// Platform serif fallback for scripts Lora cannot render. Returning `undefined`
// from getReadingFontFamily lets React Native pick the platform serif, which has
// the correct glyphs (Lora would show tofu for Devanagari and other scripts).
export const systemSerifFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});

// Languages whose scripts Lora does not cover. Kept as an allowlist-of-exclusions
// so new Latin/Cyrillic translations get Lora automatically. Accepts BOTH ISO
// codes ('hi') and the English display names our translation catalog stores
// ('Hindi'), because callers pass whichever they have — extend when adding a
// reading translation in an unsupported script.
const NON_LATIN_READING_SCRIPTS = new Set([
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

/**
 * Resolve the reading-surface font family for a language. Latin-script languages
 * get Lora at the requested weight/style; Devanagari and other unsupported
 * scripts return `undefined` so the platform serif renders instead. Accepts an
 * ISO code ('hi', 'ne') or an English display name ('Hindi', 'Nepali').
 */
export function getReadingFontFamily(
  languageCode?: string,
  weight: SerifWeight = 400,
  italic = false
): string | undefined {
  const base = (languageCode ?? '').split('-')[0].toLowerCase();
  if (base && NON_LATIN_READING_SCRIPTS.has(base)) {
    return undefined;
  }
  return serifFamily(weight, italic);
}
