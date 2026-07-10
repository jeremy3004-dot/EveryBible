import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTranslatorFeedbackBookSummaryStatus,
  getTranslatorFeedbackChapterSummaryStatus,
  getTranslatorFeedbackReviewStatus,
  getTranslatorFeedbackUnresolvedCount,
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  normalizeTranslatorReviewPasscode,
  resolveDevelopmentTranslatorReviewPasscode,
  sortTranslatorFeedbackQueue,
  type TranslatorFeedbackChapterSummary,
} from './translatorFeedbackReviewModel';

test('translator review passcodes are normalized without validating the secret client-side', () => {
  assert.equal(normalizeTranslatorReviewPasscode(' reviewer-code '), 'reviewer-code');
  assert.equal(normalizeTranslatorReviewPasscode(''), null);
  assert.equal(normalizeTranslatorReviewPasscode('   '), null);
});

test('development translator review passcode only resolves in dev builds', () => {
  assert.equal(
    resolveDevelopmentTranslatorReviewPasscode(
      { EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE: ' reviewer-code ' },
      true
    ),
    'reviewer-code'
  );
  assert.equal(
    resolveDevelopmentTranslatorReviewPasscode(
      { EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE: ' reviewer-code ' },
      false
    ),
    null
  );
  assert.equal(resolveDevelopmentTranslatorReviewPasscode({}, true), null);
});

test('review status derives resolution from server data, not local markers', () => {
  const markers = {};

  // Unresolved on the server: needs review regardless of read/listened state.
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus(
      { id: 'feedback-1', hasAudio: true, resolution: null },
      markers
    ),
    {
      isRead: false,
      isListened: false,
      resolution: null,
      needsReview: true,
    }
  );

  const readMarkers = markTranslatorFeedbackRead(markers, 'feedback-1', '2026-05-22T01:00:00Z');
  const listenedMarkers = markTranslatorFeedbackListened(
    readMarkers,
    'feedback-1',
    '2026-05-22T01:01:00Z'
  );

  // Local read/listened flags update the UX affordances but do not resolve the item.
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus(
      { id: 'feedback-1', hasAudio: true, resolution: null },
      listenedMarkers
    ),
    {
      isRead: true,
      isListened: true,
      resolution: null,
      needsReview: true,
    }
  );

  // Server resolution is what flips needsReview to false.
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus(
      { id: 'feedback-1', hasAudio: true, resolution: 'fixed' },
      listenedMarkers
    ),
    {
      isRead: true,
      isListened: true,
      resolution: 'fixed',
      needsReview: false,
    }
  );
});

test('audio-less items are treated as listened for UX purposes', () => {
  assert.equal(
    getTranslatorFeedbackReviewStatus(
      { id: 'feedback-2', hasAudio: false, resolution: 'no_change_needed' },
      {}
    ).isListened,
    true
  );
});

test('chapter summary status reflects server-side unresolved counts', () => {
  const pending: TranslatorFeedbackChapterSummary = {
    bookId: 'GEN',
    chapter: 1,
    total: 3,
    unresolvedDown: 1,
    unresolvedUp: 0,
  };
  const addressed: TranslatorFeedbackChapterSummary = {
    bookId: 'GEN',
    chapter: 2,
    total: 2,
    unresolvedDown: 0,
    unresolvedUp: 0,
  };
  const empty: TranslatorFeedbackChapterSummary = {
    bookId: 'GEN',
    chapter: 3,
    total: 0,
    unresolvedDown: 0,
    unresolvedUp: 0,
  };

  assert.equal(getTranslatorFeedbackChapterSummaryStatus(pending), 'pending');
  assert.equal(getTranslatorFeedbackChapterSummaryStatus(addressed), 'addressed');
  assert.equal(getTranslatorFeedbackChapterSummaryStatus(empty), null);
  assert.equal(getTranslatorFeedbackUnresolvedCount(pending), 1);
});

test('book summary status is pending when any chapter still has unresolved feedback', () => {
  const summaries: TranslatorFeedbackChapterSummary[] = [
    { bookId: 'GEN', chapter: 1, total: 2, unresolvedDown: 0, unresolvedUp: 0 },
    { bookId: 'GEN', chapter: 2, total: 1, unresolvedDown: 0, unresolvedUp: 1 },
    { bookId: 'EXO', chapter: 1, total: 1, unresolvedDown: 0, unresolvedUp: 0 },
  ];

  assert.equal(getTranslatorFeedbackBookSummaryStatus('GEN', summaries), 'pending');
  assert.equal(getTranslatorFeedbackBookSummaryStatus('EXO', summaries), 'addressed');
  assert.equal(getTranslatorFeedbackBookSummaryStatus('LEV', summaries), null);
});

test('queue sorts unresolved chapters by thumbs-down urgency then volume', () => {
  const summaries: TranslatorFeedbackChapterSummary[] = [
    { bookId: 'GEN', chapter: 5, total: 4, unresolvedDown: 0, unresolvedUp: 0 },
    { bookId: 'GEN', chapter: 1, total: 3, unresolvedDown: 1, unresolvedUp: 1 },
    { bookId: 'EXO', chapter: 2, total: 5, unresolvedDown: 2, unresolvedUp: 0 },
    { bookId: 'LEV', chapter: 3, total: 2, unresolvedDown: 0, unresolvedUp: 2 },
  ];

  const queue = sortTranslatorFeedbackQueue(summaries);

  // Fully-resolved GEN 5 is dropped; EXO 2 (2 down) leads, then GEN 1 (1 down), then LEV 3.
  assert.deepEqual(
    queue.map((summary) => `${summary.bookId}:${summary.chapter}`),
    ['EXO:2', 'GEN:1', 'LEV:3']
  );
});
