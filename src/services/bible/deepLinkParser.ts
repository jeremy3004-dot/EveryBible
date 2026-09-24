import { bibleBooks, getBookById } from '../../constants/books';

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
// Maps, not object literals: a link is arbitrary text, and a `{}` table would answer
// inherited keys such as 'constructor' or '__proto__' with a function or object.
const SLUG_TO_BOOK_ID = new Map<string, string>([
  ...bibleBooks.map((book) => [book.name.toLowerCase().replace(/\s/g, ''), book.id] as const),
  ['psalm', 'PSA'],
]);

/**
 * Reverse map: internal book ID -> URL slug.
 * Used by buildBibleDeepLink only.
 */
const BOOK_ID_TO_SLUG = new Map<string, string>(
  bibleBooks.map((book) => [book.id, book.name.toLowerCase().replace(/\s/g, '')])
);

const CHAPTER_SEGMENT = /^\d+$/;
const VERSE_SEGMENT = /^(\d+)(?:-(\d+))?$/;

const isChapterOf = (bookId: string, chapter: number): boolean =>
  Number.isInteger(chapter) && chapter >= 1 && chapter <= (getBookById(bookId)?.chapters ?? 0);

const isVerseNumber = (verse: number | undefined): verse is number =>
  verse !== undefined && Number.isSafeInteger(verse) && verse >= 1;

/**
 * Parses a path like "/bible/john/3/16" or "/bible/john/3" into a BibleDeepLinkTarget.
 * Returns null if the path doesn't match the bible pattern, the book slug is unrecognized,
 * or the chapter segment is not a plain number naming one of the book's chapters. The
 * verse segment may be a number or a range ("16-18", either way round), which focuses
 * its first verse; anything else there opens the chapter without a focus. The query,
 * fragment and any segment after the verse are ignored.
 *
 * Example usage:
 *   parseBibleDeepLink('/bible/john/3/16')  => { bookId: 'JHN', chapter: 3, verse: 16 }
 *   parseBibleDeepLink('/bible/1corinthians/13') => { bookId: '1CO', chapter: 13 }
 *   parseBibleDeepLink('/bible/unknown/3/16') => null
 *   parseBibleDeepLink('/bible/john/3abc') => null
 */
export const parseBibleDeepLink = (path: string): BibleDeepLinkTarget | null => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const pathname = normalizedPath.split(/[?#]/, 1)[0] ?? '';
  const [, root, bookSlug = '', chapterStr = '', verseStr = ''] = pathname.split('/');
  // Reading only the leading digits made '/bible/john/1.5' open John 1.
  if (root !== 'bible' || !CHAPTER_SEGMENT.test(chapterStr)) return null;

  const slug = bookSlug.toLowerCase().replace(/\s/g, '');
  const bookId = SLUG_TO_BOOK_ID.get(slug);
  if (!bookId) return null;

  const chapter = parseInt(chapterStr, 10);
  if (!isChapterOf(bookId, chapter)) return null;

  // A verse that is not a real position (0, or too long to be a safe integer) is dropped.
  const verseMatch = VERSE_SEGMENT.exec(verseStr);
  const firstVerse = verseMatch
    ? Math.min(parseInt(verseMatch[1], 10), parseInt(verseMatch[2] ?? verseMatch[1], 10))
    : undefined;
  const verse = isVerseNumber(firstVerse) ? firstVerse : undefined;
  return { bookId, chapter, verse };
};

/**
 * Builds a shareable deep link URL for a Bible chapter or verse.
 * Returns '' if the bookId is not recognized or the book has no such chapter, so
 * every link it makes opens again; a verse that is not a positive whole number is
 * left out.
 *
 * Example usage:
 *   buildBibleDeepLink('JHN', 3, 16)  => 'com.everybible.app://bible/john/3/16'
 *   buildBibleDeepLink('JHN', 3)      => 'com.everybible.app://bible/john/3'
 *   buildBibleDeepLink('1CO', 13)     => 'com.everybible.app://bible/1corinthians/13'
 *   buildBibleDeepLink('INVALID', 1)  => ''
 */
export const buildBibleDeepLink = (bookId: string, chapter: number, verse?: number): string => {
  const slug = BOOK_ID_TO_SLUG.get(bookId);
  if (!slug || !isChapterOf(bookId, chapter)) return '';
  const base = `com.everybible.app://bible/${slug}/${chapter}`;
  return isVerseNumber(verse) ? `${base}/${verse}` : base;
};
