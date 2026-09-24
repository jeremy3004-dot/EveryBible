import { bibleBooks } from '../../../constants/books';
import { buildBibleBrowserRows, type BibleBrowserRow } from '../../../services/bible/browserRows';
import type { PassageReferenceTarget } from '../../../services/bible/referenceParser';
import {
  getTranslatorFeedbackBookSummaryStatus,
  type TranslatorFeedbackAggregateStatus,
  type TranslatorFeedbackChapterSummary,
} from '../../../services/feedback/translatorFeedbackReviewModel';
import type { BibleStackParamList } from '../../../navigation/types';
import type { Verse } from '../../../types';

type ReaderParams = BibleStackParamList['BibleReader'];
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Every book, one per row, with a single divider before the New Testament. */
export const bibleBrowserRows = buildBibleBrowserRows(bibleBooks);
export const BIBLE_BROWSER_ROW_ESTIMATED_SIZE = 52;
export const SEARCH_RESULT_ESTIMATED_SIZE = 118;

export function getBibleBrowserRowIndex(
  bookId: string,
  rows: readonly BibleBrowserRow[] = bibleBrowserRows
): number {
  return rows.findIndex((row) => row.type === 'books' && row.books[0]?.id === bookId);
}

// Module-level so the list receives the same functions on every render.
export const browserRowKey = (row: BibleBrowserRow): string => row.id;
export const browserRowType = (row: BibleBrowserRow): BibleBrowserRow['type'] => row.type;
export const searchResultKey = (verse: Verse): string => String(verse.id);

/**
 * Matched by name rather than `instanceof`, so classifying a search failure never
 * pulls the SQLite module into the browser's first render.
 */
export function isBibleSearchUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.name === 'BibleSearchUnavailableError';
}

export const chapterKey = (bookId: string, chapter: number): string => `${bookId}:${chapter}`;

/** True when the "not available yet" chapter note belongs to this book. */
export function isUnavailableChapterInBook(
  unavailableChapterKey: string | null,
  bookId: string
): boolean {
  return unavailableChapterKey?.startsWith(`${bookId}:`) ?? false;
}

export function getChapterNumbers(chapterCount: number): number[] {
  return Array.from({ length: chapterCount }, (_, index) => index + 1);
}

/**
 * First estimate of the width the chapter tiles share: the window minus the list
 * padding and the panel's own horizontal inset, until the panel measures itself.
 */
export function estimateChapterPanelWidth(
  windowWidth: number,
  screenPadding: number,
  panelInset: number
): number {
  return windowWidth - screenPadding * 2 - panelInset * 2;
}

/** The measured panel width minus its own inset, or null for a layout pass with no width. */
export function measuredChapterPanelWidth(layoutWidth: number, panelInset: number): number | null {
  const width = layoutWidth - panelInset * 2;
  return width > 0 ? width : null;
}

export function buildChapterSummaryMap(
  summaries: readonly TranslatorFeedbackChapterSummary[]
): Map<string, TranslatorFeedbackChapterSummary> {
  const byChapter = new Map<string, TranslatorFeedbackChapterSummary>();
  summaries.forEach((summary) => {
    byChapter.set(chapterKey(summary.bookId, summary.chapter), summary);
  });
  return byChapter;
}

/** Book-level badge status, computed once per summary load instead of once per row render. */
export function buildBookFeedbackStatusMap(
  summaries: readonly TranslatorFeedbackChapterSummary[]
): Map<string, TranslatorFeedbackAggregateStatus> {
  const byBook = new Map<string, TranslatorFeedbackChapterSummary[]>();
  summaries.forEach((summary) => {
    const bookSummaries = byBook.get(summary.bookId);
    if (bookSummaries) {
      bookSummaries.push(summary);
    } else {
      byBook.set(summary.bookId, [summary]);
    }
  });

  const statuses = new Map<string, TranslatorFeedbackAggregateStatus>();
  byBook.forEach((bookSummaries, bookId) => {
    const status = getTranslatorFeedbackBookSummaryStatus(bookId, bookSummaries);
    if (status) {
      statuses.set(bookId, status);
    }
  });
  return statuses;
}

export function buildReaderLaunchParams(
  params: Pick<ReaderParams, 'bookId' | 'chapter' | 'focusVerse'>,
  preferredMode: ReaderParams['preferredMode']
): ReaderParams {
  return { ...params, preferredMode };
}

/** The parser labels references with English book names; this uses the interface language's. */
export function formatReferenceLabel(target: PassageReferenceTarget, bookName: string): string {
  return `${bookName} ${target.chapter}${target.focusVerse ? `:${target.focusVerse}` : ''}`;
}

export function formatReferenceMeta(target: PassageReferenceTarget, t: Translate): string {
  const chapterLine = t('interface.chapterNumber', { chapter: target.chapter });
  return target.focusVerse
    ? `${chapterLine} • ${t('interface.verseNumber', { verse: target.focusVerse })}`
    : chapterLine;
}
