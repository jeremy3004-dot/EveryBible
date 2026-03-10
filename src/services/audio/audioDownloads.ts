import type { BibleBook } from '../../constants/books';

export interface AudioChapterTarget {
  bookId: string;
  chapter: number;
}

export function buildAudioChapterTargets(books: BibleBook[]): AudioChapterTarget[] {
  return books.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, index) => ({
      bookId: book.id,
      chapter: index + 1,
    }))
  );
}

export function isAudioBookDownloaded(downloadedAudioBooks: string[], bookId: string): boolean {
  return downloadedAudioBooks.includes(bookId);
}

export function isTranslationAudioDownloaded(
  downloadedAudioBooks: string[],
  books: BibleBook[]
): boolean {
  if (books.length === 0) {
    return false;
  }

  const downloadedSet = new Set(downloadedAudioBooks);
  return books.every((book) => downloadedSet.has(book.id));
}
