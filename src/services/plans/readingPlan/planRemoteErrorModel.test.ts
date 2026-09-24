import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMissingClockColumnError,
  isMissingMergeRpcError,
  isMissingSessionColumnError,
  isMissingTableError,
  isNoRowForSingleError,
} from './planRemoteErrorModel';

test('a missing table is recognised from PostgREST or Postgres', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ code: '42501' }), false);
  assert.equal(isMissingTableError(null), false);
});

test('a missing column counts only for the column the caller can drop', () => {
  const clock = { code: 'PGRST204', message: "Could not find the 'client_clock_at' column" };
  const session = { code: '42703', message: 'column "completed_sessions" does not exist' };

  assert.equal(isMissingClockColumnError(clock), true);
  assert.equal(isMissingClockColumnError(session), false);
  assert.equal(isMissingSessionColumnError(session), true);
  assert.equal(isMissingSessionColumnError({ code: 'PGRST204', message: 'current_session' }), true);
  assert.equal(isMissingSessionColumnError(clock), false);
  assert.equal(
    isMissingSessionColumnError({ code: '23505', message: 'completed_sessions' }),
    false
  );
  assert.equal(isMissingClockColumnError({ code: 'PGRST204' }), false);
  assert.equal(isMissingClockColumnError(undefined), false);
});

test('a missing merge function is recognised by code or HTTP 404, but only with an error', () => {
  assert.equal(isMissingMergeRpcError({ code: 'PGRST202' }, 404), true);
  assert.equal(isMissingMergeRpcError({ code: '42883' }, 400), true);
  assert.equal(isMissingMergeRpcError({ code: 'XX000' }, 404), true);
  assert.equal(isMissingMergeRpcError({ code: '22023' }, 400), false);
  assert.equal(isMissingMergeRpcError(null, 404), false);
});

test('a .single() with no row is PGRST116', () => {
  assert.equal(isNoRowForSingleError({ code: 'PGRST116' }), true);
  assert.equal(isNoRowForSingleError({ code: 'PGRST204' }), false);
  assert.equal(isNoRowForSingleError(null), false);
});
