import type { ThemeColors } from '../../contexts/ThemeContext';
import type { UserAnnotation } from '../../services/supabase/types';

type ReaderAnnotation = Pick<
  UserAnnotation,
  'type' | 'verse_start' | 'verse_end' | 'color' | 'deleted_at'
>;

/** Build once per annotation/chapter change, then reuse during playback updates. */
export function buildReaderHighlightIndex<T extends ReaderAnnotation>(
  annotations: readonly T[],
  lastVerse: number
): Map<number, T> {
  const highlights = new Map<number, T>();
  for (const annotation of annotations) {
    if (annotation.type !== 'highlight' || annotation.deleted_at) continue;
    const start = annotation.verse_start;
    const end = Math.min(lastVerse, annotation.verse_end ?? start);
    for (let verse = Math.max(1, start); verse <= end; verse += 1) {
      if (!highlights.has(verse)) highlights.set(verse, annotation);
    }
  }
  return highlights;
}

export interface ReaderParagraphAppearance {
  premium: boolean;
  verseFontSize: number;
  verseLineHeight: number;
  verseNumberSize: number;
  headingFontSize: number;
  readingFontFamily?: string;
  readingFontFamilyBold?: string;
  colors: Pick<
    ThemeColors,
    | 'biblePrimaryText'
    | 'bibleSecondaryText'
    | 'bibleAccent'
    | 'bibleFollowHighlight'
    | 'bibleFollowVerseNumber'
  >;
  annotations: readonly ReaderAnnotation[];
}

/**
 * Shared by the virtualized and compact readers. Audio position and verse
 * selection are deliberately absent: both are compared per paragraph, so a
 * tick or a tap redraws only the paragraphs it touches.
 */
export function buildReaderParagraphRenderSignature(input: ReaderParagraphAppearance): string {
  return JSON.stringify([
    input.premium ? '1' : '0',
    input.verseFontSize,
    input.verseLineHeight,
    input.verseNumberSize,
    input.headingFontSize,
    input.colors.biblePrimaryText,
    input.colors.bibleAccent,
    input.colors.bibleSecondaryText,
    input.colors.bibleFollowHighlight,
    input.colors.bibleFollowVerseNumber,
    input.readingFontFamily,
    input.readingFontFamilyBold,
    input.annotations.map((annotation) => [
      annotation.type,
      annotation.verse_start,
      annotation.verse_end,
      annotation.color,
      annotation.deleted_at,
    ]),
  ]);
}

/** Whether any verse of a paragraph entered or left the selection. */
export function hasParagraphSelectionChanged(
  verses: readonly { verse: number }[],
  previous: ReadonlySet<number>,
  next: ReadonlySet<number>
): boolean {
  if (previous === next) return false;
  return verses.some(({ verse }) => previous.has(verse) !== next.has(verse));
}
