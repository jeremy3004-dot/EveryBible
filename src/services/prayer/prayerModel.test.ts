import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateInteractionCounts,
  attachCountsToPrayerRequests,
  validatePrayerContent,
  sortPrayerRequests,
} from './prayerModel';
import type { PrayerRequest } from '../supabase/types';
import type { PrayerRequestWithCounts } from './prayerService';

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
  const countMap = aggregateInteractionCounts(
    ['req-1'],
    [{ request_id: 'req-1', type: 'liked' }]
  );

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
// validatePrayerContent
// ---------------------------------------------------------------------------

test('validatePrayerContent returns null for non-empty content', () => {
  assert.equal(validatePrayerContent('Please pray for me'), null);
});

test('validatePrayerContent returns an error message for empty string', () => {
  const error = validatePrayerContent('');
  assert.ok(error !== null);
  assert.equal(typeof error, 'string');
});

test('validatePrayerContent rejects whitespace-only content', () => {
  const error = validatePrayerContent('   \t\n  ');
  assert.ok(error !== null);
});

test('validatePrayerContent accepts content with leading/trailing spaces', () => {
  // Trimmed content has characters, so it is valid
  assert.equal(validatePrayerContent('  pray for me  '), null);
});

// ---------------------------------------------------------------------------
// sortPrayerRequests
// ---------------------------------------------------------------------------

const makeWithCounts = (
  overrides: Partial<PrayerRequest & { prayed_count: number; encouraged_count: number }>
): PrayerRequestWithCounts => ({
  ...makePrayerRequest(overrides),
  prayed_count: overrides.prayed_count ?? 0,
  encouraged_count: overrides.encouraged_count ?? 0,
});

test('sortPrayerRequests places unanswered requests before answered ones', () => {
  const answered = makeWithCounts({
    id: 'answered',
    is_answered: true,
    created_at: '2026-03-22T12:00:00.000Z',
  });
  const unanswered = makeWithCounts({
    id: 'unanswered',
    is_answered: false,
    created_at: '2026-03-20T12:00:00.000Z',
  });

  const sorted = sortPrayerRequests([answered, unanswered]);

  assert.equal(sorted[0]?.id, 'unanswered');
  assert.equal(sorted[1]?.id, 'answered');
});

test('sortPrayerRequests orders unanswered requests newest-first within the group', () => {
  const older = makeWithCounts({
    id: 'older',
    is_answered: false,
    created_at: '2026-03-18T00:00:00.000Z',
  });
  const newer = makeWithCounts({
    id: 'newer',
    is_answered: false,
    created_at: '2026-03-22T00:00:00.000Z',
  });

  const sorted = sortPrayerRequests([older, newer]);

  assert.equal(sorted[0]?.id, 'newer');
  assert.equal(sorted[1]?.id, 'older');
});

test('sortPrayerRequests orders answered requests newest-first within the answered group', () => {
  const olderAnswered = makeWithCounts({
    id: 'old-ans',
    is_answered: true,
    created_at: '2026-03-10T00:00:00.000Z',
  });
  const newerAnswered = makeWithCounts({
    id: 'new-ans',
    is_answered: true,
    created_at: '2026-03-15T00:00:00.000Z',
  });

  const sorted = sortPrayerRequests([olderAnswered, newerAnswered]);

  assert.equal(sorted[0]?.id, 'new-ans');
  assert.equal(sorted[1]?.id, 'old-ans');
});

test('sortPrayerRequests does not mutate the input array', () => {
  const requests = [
    makeWithCounts({ id: 'a', is_answered: true, created_at: '2026-03-22T00:00:00.000Z' }),
    makeWithCounts({ id: 'b', is_answered: false, created_at: '2026-03-20T00:00:00.000Z' }),
  ];
  const originalOrder = requests.map((r) => r.id);

  sortPrayerRequests(requests);

  assert.deepEqual(
    requests.map((r) => r.id),
    originalOrder
  );
});
