import { useMemo } from 'react';
import type { TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getDisplayFontFamily } from '../design/fonts';

// The Every Language display face (Alte Haas Grotesk) covers 297 codepoints —
// Latin-1 and a little. It cannot render Cyrillic, Vietnamese precomposed
// diacritics, Devanagari, Bengali, Tamil, Telugu, Gurmukhi, Arabic, CJK or
// Hangul, which is 14 of the 21 interface languages this app ships.
//
// The typography tokens in design/system.ts are static module constants, so they
// cannot be locale-aware on their own. Any surface that renders TRANSLATED text
// in a display token must therefore merge one of these overrides after the token:
//
//   const displayFont = useDisplayFont();
//   <Text style={[styles.greetingLine, displayFont.bold, { color }]} />
//
// For locales the face covers this is a no-op. For the rest it clears the family
// so the platform UI font renders, and relaxes the tight EL display tracking,
// which is metric-matched to Alte Haas and looks broken on fallback glyphs.
export interface DisplayFontOverrides {
  /** For displayHero, screenTitle, pageTitle, chapterNumeral. */
  bold: TextStyle;
  /** For serifQuote and other regular-weight display text. */
  regular: TextStyle;
  /** True when the active language falls back to the platform font. */
  isFallback: boolean;
}

export function useDisplayFont(): DisplayFontOverrides {
  const { i18n } = useTranslation();
  const language = i18n.language;

  return useMemo(() => {
    const bold = getDisplayFontFamily(language, 700);
    const regular = getDisplayFontFamily(language, 400);
    const isFallback = bold === undefined;

    // Undefined clears the token's fontFamily when the styles are flattened, so
    // React Native picks the platform face that has the glyphs.
    return {
      bold: isFallback ? { fontFamily: undefined, letterSpacing: 0 } : { fontFamily: bold },
      regular: isFallback ? { fontFamily: undefined, letterSpacing: 0 } : { fontFamily: regular },
      isFallback,
    };
  }, [language]);
}
