/**
 * The Vercel Cron entry point for the upstream translation sync, loaded through
 * the real module loader with the sync itself replaced. It has no admin session,
 * so its only gate is the CRON_SECRET bearer token, and it must fail closed.
 */
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';

import { mockModule, mockNextServerRuntime } from '../../../../lib/testing/adminTestHarness';

const actors: unknown[] = [];
let syncFailure: Error | null = null;
const originalSecret = process.env.CRON_SECRET;

mockNextServerRuntime(mock);
mockModule(mock, '@/lib/upstream-sync', {
  runUpstreamTranslationSync: async (actor: unknown) => {
    actors.push(actor);
    if (syncFailure) throw syncFailure;
    return { synced: 2 };
  },
});

const { GET } = await import('./route');

beforeEach(() => {
  actors.length = 0;
  syncFailure = null;
  process.env.CRON_SECRET = 'configured-secret';
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

function cronRequest(authorization?: string) {
  return new Request('https://admin.example/api/cron/upstream-sync', {
    headers: authorization ? { authorization } : {},
  });
}

for (const secret of [undefined, '', '   ']) {
  test(`cron fails closed when CRON_SECRET is ${JSON.stringify(secret)}`, async () => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    for (const authorization of [undefined, 'Bearer undefined', 'Bearer ', 'Bearer wrong']) {
      const response = await GET(cronRequest(authorization));
      assert.equal(response.status, 503, String(authorization));
    }
    assert.deepEqual(actors, []);
  });
}

test('cron rejects a missing, wrong or un-prefixed token without running the sync', async () => {
  for (const authorization of [undefined, 'Bearer wrong', 'configured-secret']) {
    const response = await GET(cronRequest(authorization));
    assert.equal(response.status, 401, String(authorization));
  }
  assert.deepEqual(actors, []);
});

test('near misses of the token are rejected: same length, prefix, extension and case', async () => {
  // The comparison is constant-time (sha256 digests through timingSafeEqual). A unit test
  // cannot observe timing, so this pins that the rewritten comparison still matches exactly.
  // (Trailing spaces are not a case: the Fetch Headers class strips them before the route.)
  for (const authorization of [
    'Bearer configured-secreT',
    'Bearer configured-secre',
    'Bearer configured-secretX',
    'bearer configured-secret',
    'Bearer  configured-secret',
    'Bearer CONFIGURED-SECRET',
  ]) {
    const response = await GET(cronRequest(authorization));
    assert.equal(response.status, 401, authorization);
  }
  assert.deepEqual(actors, []);
});

test('the configured bearer token runs the sync with no admin actor and an uncached result', async () => {
  const response = await GET(cronRequest('Bearer configured-secret'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.result, { synced: 2 });
  assert.deepEqual(actors, [null]);
});

test('a failed sync is reported as a 500 so Vercel records the cron failure', async () => {
  syncFailure = new Error('upstream catalog timed out');
  const response = await GET(cronRequest('Bearer configured-secret'));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: 'upstream catalog timed out' });
});
