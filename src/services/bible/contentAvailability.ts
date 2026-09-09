import type { BibleBook } from '../../constants/books';
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
