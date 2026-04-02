import { getBookById } from '../../constants/books';
import type { BibleReference } from '../../types/gather';

type BookNameResolver = (bookId: string) => string;

const defaultBookNameResolver: BookNameResolver = (bookId) => getBookById(bookId)?.name ?? bookId;

export function formatBibleReference(
  reference: BibleReference,
  bookNameResolver: BookNameResolver = defaultBookNameResolver
): string {
  const bookName = bookNameResolver(reference.bookId);

  if (reference.startVerse != null && reference.endVerse != null) {
    return `${bookName} ${reference.chapter}:${reference.startVerse}-${reference.endVerse}`;
  }

  if (reference.startVerse != null) {
    return `${bookName} ${reference.chapter}:${reference.startVerse}+`;
  }

  return `${bookName} ${reference.chapter}`;
}

export function formatBibleReferenceLabel(
  references: BibleReference[],
  bookNameResolver: BookNameResolver = defaultBookNameResolver
): string {
  if (references.length === 0) {
    return '';
  }

  return references
    .map((reference) => formatBibleReference(reference, bookNameResolver))
    .join('; ');
}
