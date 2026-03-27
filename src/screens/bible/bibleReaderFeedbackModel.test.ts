import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getChapterFeedbackResultVariant,
  isChapterFeedbackSentiment,
  normalizeChapterFeedbackComment,
  shouldEnableChapterFeedbackSubmit,
} from './bibleReaderFeedbackModel';

test('isChapterFeedbackSentiment accepts thumbs up and thumbs down only', () => {
  assert.equal(isChapterFeedbackSentiment('up'), true);
  assert.equal(isChapterFeedbackSentiment('down'), true);
  assert.equal(isChapterFeedbackSentiment('sideways'), false);
  assert.equal(isChapterFeedbackSentiment(null), false);
});

test('normalizeChapterFeedbackComment trims comments and converts blank text to null', () => {
  assert.equal(normalizeChapterFeedbackComment('  Needs a clearer intro  '), 'Needs a clearer intro');
  assert.equal(normalizeChapterFeedbackComment('   '), null);
});

test('shouldEnableChapterFeedbackSubmit only enables submit when a sentiment exists and submission is idle', () => {
  assert.equal(shouldEnableChapterFeedbackSubmit({ sentiment: 'up', isSubmitting: false }), true);
  assert.equal(
    shouldEnableChapterFeedbackSubmit({ sentiment: 'down', isSubmitting: true }),
    false
  );
  assert.equal(
    shouldEnableChapterFeedbackSubmit({ sentiment: null, isSubmitting: false }),
    false
  );
});

test('getChapterFeedbackResultVariant distinguishes exported, degraded, and failed submissions', () => {
  assert.equal(getChapterFeedbackResultVariant({ success: true, saved: true, exported: true }), 'submitted');
  assert.equal(
    getChapterFeedbackResultVariant({ success: true, saved: true, exported: false }),
    'saved-not-exported'
  );
  assert.equal(
    getChapterFeedbackResultVariant({ success: false, saved: false, exported: false }),
    'failed'
  );
});
