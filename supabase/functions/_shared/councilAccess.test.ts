import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCouncilAccess } from './councilAccess.ts';

// Attempt table stand-in: attempts are stored per ip_hash and counted back, so the lockout
// is exercised end to end rather than scripted. The table reads and writes resolve a tick
// later, like real round trips, so parallel requests interleave the way they do in
// production. `claim_passcode_attempt` is atomic, like the SQL function (advisory lock).
// `legacy` answers the RPC as missing (PGRST202), the state before the migration is applied.
function harness(options: { unavailable?: boolean; legacy?: boolean } = {}) {
  const attempts: Array<{ id: string; hash: string; succeeded: boolean }> = [];
  let nextId = 0;
  const failuresFor = (hash: string) =>
    attempts.filter((attempt) => attempt.hash === hash && !attempt.succeeded).length;
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const service = {
    async rpc(fn: string, args: { p_ip_hash: string; p_threshold: number }) {
      assert.equal(fn, 'claim_passcode_attempt');
      if (options.unavailable) return { data: null, error: { message: 'offline' } };
      if (options.legacy) return { data: null, error: { code: 'PGRST202', message: 'missing' } };
      if (failuresFor(args.p_ip_hash) >= args.p_threshold) return { data: null, error: null };
      const id = `attempt-${(nextId += 1)}`;
      attempts.push({ id, hash: args.p_ip_hash, succeeded: false });
      await tick();
      return { data: id, error: null };
    },
    from() {
      let ipHash = '';
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          if (column === 'ip_hash') ipHash = String(value);
          return query;
        },
        async gte() {
          await tick();
          return options.unavailable
            ? { count: null, error: { message: 'offline' } }
            : { count: failuresFor(ipHash), error: null };
        },
        async insert(value: { ip_hash: string }) {
          await tick();
          attempts.push({ id: `attempt-${(nextId += 1)}`, hash: value.ip_hash, succeeded: false });
          return { error: null };
        },
        delete() {
          return {
            async eq(_column: string, id: string) {
              const index = attempts.findIndex((candidate) => candidate.id === id);
              if (index >= 0) attempts.splice(index, 1);
              return { error: null };
            },
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const check = (code: unknown, headers: Record<string, string> = {}) =>
    verifyCouncilAccess(
      service,
      new Request('http://localhost', { headers }),
      code,
      'test-council-code'
    );
  const failures = {
    get length() {
      return attempts.filter((attempt) => !attempt.succeeded).length;
    },
  };
  return { check, failures, attempts };
}

test('council category alone or a wrong code cannot grant council access', async () => {
  const { check, failures } = harness();
  assert.equal((await check(undefined))?.status, 403);
  assert.equal((await check('wrong'))?.status, 403);
  assert.equal(failures.length, 2);
});

test('correct council code is accepted without a signed-in account', async () => {
  assert.equal(await harness().check('test-council-code'), null);
});

test('council gate fails closed if attempt tracking is unavailable', async () => {
  assert.equal((await harness({ unavailable: true }).check('test-council-code'))?.status, 503);
});

test('locked council access rejects even a correct code until the window expires', async () => {
  const { check } = harness();
  for (let attempt = 0; attempt < 10; attempt += 1) await check('wrong');
  assert.equal((await check('test-council-code'))?.status, 429);
});

// The edge always stamps cf-connecting-ip today; if it ever did not, the old fallback keyed
// on the caller's own x-forwarded-for, and every rotated value was a fresh 10-guess budget.
test('rotating x-forwarded-for does not reset the council lockout', async () => {
  const { check } = harness();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await check('wrong', { 'x-forwarded-for': `198.51.100.${attempt}` });
  }
  const rotated = await check('test-council-code', { 'x-forwarded-for': '198.51.100.200' });
  assert.equal(rotated?.status, 429);
});

// Before the claim RPC, the count was read once and a failure recorded only after the code
// was checked, so a burst of parallel guesses all read "under the limit" and every one of
// them was evaluated — and a correct guess in the burst was accepted.
test('a parallel burst of guesses cannot evaluate more codes than the lockout allows', async () => {
  const { check } = harness();
  const burst = await Promise.all(
    Array.from({ length: 30 }, (_, index) => check(index === 29 ? 'test-council-code' : 'wrong'))
  );
  const evaluated = burst.filter((result) => result?.status !== 429);
  assert.equal(evaluated.length, 10);
  assert.equal(burst[29]?.status, 429, 'the correct code arrived after the budget was spent');
});

test('a correct code releases its claimed attempt, so it does not count', async () => {
  const { check, attempts } = harness();
  assert.equal(await check('test-council-code'), null);
  assert.deepEqual(attempts, []);
  for (let attempt = 0; attempt < 9; attempt += 1) await check('wrong');
  assert.equal(await check('test-council-code'), null, 'nine failures leave one guess');
});

test('while the claim RPC is not deployed, the gate keeps the previous lockout', async () => {
  const { check, failures } = harness({ legacy: true });
  assert.equal((await check('wrong'))?.status, 403);
  assert.equal(failures.length, 1);
  for (let attempt = 0; attempt < 9; attempt += 1) await check('wrong');
  assert.equal((await check('test-council-code'))?.status, 429);
});
