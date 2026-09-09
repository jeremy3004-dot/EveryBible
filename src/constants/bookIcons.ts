import catalog from './bookIconVectors.generated.json';

export interface BookIconVector {
  viewBox: string;
  paths: readonly string[];
}

const drawings: Readonly<Record<string, BookIconVector>> = catalog.icons;

/** Numbered books share the same drawing object and stored paths. */
export const BOOK_ICONS: Readonly<Record<string, BookIconVector>> = Object.fromEntries(
  Object.entries(catalog.bookToIcon).map(([bookId, iconId]) => [bookId, drawings[iconId]])
);

export function getBookIcon(bookId: string): BookIconVector | null {
  return BOOK_ICONS[bookId.toUpperCase()] ?? null;
}
