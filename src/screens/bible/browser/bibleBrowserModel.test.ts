import test from 'node:test';
import assert from 'node:assert/strict';
import type { TranslatorFeedbackChapterSummary } from '../../../services/feedback/translatorFeedbackReviewModel';
import {
  bibleBrowserRows,
  browserRowKey,
  browserRowType,
  buildBookFeedbackStatusMap,
  buildChapterSummaryMap,
  buildReaderLaunchParams,
  chapterKey,
  estimateChapterPanelWidth,
  formatReferenceLabel,
  formatReferenceMeta,
  getBibleBrowserRowIndex,
  getChapterNumbers,
  isBibleSearchUnavailableError,
  isUnavailableChapterInBook,
  measuredChapterPanelWidth,
  searchResultKey,
} from './bibleBrowserModel';

const summary = (
  bookId: string,
  chapter: number,
  counts: Partial<
    Pick<TranslatorFeedbackChapterSummary, 'total' | 'unresolvedDown' | 'unresolvedUp'>
  >
): TranslatorFeedbackChapterSummary => ({
  bookId,
  chapter,
  total: 1,
  unresolvedDown: 0,
  unresolvedUp: 0,
  ...counts,
});

const echo = (key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ''}`;

test('row lookup finds a book row and reports -1 for an unknown book', () => {
  const johnIndex = getBibleBrowserRowIndex('JHN');
  assert.equal(bibleBrowserRows[johnIndex]?.id, 'book-JHN');
  assert.equal(getBibleBrowserRowIndex('GEN'), 0);
  assert.equal(getBibleBrowserRowIndex('NOPE'), -1);
  assert.equal(getBibleBrowserRowIndex('NT'), -1, 'the divider row is never a book');
});

test('list keys and item types come straight from the row, and verse keys from the id', () => {
  const divider = bibleBrowserRows.find((row) => row.type === 'divider');
  assert.ok(divider);
  assert.deepEqual([browserRowKey(divider), browserRowType(divider)], ['divider-NT', 'divider']);
  assert.deepEqual(
    [browserRowKey(bibleBrowserRows[0]), browserRowType(bibleBrowserRows[0])],
    ['book-GEN', 'books']
  );
  assert.equal(searchResultKey({ id: 42, bookId: 'JHN', chapter: 3, verse: 16, text: '' }), '42');
});

test('only an error named BibleSearchUnavailableError means search is unavailable', () => {
  const unavailable = Object.assign(new Error('no index'), { name: 'BibleSearchUnavailableError' });
  assert.equal(isBibleSearchUnavailableError(unavailable), true);
  assert.equal(isBibleSearchUnavailableError(new Error('disk I/O')), false);
  assert.equal(isBibleSearchUnavailableError({ name: 'BibleSearchUnavailableError' }), false);
  assert.equal(isBibleSearchUnavailableError(null), false);
});

test('a chapter note belongs to its own book only', () => {
  assert.equal(chapterKey('JHN', 4), 'JHN:4');
  assert.equal(isUnavailableChapterInBook('JHN:4', 'JHN'), true);
  assert.equal(isUnavailableChapterInBook('1JN:4', 'JHN'), false);
  assert.equal(isUnavailableChapterInBook(null, 'JHN'), false);
});

test('chapter numbers run from 1 through the chapter count', () => {
  assert.deepEqual(getChapterNumbers(3), [1, 2, 3]);
  assert.deepEqual(getChapterNumbers(0), []);
});

test('panel width is estimated from the window, then replaced by a positive measurement', () => {
  assert.equal(estimateChapterPanelWidth(390, 20, 4), 390 - 40 - 8);
  assert.equal(measuredChapterPanelWidth(300, 4), 292);
  assert.equal(measuredChapterPanelWidth(0, 4), null);
  assert.equal(measuredChapterPanelWidth(8, 4), null);
});

test('chapter summaries are indexed by book and chapter, the later entry winning', () => {
  const first = summary('JHN', 3, { total: 1 });
  const replacement = summary('JHN', 3, { total: 5 });
  const map = buildChapterSummaryMap([first, summary('GEN', 1, {}), replacement]);

  assert.deepEqual([...map.keys()], ['JHN:3', 'GEN:1']);
  assert.equal(map.get('JHN:3'), replacement);
});

test('a book is pending when any chapter is unresolved, addressed when any has feedback', () => {
  const statuses = buildBookFeedbackStatusMap([
    summary('JHN', 3, { unresolvedDown: 1 }),
    summary('JHN', 4, {}),
    summary('GEN', 1, {}),
    summary('ROM', 1, { total: 0 }),
    summary('EPH', 2, { unresolvedUp: 2 }),
  ]);

  assert.deepEqual(Object.fromEntries(statuses), {
    JHN: 'pending',
    GEN: 'addressed',
    // ROM's only row has no feedback, so, like its chapter tile, it gets no badge.
    EPH: 'pending',
  });
  assert.equal(buildBookFeedbackStatusMap([]).size, 0);
});

test('reader launch params carry the saved chapter mode', () => {
  assert.deepEqual(buildReaderLaunchParams({ bookId: 'JHN', chapter: 3, focusVerse: 16 }, 'read'), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    preferredMode: 'read',
  });
});

test('reference labels use the given book name and add the verse only when there is one', () => {
  const verseTarget = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };
  const chapterTarget = { bookId: 'ROM', chapter: 8, label: 'Romans 8' };

  assert.equal(formatReferenceLabel(verseTarget, 'Juan'), 'Juan 3:16');
  assert.equal(formatReferenceLabel(chapterTarget, 'Romanos'), 'Romanos 8');
  assert.equal(
    formatReferenceMeta(verseTarget, echo),
    'interface.chapterNumber{"chapter":3} • interface.verseNumber{"verse":16}'
  );
  assert.equal(formatReferenceMeta(chapterTarget, echo), 'interface.chapterNumber{"chapter":8}');
});
