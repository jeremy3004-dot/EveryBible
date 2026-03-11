import type { Verse } from '../../types';

export const MIN_BIBLE_SEARCH_QUERY_LENGTH = 2;

export const shouldRunBibleSearch = (query: string): boolean => {
  return query.trim().length >= MIN_BIBLE_SEARCH_QUERY_LENGTH;
};

export const formatBibleSearchReference = (
  verse: Pick<Verse, 'bookId' | 'chapter' | 'verse'>,
  resolveBookName: (bookId: string) => string | undefined
): string => {
  const bookName = resolveBookName(verse.bookId) ?? verse.bookId;
  return `${bookName} ${verse.chapter}:${verse.verse}`;
};
