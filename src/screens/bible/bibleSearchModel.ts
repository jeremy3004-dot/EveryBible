import type { Verse } from '../../types';
import type { PassageReferenceTarget } from '../../services/bible/referenceParser';

export const MIN_BIBLE_SEARCH_QUERY_LENGTH = 2;

export type BibleSearchIntent =
  | {
      kind: 'idle';
      query: string;
    }
  | {
      kind: 'full-text';
      query: string;
    }
  | {
      kind: 'reference';
      query: string;
      target: PassageReferenceTarget;
    };

export const shouldRunBibleSearch = (query: string): boolean => {
  return query.trim().length >= MIN_BIBLE_SEARCH_QUERY_LENGTH;
};

export const resolveBibleSearchIntent = (
  query: string,
  parseReference: (query: string) => PassageReferenceTarget | null
): BibleSearchIntent => {
  const normalizedQuery = query.trim();

  if (!shouldRunBibleSearch(normalizedQuery)) {
    return {
      kind: 'idle',
      query: normalizedQuery,
    };
  }

  const referenceTarget = parseReference(normalizedQuery);
  if (referenceTarget) {
    return {
      kind: 'reference',
      query: normalizedQuery,
      target: referenceTarget,
    };
  }

  return {
    kind: 'full-text',
    query: normalizedQuery,
  };
};

export const formatBibleSearchReference = (
  verse: Pick<Verse, 'bookId' | 'chapter' | 'verse'>,
  resolveBookName: (bookId: string) => string | undefined
): string => {
  const bookName = resolveBookName(verse.bookId) ?? verse.bookId;
  return `${bookName} ${verse.chapter}:${verse.verse}`;
};
