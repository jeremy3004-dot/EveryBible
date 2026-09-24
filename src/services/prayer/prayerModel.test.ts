import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateInteractionCounts,
  attachCountsToPrayerRequests,
  isUnderReviewForViewer,
  PRAYER_REPORT_REASONS,
  prayerRequestActions,
  prayerWriteErrorCode,
} from './prayerModel';
import type { PrayerRequest } from '../supabase/types';

// ---------------------------------------------------------------------------
// aggregateInteractionCounts
// ---------------------------------------------------------------------------

test('aggregateInteractionCounts initializes all request ids with zero counts', () => {
  const countMap = aggregateInteractionCounts(['req-1', 'req-2'], []);

  assert.deepEqual(countMap['req-1'], { prayed: 0, encouraged: 0 });
  assert.deepEqual(countMap['req-2'], { prayed: 0, encouraged: 0 });
});

test('aggregateInteractionCounts tallies prayed and encouraged separately', () => {
  const countMap = aggregateInteractionCounts(
    ['req-1'],
    [
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'req-1', type: 'encouraged' },
    ]
  );

  assert.deepEqual(countMap['req-1'], { prayed: 2, encouraged: 1 });
});

test('aggregateInteractionCounts ignores interactions for unknown request ids', () => {
  const countMap = aggregateInteractionCounts(
    ['req-1'],
    [{ request_id: 'req-unknown', type: 'prayed' }]
  );

  assert.deepEqual(countMap['req-1'], { prayed: 0, encouraged: 0 });
  assert.equal(countMap['req-unknown'], undefined);
});

test('aggregateInteractionCounts ignores unknown interaction types', () => {
  const countMap = aggregateInteractionCounts(['req-1'], [{ request_id: 'req-1', type: 'liked' }]);

  assert.deepEqual(countMap['req-1'], { prayed: 0, encouraged: 0 });
});

test('aggregateInteractionCounts handles multiple requests independently', () => {
  const countMap = aggregateInteractionCounts(
    ['req-1', 'req-2'],
    [
      { request_id: 'req-1', type: 'prayed' },
      { request_id: 'req-2', type: 'encouraged' },
      { request_id: 'req-2', type: 'encouraged' },
    ]
  );

  assert.deepEqual(countMap['req-1'], { prayed: 1, encouraged: 0 });
  assert.deepEqual(countMap['req-2'], { prayed: 0, encouraged: 2 });
});

// ---------------------------------------------------------------------------
// attachCountsToPrayerRequests
// ---------------------------------------------------------------------------

const makePrayerRequest = (overrides: Partial<PrayerRequest>): PrayerRequest => ({
  id: 'req-1',
  group_id: 'group-1',
  user_id: 'user-1',
  content: 'Please pray for my family',
  is_answered: false,
  answered_at: null,
  created_at: '2026-03-20T10:00:00.000Z',
  updated_at: '2026-03-20T10:00:00.000Z',
  ...overrides,
});

test('attachCountsToPrayerRequests merges counts onto each request', () => {
  const requests = [makePrayerRequest({ id: 'req-1' }), makePrayerRequest({ id: 'req-2' })];
  const countMap = {
    'req-1': { prayed: 3, encouraged: 1 },
    'req-2': { prayed: 0, encouraged: 2 },
  };

  const result = attachCountsToPrayerRequests(requests, countMap);

  assert.equal(result[0]?.prayed_count, 3);
  assert.equal(result[0]?.encouraged_count, 1);
  assert.equal(result[1]?.prayed_count, 0);
  assert.equal(result[1]?.encouraged_count, 2);
});

test('attachCountsToPrayerRequests defaults to 0 counts when request id is missing from countMap', () => {
  const requests = [makePrayerRequest({ id: 'req-orphan' })];
  const countMap = {};

  const result = attachCountsToPrayerRequests(requests, countMap);

  assert.equal(result[0]?.prayed_count, 0);
  assert.equal(result[0]?.encouraged_count, 0);
});

test('attachCountsToPrayerRequests preserves all original request fields', () => {
  const request = makePrayerRequest({
    id: 'req-1',
    content: 'Healing prayer',
    is_answered: true,
    answered_at: '2026-03-22T09:00:00.000Z',
  });
  const countMap = { 'req-1': { prayed: 5, encouraged: 3 } };

  const result = attachCountsToPrayerRequests([request], countMap);

  assert.equal(result[0]?.content, 'Healing prayer');
  assert.equal(result[0]?.is_answered, true);
  assert.equal(result[0]?.answered_at, '2026-03-22T09:00:00.000Z');
});

// ---------------------------------------------------------------------------
// prayerRequestActions
// ---------------------------------------------------------------------------

const actionsFor = (overrides: Partial<Parameters<typeof prayerRequestActions>[0]>) =>
  prayerRequestActions({
    isSignedIn: true,
    isOwner: false,
    isLeader: false,
    isAnswered: false,
    canEdit: true,
    ...overrides,
  });

test('the author can edit, mark answered and delete an open request', () => {
  assert.deepEqual(actionsFor({ isOwner: true }), ['edit', 'markAnswered', 'delete']);
});

test('an answered request no longer offers mark answered', () => {
  assert.deepEqual(actionsFor({ isOwner: true, isAnswered: true }), ['edit', 'delete']);
});

test('edit is left out where the platform has no text prompt', () => {
  assert.deepEqual(actionsFor({ isOwner: true, isLeader: true, canEdit: false }), [
    'markAnswered',
    'delete',
  ]);
});

test("members can report someone else's request or block its author", () => {
  assert.deepEqual(actionsFor({}), ['report', 'block']);
});

test("the group leader can also remove someone else's request", () => {
  assert.deepEqual(actionsFor({ isLeader: true }), ['report', 'block', 'delete']);
});

test('the author is never offered report or block on their own request', () => {
  const own = actionsFor({ isOwner: true, isLeader: true });
  assert.ok(!own.includes('report') && !own.includes('block'));
});

test('a signed-out reader gets no actions', () => {
  assert.deepEqual(actionsFor({ isSignedIn: false, isLeader: true }), []);
});

// ---------------------------------------------------------------------------
// prayerWriteErrorCode / report reasons
// ---------------------------------------------------------------------------

test('server moderation refusals map to codes the wall can explain', () => {
  assert.equal(prayerWriteErrorCode('prayer_request_rate_limited'), 'rate_limited');
  assert.equal(prayerWriteErrorCode('prayer_report_rate_limited'), 'rate_limited');
  assert.equal(prayerWriteErrorCode('prayer_request_blocked_content'), 'content_rejected');
  assert.equal(prayerWriteErrorCode('prayer_wall_banned'), 'banned');
  assert.equal(prayerWriteErrorCode('permission denied'), undefined);
});

test('the report reasons are the ones the server accepts, in display order', () => {
  assert.deepEqual([...PRAYER_REPORT_REASONS], ['spam', 'abuse', 'sexual', 'harm', 'other']);
});

test('only the author sees that their request is under review', () => {
  assert.equal(isUnderReviewForViewer({ hidden_at: '2026-09-24T00:00:00Z' }, true), true);
  assert.equal(isUnderReviewForViewer({ hidden_at: '2026-09-24T00:00:00Z' }, false), false);
  assert.equal(isUnderReviewForViewer({ hidden_at: null }, true), false);
  assert.equal(isUnderReviewForViewer({}, true), false);
});
