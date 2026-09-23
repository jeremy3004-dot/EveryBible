import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCouncilAccess } from './councilAccess.ts';

// Attempt table stand-in: failures are stored per ip_hash and counted back, so the lockout
// is exercised end to end rather than scripted.
function harness(options: { unavailable?: boolean } = {}) {
  const failures: string[] = [];
  const service = {
    from() {
      let ipHash = '';
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          if (column === 'ip_hash') ipHash = String(value);
          return query;
        },
        async gte() {
          return options.unavailable
            ? { count: null, error: { message: 'offline' } }
            : { count: failures.filter((hash) => hash === ipHash).length, error: null };
        },
        async insert(value: { ip_hash: string }) {
          failures.push(value.ip_hash);
          return { error: null };
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
  return { check, failures };
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
