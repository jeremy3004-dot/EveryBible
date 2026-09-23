import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash } from 'node:crypto';
import {
  PASSCODE_LOCKOUT_THRESHOLD,
  hashPasscodeAttemptKey,
  passcodeAttemptClientKey,
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

const request = (headers: Record<string, string>) =>
  new Request('https://example.test/functions/v1/review-chapter-feedback', { headers });

test('the edge-stamped cf-connecting-ip is the attempt key, whatever else the client sends', () => {
  assert.equal(
    passcodeAttemptClientKey(
      request({
        'cf-connecting-ip': '192.0.2.10',
        'x-real-ip': '192.0.2.11',
        'x-forwarded-for': '198.51.100.1, 192.0.2.10',
      })
    ),
    '192.0.2.10'
  );
});

// Checked against the live project on 2026-09-24: a client-sent x-forwarded-for reaches the
// function verbatim, so rotating it must not produce a fresh lockout bucket.
test('a client-chosen x-forwarded-for never becomes the attempt key', () => {
  assert.equal(passcodeAttemptClientKey(request({ 'x-forwarded-for': '198.51.100.1' })), 'unknown');
  assert.equal(
    passcodeAttemptClientKey(
      request({ 'x-real-ip': '192.0.2.11', 'x-forwarded-for': '198.51.100.1' })
    ),
    '192.0.2.11'
  );
});

test('IPv6 callers are bucketed by their /64, so rotating the interface id does not help', () => {
  const a = passcodeAttemptClientKey(request({ 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' }));
  const b = passcodeAttemptClientKey(
    request({ 'cf-connecting-ip': '2001:0DB8:0001:0002:ffff:ffff:ffff:ffff' })
  );
  const otherNetwork = passcodeAttemptClientKey(request({ 'cf-connecting-ip': '2001:db8:1:3::1' }));
  assert.equal(a, '2001:db8:1:2::/64');
  assert.equal(b, a);
  assert.notEqual(otherNetwork, a);
  assert.equal(
    passcodeAttemptClientKey(request({ 'cf-connecting-ip': '2001:db8::1' })),
    '2001:db8:0:0::/64'
  );
  assert.equal(
    passcodeAttemptClientKey(request({ 'cf-connecting-ip': '::ffff:192.0.2.7' })),
    '192.0.2.7'
  );
});

test('attempt hashes keep their existing format so live lockout windows carry over', async () => {
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const caller = request({ 'cf-connecting-ip': '192.0.2.10' });
  assert.equal(await hashPasscodeAttemptKey(caller), sha('192.0.2.10'));
  assert.equal(await hashPasscodeAttemptKey(caller, 'council:'), sha('council:192.0.2.10'));
});
