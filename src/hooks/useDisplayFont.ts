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
// so the platform UI font renders, relaxes the tight EL display tracking, which
// is metric-matched to Alte Haas and looks broken on fallback glyphs, and drops
// the token's line height. The EL display tokens set leading BELOW their font
// size (32/31, 28/27, 24/23), which only works because Alte Haas has shallow
// Latin extenders. Devanagari matras, Bengali/Tamil vowel signs and Vietnamese
// stacked diacritics sit outside that box and clip at sub-1em leading, so the
// fallback lets the platform font's natural leading apply instead.
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

    // Undefined clears the token's fontFamily and lineHeight when the styles are
    // flattened, so React Native picks the platform face that has the glyphs and
    // lets that face's own leading size the line.
    const fallback: TextStyle = {
      fontFamily: undefined,
      letterSpacing: 0,
      lineHeight: undefined,
    };

    return {
      bold: isFallback ? fallback : { fontFamily: bold },
      regular: isFallback ? fallback : { fontFamily: regular },
      isFallback,
    };
  }, [language]);
}
