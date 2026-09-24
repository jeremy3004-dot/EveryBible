import type { BibleReference } from '../../types/gather';
import type { Verse } from '../../types';
import { getChapter } from '../bible/bibleService';
import { getBookById } from '../../constants/books';
import { formatBibleReference } from './gatherReferenceLabel';

export interface PassageBlock {
  label: string; // e.g. "Genesis 1:1-25"
  verses: Verse[]; // filtered verses for this reference
  /** The translation these verses came from; differs from the requested one after a fallback. */
  translationId: string;
}

export interface PassageLabelOptions {
  bookNameResolver?: (bookId: string) => string;
  /**
   * Read a reference from this translation when the requested one has no verses
   * for it or cannot be opened (a New Testament-only translation on a Genesis
   * lesson, a text pack that is not installed). The bundled BSB is always
   * available offline, so the Story section is never silently blank.
   */
  fallbackTranslationId?: string;
}

/** The translation shipped inside the app, readable with no download. */
export const LESSON_FALLBACK_TRANSLATION_ID = 'bsb';

const selectVerses = (chapterVerses: Verse[], ref: BibleReference): Verse[] => {
  if (ref.startVerse != null && ref.endVerse != null) {
    return chapterVerses.filter((v) => v.verse >= ref.startVerse! && v.verse <= ref.endVerse!);
  }
  if (ref.startVerse != null) {
    return chapterVerses.filter((v) => v.verse >= ref.startVerse!);
  }
  return chapterVerses;
};

/**
 * Fetches Bible text for a set of BibleReferences.
 * Each reference becomes a PassageBlock with a label and verses.
 * Verse filtering: if startVerse/endVerse defined, filter the chapter results.
 * If only startVerse (no endVerse), take from startVerse to end of chapter.
 * If neither, return the full chapter.
 */
export async function getPassageText(
  references: BibleReference[],
  translationId: string = 'bsb',
  options: PassageLabelOptions = {}
): Promise<PassageBlock[]> {
  const blocks: PassageBlock[] = [];
  const bookNameResolver =
    options.bookNameResolver ?? ((bookId: string) => getBookById(bookId)?.name ?? bookId);
  const fallbackTranslationId =
    options.fallbackTranslationId && options.fallbackTranslationId !== translationId
      ? options.fallbackTranslationId
      : null;

  for (const ref of references) {
    const label = formatBibleReference(ref, bookNameResolver);

    let verses: Verse[] = [];
    let readError: unknown = null;
    try {
      verses = selectVerses(await getChapter(translationId, ref.bookId, ref.chapter), ref);
    } catch (error) {
      if (!fallbackTranslationId) {
        throw error;
      }
      readError = error;
    }

    if (verses.length === 0 && fallbackTranslationId) {
      let fallbackVerses: Verse[] = [];
      try {
        fallbackVerses = selectVerses(
          await getChapter(fallbackTranslationId, ref.bookId, ref.chapter),
          ref
        );
      } catch {
        // The reading translation's own error, if any, is the one worth reporting.
      }
      if (fallbackVerses.length > 0) {
        blocks.push({ label, verses: fallbackVerses, translationId: fallbackTranslationId });
        continue;
      }
      if (readError) {
        throw readError;
      }
    }

    blocks.push({ label, verses, translationId });
  }

  return blocks;
}

/**
 * Returns the primary chapter info for audio playback.
 * Uses the first reference's bookId and chapter.
 */
export function getPrimaryAudioReference(
  references: BibleReference[]
): { bookId: string; chapter: number } | null {
  const [first] = references;
  return first ? { bookId: first.bookId, chapter: first.chapter } : null;
}
