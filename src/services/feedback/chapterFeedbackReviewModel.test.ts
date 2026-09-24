import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChapterFeedbackReviewItem } from './chapterFeedbackReviewService';
import {
  buildReviewQueue,
  canSubmitResolution,
  formatVoiceNoteDuration,
  getChapterReviewHeadline,
  getFeedbackOutcomeKey,
  getFeedbackSourceKey,
  advanceReviewSession,
  getNextQueuedId,
  getResolutionChoices,
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

test('the headline counts every open decision, concerns and praise alike', () => {
  assert.deepEqual(getChapterReviewHeadline(summary(2, 1, 7), false), {
    kind: 'waiting',
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

test('the review queue holds only open items and starts at the tapped one', () => {
  const items = [
    item({ id: 'a' }),
    item({ id: 'b', resolution: 'fixed' }),
    item({ id: 'c' }),
    item({ id: 'd', sentiment: 'up' }),
  ];
  assert.deepEqual(buildReviewQueue(items), ['a', 'c', 'd']);
  assert.deepEqual(buildReviewQueue(items, 'c'), ['c', 'd', 'a']);
  assert.deepEqual(buildReviewQueue(items, 'b'), ['a', 'c', 'd']);
});

test('the queue advances past decided and skipped items and ends when none remain', () => {
  const queue = ['a', 'b', 'c'];
  assert.equal(getNextQueuedId(queue, new Set(), 'a'), 'b');
  assert.equal(getNextQueuedId(queue, new Set(['b']), 'a'), 'c');
  assert.equal(getNextQueuedId(queue, new Set(['a']), 'c'), 'b');
  assert.equal(getNextQueuedId(queue, new Set(['a', 'b', 'c']), 'c'), null);
  assert.equal(getNextQueuedId(['a'], new Set(), 'a'), null);
  assert.equal(getNextQueuedId([], new Set(), null), null);
});

test('voice note durations read as minutes and padded seconds', () => {
  assert.equal(formatVoiceNoteDuration(42_400), '0:42');
  assert.equal(formatVoiceNoteDuration(125_000), '2:05');
  assert.equal(formatVoiceNoteDuration(-5), '0:00');
});

test('a decision that lands after the review was closed does not reopen it', () => {
  // The reviewer taps Addressed, then closes the sheet before the server answers.
  assert.equal(advanceReviewSession(null, 'a'), null);
});

test('a decision that lands after a skip advances from the latest session', () => {
  const opened = { queue: ['a', 'b', 'c'], currentId: 'a', handled: new Set<string>() };
  // Skip moves on to b while a's decision is still saving; then the decision lands.
  const skipped = advanceReviewSession(opened, 'a');
  const decided = advanceReviewSession(skipped, 'a');

  assert.equal(decided?.currentId, 'b');
  assert.deepEqual([...(decided?.handled ?? [])], ['a']);
});
