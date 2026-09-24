/** Catalog-backed id guards: bundled translation ids and canonical book ids. */
import { bibleTranslations } from '../../constants/translations';
import { getBookById } from '../../constants/books';

export const supportedBibleTranslationIds = new Set(
  bibleTranslations.map((translation) => translation.id)
);

export const sanitizeTranslationId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return supportedBibleTranslationIds.has(normalized) ? normalized : null;
};

export const sanitizeBookId = (value: unknown): string | null =>
  typeof value === 'string' && getBookById(value) ? value : null;

export const sanitizeBookIds = (value: unknown, fallback: string[] = []): string[] =>
  Array.isArray(value)
    ? value.filter(
        (bookId): bookId is string => typeof bookId === 'string' && Boolean(getBookById(bookId))
      )
    : fallback;
