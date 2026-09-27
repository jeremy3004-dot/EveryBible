import { contrastRatio, WCAG_AA_TEXT } from '../../../../design/contrast';
import { serifFamily } from '../../../../design/fonts';
import { VERSE_IMAGE_FONT_COVERAGE } from './verseImageFontCoverage.generated';

/**
 * The look of a shared verse picture: its typeface, text colour and size. The
 * faces differ in character, not just weight (owner feedback on the first mockup:
 * "it just makes the same font bold or thin").
 */
export type VerseImageFontId =
  | 'classic'
  | 'script'
  | 'handwritten'
  | 'block'
  | 'slab'
  | 'elegant'
  | 'typewriter'
  | 'modern';

export interface VerseImageFont {
  id: VerseImageFontId;
  /** The family name the face is registered under (see verseImageFonts). */
  fontFamily: string;
  /** Faces draw at different sizes for the same point size; this evens them out. */
  scale: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  uppercase?: boolean;
  letterSpacing?: number;
}

export const VERSE_IMAGE_FONTS: readonly VerseImageFont[] = [
  { id: 'classic', fontFamily: serifFamily(400, true), scale: 1, lineHeight: 1.34 },
  { id: 'script', fontFamily: 'DancingScript_600SemiBold', scale: 1.1, lineHeight: 1.3 },
  { id: 'handwritten', fontFamily: 'Caveat_600SemiBold', scale: 1.22, lineHeight: 1.18 },
  {
    id: 'block',
    fontFamily: 'Anton_400Regular',
    scale: 1,
    lineHeight: 1.16,
    uppercase: true,
    letterSpacing: 0.4,
  },
  { id: 'slab', fontFamily: 'AlfaSlabOne_400Regular', scale: 0.92, lineHeight: 1.3 },
  { id: 'elegant', fontFamily: 'PlayfairDisplay_600SemiBold_Italic', scale: 1, lineHeight: 1.3 },
  { id: 'typewriter', fontFamily: 'SpecialElite_400Regular', scale: 0.95, lineHeight: 1.36 },
  { id: 'modern', fontFamily: 'AlteHaasGrotesk-Bold', scale: 1, lineHeight: 1.26 },
];

export type VerseImageColorId =
  | 'white'
  | 'cream'
  | 'sand'
  | 'gold'
  | 'amber'
  | 'coral'
  | 'blush'
  | 'lavender'
  | 'sky'
  | 'mint'
  | 'sage'
  | 'rose'
  | 'crimson'
  | 'forest'
  | 'navy'
  | 'ink';

export interface VerseImageColor {
  id: VerseImageColorId;
  /**
   * The words' colour in the shared picture. Fixed rather than theme colours: the
   * picture looks the same whichever theme shared it, as the highlight colours do.
   */
  hex: string;
  /** Light words get a darker wash behind them, dark words a lighter one. */
  light: boolean;
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';

/** Light when black reads better on it than white does. */
const isLightColor = (hex: string) => contrastRatio(BLACK, hex) > contrastRatio(WHITE, hex);

// Sixteen hand-picked colours: light ones that read on most photos, then deeper tones
// for bright pictures (owner chose the sixteen over a free colour picker).
const COLOR_HEXES: Record<VerseImageColorId, string> = {
  white: '#FFFFFF',
  cream: '#F3E6CC',
  sand: '#E6CFA6',
  gold: '#E5B95F',
  amber: '#F0A04B',
  coral: '#EE9A80',
  blush: '#F4BCC9',
  lavender: '#CDBDF2',
  sky: '#A3D3F6',
  mint: '#A9E2C6',
  sage: '#BACB9C',
  rose: '#C4506A',
  crimson: '#9C2A24',
  forest: '#2E4A36',
  navy: '#1F2F4D',
  ink: '#1A1914',
};

export const VERSE_IMAGE_COLORS: readonly VerseImageColor[] = (
  Object.keys(COLOR_HEXES) as VerseImageColorId[]
).map((id) => ({ id, hex: COLOR_HEXES[id], light: isLightColor(COLOR_HEXES[id]) }));

/** The reference chip under light words, and under dark words. */
const DARK_CHIP = '#1A1914';
const LIGHT_CHIP = '#F6F1E7';

/** Point sizes the size control offers, at the preview's width. */
export const VERSE_IMAGE_SIZE = { min: 14, max: 64, initial: 24 } as const;
/** The smallest a verse is set when it has to shrink to fit. */
export const VERSE_IMAGE_MIN_FIT_SIZE = 9;

export const DEFAULT_VERSE_IMAGE_STYLE = {
  fontId: 'classic' as VerseImageFontId,
  colorId: 'white' as VerseImageColorId,
  size: VERSE_IMAGE_SIZE.initial as number,
};

export type VerseImageStyle = typeof DEFAULT_VERSE_IMAGE_STYLE;

// Spaces and invisible joiners take no glyph of their own.
const NEEDS_NO_GLYPH = /[\s\u200B-\u200D\u2060\uFEFF]/;

function covers(ranges: readonly (readonly [number, number])[], codePoint: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = ranges[middle]!;
    if (codePoint < first) high = middle - 1;
    else if (codePoint > last) low = middle + 1;
    else return true;
  }
  return false;
}

/**
 * Whether a face has a glyph for every character of the text. The picture is set in
 * the verse's own language, whatever the app's is: a Russian verse can use the faces
 * with Cyrillic, a Hindi or Arabic one none of them. Decided from the characters
 * rather than a language code, so it holds for every Bible language.
 */
export function canVerseImageFontDraw(id: VerseImageFontId, text: string): boolean {
  const ranges = VERSE_IMAGE_FONT_COVERAGE[id];
  for (const character of text) {
    if (NEEDS_NO_GLYPH.test(character)) continue;
    if (!covers(ranges, character.codePointAt(0)!)) return false;
  }
  return true;
}

/** The faces that can set this text, in menu order. */
export function getDrawableVerseImageFonts(text: string): VerseImageFont[] {
  return VERSE_IMAGE_FONTS.filter((font) => canVerseImageFontDraw(font.id, text));
}

/**
 * The word each font chip is drawn with: one from the verse itself, so the sample is
 * always in the verse's script and every chip can draw it.
 */
export function getVerseImageFontSample(text: string): string {
  const word = text
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{M}]/gu, ''))
    .find((part) => part.length >= 3);
  return word ? Array.from(word).slice(0, 9).join('') : 'Aa';
}

export function getVerseImageFont(id: VerseImageFontId): VerseImageFont {
  return VERSE_IMAGE_FONTS.find((font) => font.id === id) ?? VERSE_IMAGE_FONTS[0]!;
}

export function getVerseImageColor(id: VerseImageColorId): VerseImageColor {
  return VERSE_IMAGE_COLORS.find((color) => color.id === id) ?? VERSE_IMAGE_COLORS[0]!;
}

/** The wash over the photo, top to bottom, so the words read on any picture. */
export function getVerseImageScrim(color: VerseImageColor): [string, string] {
  return color.light
    ? ['rgba(10, 9, 7, 0.18)', 'rgba(10, 9, 7, 0.52)']
    : ['rgba(248, 244, 236, 0.30)', 'rgba(248, 244, 236, 0.66)'];
}

/**
 * The reference sits on an opaque chip: a translucent wash over a photo has no
 * knowable contrast (an accent reference once vanished on a blue-grey photo). The
 * chip follows the chosen colour and always clears 4.5:1: the words' colour on a dark
 * chip for light colours or a light chip for dark ones; a mid-tone that reaches 4.5:1
 * on neither (Rose) fills the chip itself, under black or white words.
 */
export function getVerseImageReferenceChip(color: VerseImageColor): {
  background: string;
  text: string;
} {
  const tinted = { background: color.light ? DARK_CHIP : LIGHT_CHIP, text: color.hex };
  if (contrastRatio(tinted.text, tinted.background) >= WCAG_AA_TEXT) return tinted;
  return {
    background: color.hex,
    text: contrastRatio(BLACK, color.hex) >= contrastRatio(WHITE, color.hex) ? BLACK : WHITE,
  };
}

/**
 * One step of fitting the verse into the picture. Given the size just measured and
 * how tall it set, returns the next size to try, or null when it fits. Text area
 * grows with the square of the size, so the step scales by the square root of the
 * overflow, with a little margin so it settles in two or three steps.
 */
export function getNextVerseImageFitSize({
  size,
  measuredHeight,
  availableHeight,
}: {
  size: number;
  measuredHeight: number;
  availableHeight: number;
}): number | null {
  if (availableHeight <= 0 || measuredHeight <= availableHeight) return null;
  if (size <= VERSE_IMAGE_MIN_FIT_SIZE) return null;
  const next = Math.floor(size * Math.sqrt(availableHeight / measuredHeight) * 0.97 * 2) / 2;
  return Math.max(VERSE_IMAGE_MIN_FIT_SIZE, Math.min(next, size - 0.5));
}
