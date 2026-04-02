import { bibleBooks } from '../../constants/books';

export interface BibleDeepLinkTarget {
  bookId: string;
  chapter: number;
  verse?: number;
}

/**
 * Maps URL slugs (lowercased book name, spaces removed) to internal 3-letter book IDs.
 * Derived from the bibleBooks array. One extra alias added: 'psalm' -> 'PSA'
 * (canonical name is 'Psalms' but 'psalm' is a common singular form users type).
 *
 * Total: 66 books + 1 alias = 67 entries.
 */
const SLUG_TO_BOOK_ID: Record<string, string> = Object.fromEntries([
  ...bibleBooks.map((book) => [book.name.toLowerCase().replace(/\s/g, ''), book.id]),
  ['psalm', 'PSA'],
]);

/**
 * Reverse map: internal book ID -> URL slug.
 * Used by buildBibleDeepLink only.
 */
const BOOK_ID_TO_SLUG: Record<string, string> = Object.fromEntries(
  bibleBooks.map((book) => [book.id, book.name.toLowerCase().replace(/\s/g, '')])
);

/**
 * Parses a path like "/bible/john/3/16" or "/bible/john/3" into a BibleDeepLinkTarget.
 * Returns null if the path doesn't match the bible pattern, the book slug is unrecognized,
 * or the chapter number is invalid (< 1).
 *
 * Example usage:
 *   parseBibleDeepLink('/bible/john/3/16')  => { bookId: 'JHN', chapter: 3, verse: 16 }
 *   parseBibleDeepLink('/bible/1corinthians/13') => { bookId: '1CO', chapter: 13 }
 *   parseBibleDeepLink('/bible/unknown/3/16') => null
 */
export const parseBibleDeepLink = (path: string): BibleDeepLinkTarget | null => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const match = normalizedPath.match(/^\/bible\/([^/]+)\/(\d+)(?:\/(\d+))?/);
  if (!match) return null;

  const [, bookSlug, chapterStr, verseStr] = match;
  const slug = (bookSlug ?? '').toLowerCase().replace(/\s/g, '');
  const bookId = SLUG_TO_BOOK_ID[slug];
  if (!bookId) return null;

  const chapter = parseInt(chapterStr ?? '0', 10);
  if (!Number.isInteger(chapter) || chapter < 1) return null;

  const verse = verseStr !== undefined ? parseInt(verseStr, 10) : undefined;

  return { bookId, chapter, verse };
};

/**
 * Builds a shareable deep link URL for a Bible chapter or verse.
 * Returns '' if the bookId is not recognized.
 *
 * Example usage:
 *   buildBibleDeepLink('JHN', 3, 16)  => 'com.everybible.app://bible/john/3/16'
 *   buildBibleDeepLink('JHN', 3)      => 'com.everybible.app://bible/john/3'
 *   buildBibleDeepLink('1CO', 13)     => 'com.everybible.app://bible/1corinthians/13'
 *   buildBibleDeepLink('INVALID', 1)  => ''
 */
export const buildBibleDeepLink = (bookId: string, chapter: number, verse?: number): string => {
  const slug = BOOK_ID_TO_SLUG[bookId];
  if (!slug) return '';
  const base = `com.everybible.app://bible/${slug}/${chapter}`;
  return verse !== undefined ? `${base}/${verse}` : base;
};
