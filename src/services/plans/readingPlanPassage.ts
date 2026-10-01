import { getTranslatedBookName, getTranslatedPassageBookName } from '../../constants/books';
import type { ReadingPlanEntry } from './types';

/**
 * The entry's reference with the book named the way a citation reads it: one chapter takes
 * the singular ("Psalm 71"), a range keeps the book name ("Psalms 1–3").
 */
export function formatPlanPassageLabel(
  entry: Pick<
    ReadingPlanEntry,
    'book' | 'chapter_start' | 'chapter_end' | 'verse_start' | 'verse_end'
  >,
  t: (key: string) => string
): string {
  const singleChapter = (entry.chapter_end ?? entry.chapter_start) === entry.chapter_start;
  const bookName = singleChapter
    ? getTranslatedPassageBookName(entry.book, t)
    : getTranslatedBookName(entry.book, t);
  return formatPlanPassageReference(entry, bookName);
}

export function formatPlanPassageReference(
  entry: Pick<ReadingPlanEntry, 'chapter_start' | 'chapter_end' | 'verse_start' | 'verse_end'>,
  bookName: string
): string {
  const endChapter = entry.chapter_end ?? entry.chapter_start;
  const start = `${entry.chapter_start}${entry.verse_start != null ? `:${entry.verse_start}` : ''}`;
  if (endChapter !== entry.chapter_start) {
    return `${bookName} ${start}–${endChapter}${entry.verse_end != null ? `:${entry.verse_end}` : ''}`;
  }
  const end =
    entry.verse_end != null && entry.verse_end !== entry.verse_start ? `–${entry.verse_end}` : '';
  return `${bookName} ${start}${end}`;
}

export function getPlanChapterFocusVerse(
  entries: ReadingPlanEntry[],
  bookId: string,
  chapter: number
): number | undefined {
  const entry = entries.find((item) => item.book === bookId && item.chapter_start === chapter);
  return entry?.verse_start ?? undefined;
}
