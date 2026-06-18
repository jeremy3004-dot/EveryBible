import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTranslatorFeedbackBookSummaryStatus,
  getTranslatorFeedbackChapterSummaryStatus,
  getTranslatorFeedbackReviewStatus,
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  normalizeTranslatorReviewPasscode,
  reopenTranslatorFeedback,
  resolveDevelopmentTranslatorReviewPasscode,
  resolveTranslatorFeedback,
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

test('feedback review status stays open until each item is resolved', () => {
  const markers = {};

  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, markers),
    {
      isRead: false,
      isListened: false,
      resolution: null,
      needsReview: true,
    }
  );

  const readMarkers = markTranslatorFeedbackRead(markers, 'feedback-1', '2026-05-22T01:00:00Z');
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, readMarkers),
    {
      isRead: true,
      isListened: false,
      resolution: null,
      needsReview: true,
    }
  );

  const listenedMarkers = markTranslatorFeedbackListened(
    readMarkers,
    'feedback-1',
    '2026-05-22T01:01:00Z'
  );
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, listenedMarkers),
    {
      isRead: true,
      isListened: true,
      resolution: null,
      needsReview: true,
    }
  );

  const fixedMarkers = resolveTranslatorFeedback(
    listenedMarkers,
    'feedback-1',
    'fixed',
    '2026-05-22T01:02:00Z'
  );
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, fixedMarkers),
    {
      isRead: true,
      isListened: true,
      resolution: 'fixed',
      needsReview: false,
    }
  );
});

test('text-only feedback can be resolved as no action needed', () => {
  const markers = resolveTranslatorFeedback({}, 'feedback-2', 'reviewed', '2026-05-22T01:00:00Z');

  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-2', hasAudio: false }, markers),
    {
      isRead: true,
      isListened: true,
      resolution: 'reviewed',
      needsReview: false,
    }
  );
});

test('chapter summaries stay pending until every feedback item is reviewed', () => {
  const summary = {
    bookId: 'GEN',
    chapter: 1,
    feedback: [
      { id: 'feedback-text', hasAudio: false },
      { id: 'feedback-audio', hasAudio: true },
    ],
  };
  const textResolvedMarkers = resolveTranslatorFeedback(
    {},
    'feedback-text',
    'fixed',
    '2026-05-22T01:00:00Z'
  );

  assert.equal(getTranslatorFeedbackChapterSummaryStatus(summary, textResolvedMarkers), 'pending');

  const addressedMarkers = resolveTranslatorFeedback(
    textResolvedMarkers,
    'feedback-audio',
    'reviewed',
    '2026-05-22T01:02:00Z'
  );

  assert.equal(getTranslatorFeedbackChapterSummaryStatus(summary, addressedMarkers), 'addressed');
});

test('new feedback makes addressed book summaries pending again', () => {
  const summaries = [
    {
      bookId: 'GEN',
      chapter: 1,
      feedback: [{ id: 'feedback-old', hasAudio: false }],
    },
  ];
  const addressedMarkers = resolveTranslatorFeedback(
    {},
    'feedback-old',
    'fixed',
    '2026-05-22T01:00:00Z'
  );

  assert.equal(
    getTranslatorFeedbackBookSummaryStatus('GEN', summaries, addressedMarkers),
    'addressed'
  );

  const summariesWithNewFeedback = [
    {
      bookId: 'GEN',
      chapter: 1,
      feedback: [
        { id: 'feedback-old', hasAudio: false },
        { id: 'feedback-new', hasAudio: false },
      ],
    },
  ];

  assert.equal(
    getTranslatorFeedbackBookSummaryStatus('GEN', summariesWithNewFeedback, addressedMarkers),
    'pending'
  );
});

test('reopening one resolved feedback item makes the chapter pending again', () => {
  const summary = {
    bookId: 'GEN',
    chapter: 1,
    feedback: [
      { id: 'feedback-1', hasAudio: false },
      { id: 'feedback-2', hasAudio: false },
    ],
  };
  const addressedMarkers = resolveTranslatorFeedback(
    resolveTranslatorFeedback({}, 'feedback-1', 'fixed', '2026-05-22T01:00:00Z'),
    'feedback-2',
    'reviewed',
    '2026-05-22T01:01:00Z'
  );

  assert.equal(getTranslatorFeedbackChapterSummaryStatus(summary, addressedMarkers), 'addressed');

  const reopenedMarkers = reopenTranslatorFeedback(addressedMarkers, 'feedback-1');

  assert.equal(getTranslatorFeedbackChapterSummaryStatus(summary, reopenedMarkers), 'pending');
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: false }, reopenedMarkers),
    {
      isRead: true,
      isListened: true,
      resolution: null,
      needsReview: true,
    }
  );
});
