import { bibleBooks, type AdjacentBibleChapter, type BibleBook } from '../../constants/books';
import type { TranslationAudioCoverage } from '../../types';
import type { ElAudioManifest } from '../elMedia/elManifestModel';

export interface AudioBookCoverage {
  totalChapters?: number;
}

/** bookId → the chapters that actually have audio. */
export type AudioChapterMap = Record<string, readonly number[]>;

/**
 * The narrowest shape this model needs. Declaring it structurally (rather than as a
 * Pick of BibleTranslation) keeps the tests free of catalog fields that have no
 * bearing on availability, while a real BibleTranslation still satisfies it.
 */
export interface TranslationContentSummary {
  hasText: boolean;
  hasAudio: boolean;
  catalog?: {
    audio?: {
      coverage?: TranslationAudioCoverage;
      books?: Record<string, AudioBookCoverage>;
    };
  };
  /**
   * Exact per-chapter coverage resolved from a signed audio manifest at runtime. When
   * present it is authoritative and replaces the coarser catalog coverage/books data —
   * Every Language entries carry neither, and their manifests can be sparse (Bhujel's
   * Psalms is a single chapter, 117), so a chapter count would not do.
   */
  audioChapters?: AudioChapterMap;
}

export type AvailabilityBook = Pick<BibleBook, 'id' | 'testament'>;

export interface ContentAvailability {
  hasText: boolean;
  hasAudio: boolean;
  /** False only when we have positive evidence that neither text nor audio exists. */
  isAvailable: boolean;
}

/**
 * Availability is deliberately optimistic: the browser greys a row out only when the
 * catalog positively says the content is missing. A translation whose catalog has not
 * resolved yet (or that carries no per-book data) stays tappable, because telling a
 * reader "not available yet" about a chapter that does exist is worse than letting the
 * reader screen handle an empty chapter.
 */
function hasAudioForBook(book: AvailabilityBook, translation: TranslationContentSummary): boolean {
  if (!translation.hasAudio) {
    return false;
  }

  if (translation.audioChapters) {
    const chapters = findBookEntry(translation.audioChapters, book.id);
    return chapters !== undefined && chapters.length > 0;
  }

  const audio = translation.catalog?.audio;
  const books = audio?.books;

  // An empty map means "no per-book data", not "no books".
  if (books && Object.keys(books).length > 0) {
    return findBookEntry(books, book.id) !== undefined;
  }

  if (audio?.coverage === 'new-testament') {
    return book.testament === 'NT';
  }

  return true;
}

function findBookEntry<T>(books: Record<string, T> | undefined, bookId: string): T | undefined {
  if (!books) {
    return undefined;
  }

  const direct = books[bookId] ?? books[bookId.toUpperCase()] ?? books[bookId.toLowerCase()];
  if (direct) {
    return direct;
  }

  const matchingKey = Object.keys(books).find((key) => key.toLowerCase() === bookId.toLowerCase());
  return matchingKey ? books[matchingKey] : undefined;
}

export function getBookContentAvailability(
  book: AvailabilityBook,
  translation?: TranslationContentSummary
): ContentAvailability {
  if (!translation) {
    return { hasText: true, hasAudio: true, isAvailable: true };
  }

  const hasText = translation.hasText;
  const hasAudio = hasAudioForBook(book, translation);

  return { hasText, hasAudio, isAvailable: hasText || hasAudio };
}

export function getChapterContentAvailability(
  book: AvailabilityBook,
  chapter: number,
  translation?: TranslationContentSummary
): ContentAvailability {
  const bookAvailability = getBookContentAvailability(book, translation);

  if (!translation || !bookAvailability.hasAudio) {
    return bookAvailability;
  }

  const hasAudio = translation.audioChapters
    ? (findBookEntry(translation.audioChapters, book.id)?.includes(chapter) ?? false)
    : hasAudioForChapterInCatalog(translation, book.id, chapter);

  return {
    hasText: bookAvailability.hasText,
    hasAudio,
    isAvailable: bookAvailability.hasText || hasAudio,
  };
}

// Catalog per-book data only carries a chapter count, so this assumes audio runs 1..N.
function hasAudioForChapterInCatalog(
  translation: TranslationContentSummary,
  bookId: string,
  chapter: number
): boolean {
  const totalChapters = findBookEntry(translation.catalog?.audio?.books, bookId)?.totalChapters;
  return totalChapters === undefined || chapter <= totalChapters;
}

export function buildAudioChapterMapFromElManifest(
  manifest: Pick<ElAudioManifest, 'books'>
): AudioChapterMap {
  const map: AudioChapterMap = {};

  for (const [bookId, chapters] of Object.entries(manifest.books)) {
    map[bookId] = Array.from(new Set(chapters.map((entry) => entry.chapter))).sort((a, b) => a - b);
  }

  return map;
}

/** The covered chapters for a book, tolerating manifest keys of any case. */
export function getAudioChaptersForBook(
  audioChapters: AudioChapterMap | undefined,
  bookId: string
): readonly number[] | undefined {
  return findBookEntry(audioChapters, bookId);
}

/**
 * Whether a specific chapter is in the resolved audio manifest.
 *
 * isRemoteAudioAvailable() can only say an Every Language manifest is *addressable*, so
 * consumers that name one chapter — Home's daily scripture, the reader — must ask the
 * exact map instead. `undefined` means the manifest has not resolved yet (or the
 * translation has none), and the answer stays optimistic, matching getBookContentAvailability.
 */
export function isChapterAudioCovered(
  audioChapters: AudioChapterMap | undefined,
  bookId: string,
  chapter: number
): boolean {
  if (!audioChapters) {
    return true;
  }

  return getAudioChaptersForBook(audioChapters, bookId)?.includes(chapter) ?? false;
}

/**
 * The nearest chapter that actually has audio, walking `direction` from
 * (bookId, chapter) through the canonical book order.
 *
 * Only meaningful with an exact chapter map: an Every Language set can cover two
 * chapters of Joshua, one of 1 Kings and Psalm 117 alone, so plain adjacency
 * (getAdjacentBibleChapter) walks the reader into chapters that can never play.
 * The starting chapter itself is never returned, and neither is anything past the
 * ends of the covered set — callers treat null as "stop here".
 */
export function findAdjacentAvailableChapter(
  bookId: string,
  chapter: number,
  direction: -1 | 1,
  audioChapters: AudioChapterMap
): AdjacentBibleChapter | null {
  const startIndex = bibleBooks.findIndex((book) => book.id === bookId);
  if (startIndex === -1) {
    return null;
  }

  for (let index = startIndex; index >= 0 && index < bibleBooks.length; index += direction) {
    const candidateBookId = bibleBooks[index].id;
    const chapters = getAudioChaptersForBook(audioChapters, candidateBookId);
    if (!chapters || chapters.length === 0) {
      continue;
    }

    // Sorting defensively: the map usually comes from buildAudioChapterMapFromElManifest
    // (already sorted), but a hand-built map should not silently pick the wrong chapter.
    const ordered = [...chapters].sort((a, b) => a - b);
    const reachable =
      index === startIndex
        ? ordered.filter((entry) => (direction === 1 ? entry > chapter : entry < chapter))
        : ordered;

    if (reachable.length === 0) {
      continue;
    }

    return {
      bookId: candidateBookId,
      chapter: direction === 1 ? reachable[0] : reachable[reachable.length - 1],
    };
  }

  return null;
}
