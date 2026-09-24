import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserReadingPlanProgress } from '../types';
import {
  batchPlanIds,
  buildMergeRpcRows,
  buildPlanTombstoneRow,
  getPlansNeedingClientClock,
  getPlansTheServerSkipped,
  getProgressEndedElsewhere,
  isSnapshotRowEndedByConfirmedLeave,
  rebaseRejoinPastStoredLeave,
  normalizeRemoteProgressRows,
  PLAN_PROGRESS_MERGE_BATCH_SIZE,
  shouldSyncPlanProgressRemotely,
  sortProgressNewestFirst,
} from './planSyncModel';

const row = (
  planId: string,
  startedAt = '2026-09-01T00:00:00.000Z',
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress => ({
  id: `row-${planId}`,
  plan_id: planId,
  started_at: startedAt,
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: startedAt,
  ...overrides,
});

test('only a blank plan id is kept off the server', () => {
  assert.equal(shouldSyncPlanProgressRemotely('psalms-30-days'), true);
  assert.equal(shouldSyncPlanProgressRemotely(' '), false);
  assert.equal(shouldSyncPlanProgressRemotely(undefined), true);
});

test('server rows without a plan are dropped and the slug names the plan', () => {
  const rows = normalizeRemoteProgressRows([
    {
      id: 'r1',
      user_id: 'u',
      plan_id: null,
      plan_slug: 'psalms-30-days',
      started_at: '2026-09-01T00:00:00.000Z',
      completed_entries: null,
      current_day: 1,
      is_completed: false,
      completed_at: null,
      synced_at: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'r2',
      user_id: 'u',
      plan_id: null,
      plan_slug: ' ',
      started_at: '2026-09-01T00:00:00.000Z',
      completed_entries: null,
      current_day: 1,
      is_completed: false,
      completed_at: null,
      synced_at: '2026-09-01T00:00:00.000Z',
    },
  ]);

  assert.deepEqual(
    rows.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
});

test('local rows list most recently started first, optionally for one plan', () => {
  const rows = [row('a', '2026-01-01T00:00:00.000Z'), row('b', '2026-03-01T00:00:00.000Z')];

  assert.deepEqual(
    sortProgressNewestFirst(rows).map((progress) => progress.plan_id),
    ['b', 'a']
  );
  assert.deepEqual(
    sortProgressNewestFirst(rows, 'a').map((progress) => progress.plan_id),
    ['a']
  );
  assert.deepEqual(
    rows.map((progress) => progress.plan_id),
    ['a', 'b']
  );
});

test('a tombstone ends only enrolments that started before the leave', () => {
  const leftAt = '2026-09-10T00:00:00.000Z';
  const unenrollments = new Map([
    ['before', leftAt],
    ['after', leftAt],
  ]);

  const ended = getProgressEndedElsewhere(
    [
      row('before', '2026-09-01T00:00:00.000Z'),
      row('after', '2026-09-11T00:00:00.000Z'),
      row('never', '2026-09-01T00:00:00.000Z'),
    ],
    unenrollments
  );

  assert.deepEqual([...ended], ['before']);
  assert.deepEqual([...getProgressEndedElsewhere([row('before')], null)], []);
});

test('plan ids are sent in batches the merge function accepts', () => {
  const planIds = Array.from({ length: 2 * PLAN_PROGRESS_MERGE_BATCH_SIZE + 1 }, (_, i) => `p${i}`);

  const batches = batchPlanIds(planIds);

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [100, 100, 1]
  );
  assert.deepEqual(batches.flat(), planIds);
  assert.deepEqual(batchPlanIds([]), []);
  assert.deepEqual(batchPlanIds(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
});

test('only a re-join the server has no row for is sent with the phone clock', () => {
  const unenrollments = new Map([
    ['left-new', 'x'],
    ['left-stored', 'x'],
  ]);

  const clock = getPlansNeedingClientClock(
    ['left-new', 'left-stored', 'never-left'],
    unenrollments,
    new Set(['left-stored'])
  );

  assert.deepEqual([...clock], ['left-new']);
  assert.deepEqual([...getPlansNeedingClientClock(['left-new'], null, new Set())], []);
});

test('merge rows carry the phone clock only for the plans that need it', () => {
  const rows = buildMergeRpcRows(
    [row('a'), row('b')],
    'user-a',
    new Set(['b']),
    '2026-09-24T00:00:00.000Z'
  );

  assert.deepEqual(
    rows.map((payload) => [payload.plan_slug, payload.user_id, 'client_clock_at' in payload]),
    [
      ['a', 'user-a', false],
      ['b', 'user-a', true],
    ]
  );
  assert.equal(
    rows[1] && 'client_clock_at' in rows[1] && rows[1].client_clock_at,
    '2026-09-24T00:00:00.000Z'
  );
  assert.equal(rows[0] && 'completed_sessions' in rows[0], true);
});

test('a pushed plan the server did not return is ended only if it was left and is still live', () => {
  const skipped = getPlansTheServerSkipped(
    ['returned', 'left-missing', 'never-left', 'left-pending'],
    [row('returned')],
    new Map([
      ['returned', 'x'],
      ['left-missing', 'x'],
      ['left-pending', 'x'],
    ]),
    (planId) => planId !== 'left-pending'
  );

  assert.deepEqual(skipped, ['left-missing']);
});

test('a snapshot row is dropped only for a leave confirmed now that ended its enrolment', () => {
  const confirmed = new Set(['left', 'untimed']);
  const leftAt = { left: '2026-09-10T00:00:00.000Z' };

  assert.equal(
    isSnapshotRowEndedByConfirmedLeave(row('left', '2026-09-01T00:00:00.000Z'), confirmed, leftAt),
    true
  );
  assert.equal(
    isSnapshotRowEndedByConfirmedLeave(row('left', '2026-09-11T00:00:00.000Z'), confirmed, leftAt),
    false
  );
  assert.equal(isSnapshotRowEndedByConfirmedLeave(row('untimed'), confirmed, leftAt), true);
  assert.equal(isSnapshotRowEndedByConfirmedLeave(row('other'), confirmed, leftAt), false);
});

test('a tombstone row carries the leave time and phone clock only when the leave time is known', () => {
  assert.deepEqual(buildPlanTombstoneRow('u', 'p', '2026-09-10T00:00:00.000Z', 'now'), {
    user_id: 'u',
    plan_slug: 'p',
    unenrolled_at: '2026-09-10T00:00:00.000Z',
    client_clock_at: 'now',
  });
  assert.deepEqual(buildPlanTombstoneRow('u', 'p', '2026-09-10T00:00:00.000Z'), {
    user_id: 'u',
    plan_slug: 'p',
    unenrolled_at: '2026-09-10T00:00:00.000Z',
  });
  assert.deepEqual(buildPlanTombstoneRow('u', 'p', undefined, 'now'), {
    user_id: 'u',
    plan_slug: 'p',
  });
});

test("a re-join after this phone's leave moves just past the leave the server stored", () => {
  const leftAt = '2026-09-01T12:00:00.000Z';
  // A phone 10 minutes slow: the server stored the leave at 12:10 on its clock.
  const stored = '2026-09-01T12:10:00.000Z';
  const rejoin = row('plan', '2026-09-01T12:01:00.000Z', { completed_entries: { '1': 'x' } });

  const moved = rebaseRejoinPastStoredLeave(rejoin, leftAt, stored);

  assert.equal(moved?.started_at, '2026-09-01T12:10:00.001Z');
  assert.deepEqual(moved?.completed_entries, { '1': 'x' });
  assert.equal(getProgressEndedElsewhere([moved!], new Map([['plan', stored]])).size, 0);
  // Pushed as it is: the start is already on the server's clock.
  assert.deepEqual(
    [...getPlansNeedingClientClock(['plan'], new Map([['plan', stored]]), new Set(), [moved!])],
    []
  );
  // A later leave elsewhere still ends it, and it then goes with the phone clock again.
  const later = new Map([['plan', '2026-09-01T12:20:00.000Z']]);
  assert.deepEqual([...getProgressEndedElsewhere([moved!], later)], ['plan']);
});

test('a start the stored leave does not end, or one from before the leave, is not moved', () => {
  const leftAt = '2026-09-01T12:00:00.000Z';
  // Fast or accurate phone: the re-join is already after the stored leave.
  assert.equal(
    rebaseRejoinPastStoredLeave(
      row('plan', '2026-09-01T12:01:00.000Z'),
      leftAt,
      '2026-09-01T11:50:00.000Z'
    ),
    null
  );
  // The enrolment the leave ended.
  assert.equal(
    rebaseRejoinPastStoredLeave(
      row('plan', '2026-09-01T11:00:00.000Z'),
      leftAt,
      '2026-09-01T12:10:00.000Z'
    ),
    null
  );
  // No recorded leave time (a leave queued by an older build).
  assert.equal(
    rebaseRejoinPastStoredLeave(
      row('plan', '2026-09-01T12:01:00.000Z'),
      undefined,
      '2026-09-01T12:10:00.000Z'
    ),
    null
  );
});
