import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  PASSCODE_LOCKOUT_THRESHOLD,
  readPasscodeLockout,
  recordFailedPasscodeAttempt,
} from './passcodeAttempts.ts';

interface Recorded {
  filters: Array<[string, string, unknown]>;
  inserts: unknown[];
}

// Minimal stand-in for the service-role client: records the attempt-counter filters and
// answers with a scripted count, error, or insert failure.
function attemptStore(options: { count?: number; readError?: boolean; writeError?: boolean }) {
  const recorded: Recorded = { filters: [], inserts: [] };
  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      recorded.filters.push(['eq', column, value]);
      return query;
    },
    async gte(column: string, value: unknown) {
      recorded.filters.push(['gte', column, value]);
      return options.readError
        ? { count: null, error: { message: 'connection reset' } }
        : { count: options.count ?? 0, error: null };
    },
    async insert(value: unknown) {
      recorded.inserts.push(value);
      return { error: options.writeError ? { message: 'insert failed' } : null };
    },
  };
  const service = { from: () => query } as unknown as SupabaseClient;
  return { service, recorded };
}

test('lockout is reported unavailable, not open, when the attempt counter errors', async () => {
  const { service } = attemptStore({ readError: true });
  assert.equal(await readPasscodeLockout(service, 'hash'), 'unavailable');
});

test('lockout is open below the threshold and locked at it', async () => {
  const below = attemptStore({ count: PASSCODE_LOCKOUT_THRESHOLD - 1 });
  const at = attemptStore({ count: PASSCODE_LOCKOUT_THRESHOLD });
  assert.equal(await readPasscodeLockout(below.service, 'hash'), 'open');
  assert.equal(await readPasscodeLockout(at.service, 'hash'), 'locked');
});

test('lockout counts only this caller’s failures inside the 15-minute window', async () => {
  const { service, recorded } = attemptStore({ count: 0 });
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  await readPasscodeLockout(service, 'caller-hash', now);
  assert.deepEqual(recorded.filters, [
    ['eq', 'ip_hash', 'caller-hash'],
    ['eq', 'succeeded', false],
    ['gte', 'created_at', '2026-09-24T11:45:00.000Z'],
  ]);
});

test('recording a failed attempt reports whether the row was written', async () => {
  const ok = attemptStore({});
  const broken = attemptStore({ writeError: true });
  assert.equal(await recordFailedPasscodeAttempt(ok.service, 'hash'), true);
  assert.deepEqual(ok.recorded.inserts, [{ ip_hash: 'hash', succeeded: false }]);
  assert.equal(await recordFailedPasscodeAttempt(broken.service, 'hash'), false);
});
