import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChapterReviewHeadline } from '../../../services/feedback/chapterFeedbackReviewModel';
import type { ChapterFeedbackReviewItem } from '../../../services/feedback/chapterFeedbackReviewService';
import {
  getSourceFilterLabelKey,
  hasHeardEnough,
  mergeFeedbackPage,
  shouldShowNoMatching,
  SOURCE_FILTERS,
} from './feedbackReviewScreenModel';

const item = (id: string) => ({ id }) as ChapterFeedbackReviewItem;

test('each source filter is labelled, and an unknown one falls back to Everyone', () => {
  assert.deepEqual(
    SOURCE_FILTERS.map((filter) => [filter.value, getSourceFilterLabelKey(filter.value)]),
    [
      ['all', 'feedback.everyone'],
      ['scripture_council', 'feedback.council'],
      ['community', 'feedback.community'],
    ]
  );
  assert.equal(
    getSourceFilterLabelKey('legacy' as Parameters<typeof getSourceFilterLabelKey>[0]),
    'feedback.everyone'
  );
});

test('a first page replaces the list', () => {
  assert.deepEqual(mergeFeedbackPage([item('a')], [item('b')], false), [item('b')]);
});

test('a later page appends only the feedback not already listed, in page order', () => {
  assert.deepEqual(
    mergeFeedbackPage([item('a'), item('b')], [item('b'), item('c'), item('d')], true),
    [item('a'), item('b'), item('c'), item('d')]
  );
});

const open: ChapterReviewHeadline = { kind: 'open', count: 2 };
const caughtUp: ChapterReviewHeadline = { kind: 'caughtUp' };
const base = {
  loading: false,
  failed: false,
  summary: { bookId: 'JHN', chapter: 3, total: 3, unresolvedDown: 1, unresolvedUp: 1 },
  positiveOnly: false,
  positiveCount: 0,
  status: 'reviewed' as const,
  headline: open,
};

test('an empty filtered list over a chapter with feedback explains that nothing matches', () => {
  assert.equal(shouldShowNoMatching(base), true);
  assert.equal(shouldShowNoMatching({ ...base, status: 'pending' }), true);
  assert.equal(shouldShowNoMatching({ ...base, positiveOnly: true, positiveCount: 4 }), true);
});

test('nothing-matches stays quiet while loading, after a failure, or when another row explains', () => {
  assert.equal(shouldShowNoMatching({ ...base, loading: true }), false);
  assert.equal(shouldShowNoMatching({ ...base, failed: true }), false);
  assert.equal(shouldShowNoMatching({ ...base, summary: null }), false);
  assert.equal(
    shouldShowNoMatching({ ...base, summary: { ...base.summary, total: 0 } }),
    false,
    'the headline already says the chapter has no feedback'
  );
  assert.equal(
    shouldShowNoMatching({ ...base, positiveCount: 2 }),
    false,
    'the accurate-with-no-comment row lists what the comment list leaves out'
  );
  assert.equal(
    shouldShowNoMatching({ ...base, status: 'pending', headline: caughtUp }),
    false,
    'the caught-up headline already says there is nothing open'
  );
  assert.equal(shouldShowNoMatching({ ...base, headline: caughtUp }), true);
});

test('a voice note counts as listened once it finishes or 60% of it has played', () => {
  assert.equal(hasHeardEnough({ didJustFinish: true }), true);
  assert.equal(hasHeardEnough({ positionMillis: 6000, durationMillis: 10000 }), true);
  assert.equal(hasHeardEnough({ positionMillis: 5999, durationMillis: 10000 }), false);
  assert.equal(hasHeardEnough({ positionMillis: 5000 }), false, 'no duration yet');
  assert.equal(hasHeardEnough({ positionMillis: 0, durationMillis: 0 }), false);
});
