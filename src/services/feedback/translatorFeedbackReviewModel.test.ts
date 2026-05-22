import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEnableTranslatorReviewMode,
  getTranslatorFeedbackReviewStatus,
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
} from './translatorFeedbackReviewModel';

test('translator review mode only enables with the configured passcode', () => {
  assert.equal(canEnableTranslatorReviewMode('342121'), true);
  assert.equal(canEnableTranslatorReviewMode(' 342121 '), true);
  assert.equal(canEnableTranslatorReviewMode('342120'), false);
  assert.equal(canEnableTranslatorReviewMode(''), false);
});

test('feedback review status keeps unread items visible until read and listened', () => {
  const markers = {};

  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, markers),
    {
      isRead: false,
      isListened: false,
      needsReview: true,
    }
  );

  const readMarkers = markTranslatorFeedbackRead(markers, 'feedback-1', '2026-05-22T01:00:00Z');
  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-1', hasAudio: true }, readMarkers),
    {
      isRead: true,
      isListened: false,
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
      needsReview: false,
    }
  );
});

test('text-only feedback no longer needs review after being marked read', () => {
  const markers = markTranslatorFeedbackRead({}, 'feedback-2', '2026-05-22T01:00:00Z');

  assert.deepEqual(
    getTranslatorFeedbackReviewStatus({ id: 'feedback-2', hasAudio: false }, markers),
    {
      isRead: true,
      isListened: true,
      needsReview: false,
    }
  );
});
