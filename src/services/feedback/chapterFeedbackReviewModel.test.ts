import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChapterFeedbackReviewItem } from './chapterFeedbackReviewService';
import {
  canSubmitResolution,
  formatVoiceNoteDuration,
  getChapterReviewHeadline,
  getFeedbackOutcomeKey,
  getFeedbackSourceKey,
  getResolutionChoices,
  getResolutionLabelKey,
  requiresResolutionNote,
} from './chapterFeedbackReviewModel';

const item = (overrides: Partial<ChapterFeedbackReviewItem> = {}): ChapterFeedbackReviewItem => ({
  id: 'a',
  createdAt: '2026-03-28T10:00:00Z',
  translationId: 'bsb',
  translationLanguage: 'en',
  bookId: 'GEN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Offspring should stay singular',
  participantName: 'Anna',
  participantRole: null,
  participantIdNumber: null,
  sourceScreen: 'reader',
  resolution: null,
  resolvedAt: null,
  resolutionNote: null,
  audioResponse: null,
  contributorCategory: 'scripture_council',
  ...overrides,
});

const summary = (unresolvedDown: number, unresolvedUp: number, total: number) => ({
  bookId: 'GEN',
  chapter: 3,
  total,
  unresolvedDown,
  unresolvedUp,
});

test('the headline counts every open item, concerns and praise alike', () => {
  assert.deepEqual(getChapterReviewHeadline(summary(2, 1, 7), false), {
    kind: 'open',
    count: 3,
  });
});

test('the headline says caught up once feedback exists and nothing is open', () => {
  assert.deepEqual(getChapterReviewHeadline(summary(0, 0, 1), false), { kind: 'caughtUp' });
});

test('the headline tells loading apart from a chapter nobody has reviewed', () => {
  assert.deepEqual(getChapterReviewHeadline(null, true), { kind: 'loading' });
  assert.deepEqual(getChapterReviewHeadline(summary(0, 0, 0), false), { kind: 'empty' });
});

test('source labels name the council, the community, or a legacy submission', () => {
  assert.equal(getFeedbackSourceKey(item()), 'feedback.council');
  assert.equal(
    getFeedbackSourceKey(item({ contributorCategory: 'community' })),
    'feedback.community'
  );
  assert.equal(getFeedbackSourceKey(item({ contributorCategory: null })), 'feedback.legacy');
});

test('outcomes separate a fix, a kept reading, and reviewed praise', () => {
  assert.equal(getFeedbackOutcomeKey(item()), 'feedback.needsReview');
  assert.equal(getFeedbackOutcomeKey(item({ resolution: 'fixed' })), 'feedback.addressed');
  assert.equal(
    getFeedbackOutcomeKey(item({ resolution: 'no_change_needed' })),
    'feedback.noChange'
  );
  assert.equal(
    getFeedbackOutcomeKey(item({ sentiment: 'up', resolution: 'no_change_needed' })),
    'feedback.reviewed'
  );
});

test('an open concern needs a written reason before it can be settled', () => {
  assert.equal(requiresResolutionNote(item()), true);
  assert.equal(canSubmitResolution(item(), '   '), false);
  assert.equal(canSubmitResolution(item(), 'Kept the singular'), true);
});

test('praise and already settled items never ask for a reason', () => {
  assert.equal(canSubmitResolution(item({ sentiment: 'up' }), ''), true);
  assert.equal(requiresResolutionNote(item({ resolution: 'fixed' })), false);
});

test('concerns offer fix or keep, praise offers reviewed, settled items offer nothing', () => {
  assert.deepEqual(getResolutionChoices(item()), ['fixed', 'no_change_needed']);
  assert.deepEqual(getResolutionChoices(item({ sentiment: 'up' })), ['no_change_needed']);
  assert.deepEqual(getResolutionChoices(item({ resolution: 'fixed' })), []);
});

test('voice note durations read as minutes and padded seconds', () => {
  assert.equal(formatVoiceNoteDuration(42_400), '0:42');
  assert.equal(formatVoiceNoteDuration(125_000), '2:05');
  assert.equal(formatVoiceNoteDuration(-5), '0:00');
});

test('settle buttons read Mark addressed, No change needed, or Mark reviewed for praise', () => {
  assert.equal(getResolutionLabelKey(item(), 'fixed'), 'feedback.markAddressed');
  assert.equal(getResolutionLabelKey(item(), 'no_change_needed'), 'feedback.noChange');
  assert.equal(
    getResolutionLabelKey(item({ sentiment: 'up' }), 'no_change_needed'),
    'feedback.markReviewed'
  );
});
