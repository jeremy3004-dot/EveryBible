import type { BibleReference } from '../../types/gather';
import type { Verse } from '../../types';
import { getChapter } from '../bible/bibleService';
import { getBookById } from '../../constants/books';
import { formatBibleReference } from './gatherReferenceLabel';

export interface PassageBlock {
  label: string; // e.g. "Genesis 1:1-25"
  verses: Verse[]; // filtered verses for this reference
}

export interface PassageLabelOptions {
  bookNameResolver?: (bookId: string) => string;
}

/**
 * Fetches Bible text for a set of BibleReferences from BSB.
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

  for (const ref of references) {
    const chapterVerses = await getChapter(translationId, ref.bookId, ref.chapter);

    let filtered: Verse[];
    if (ref.startVerse != null && ref.endVerse != null) {
      filtered = chapterVerses.filter(
        (v) => v.verse >= ref.startVerse! && v.verse <= ref.endVerse!
      );
    } else if (ref.startVerse != null) {
      filtered = chapterVerses.filter((v) => v.verse >= ref.startVerse!);
    } else {
      filtered = chapterVerses;
    }

    // Build label
    const label = formatBibleReference(ref, bookNameResolver);

    blocks.push({ label, verses: filtered });
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
  if (references.length === 0) return null;
  return { bookId: references[0].bookId, chapter: references[0].chapter };
}
