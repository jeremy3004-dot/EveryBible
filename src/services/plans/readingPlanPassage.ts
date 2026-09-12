import type { ReadingPlanEntry } from './types';

export function formatPlanPassageReference(entry: ReadingPlanEntry, bookName: string): string {
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
