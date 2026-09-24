/**
 * The language-atlas route handlers (app/api/language-atlas), loaded through the
 * real module loader with the admin check and the snapshot reader replaced.
 * app/serverBoundaryAuth.test.ts separately proves the real admin_role check
 * rejects non-admins; this file covers what the routes return and never leak.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

import { mockModule, mockNextServerRuntime } from '../testing/adminTestHarness';

const INDEX_URL = 'https://admin.example/api/language-atlas';
const calls: string[] = [];
let identity: { role: string } | null = null;
let authFailure = false;
let snapshotFailure = false;
let largeIndex = false;

mockNextServerRuntime(mock);
mockModule(mock, '@/lib/admin-auth', {
  getAdminIdentity: async () => {
    calls.push('auth');
    if (authFailure) throw new Error('private authentication configuration missing');
    return identity;
  },
});
mockModule(mock, '@/lib/language-atlas/server', {
  getAtlasIndex: async () => {
    calls.push('index');
    if (snapshotFailure) throw new Error('/private/sensitive/path: corrupt snapshot');
    return largeIndex
      ? { schemaVersion: 1, records: [{ id: 'iso:eng' }], notes: ['x'.repeat(4_700_000)] }
      : { schemaVersion: 1, records: [{ id: 'iso:eng' }] };
  },
  getAtlasIndexGzip: async () => {
    calls.push('index-gzip');
    if (snapshotFailure) throw new Error('/private/sensitive/path: corrupt snapshot');
    return gzipSync(JSON.stringify({ schemaVersion: 1, records: [{ id: 'iso:eng' }] }));
  },
  getAtlasDetail: async (id: string) => {
    calls.push(`detail:${id}`);
    if (snapshotFailure) throw new Error('/private/sensitive/path: corrupt snapshot');
    return id === 'iso:eng' ? { id, biography: 'English language record.' } : null;
  },
});

const indexRoute = await import('../../app/api/language-atlas/route');
const detailRoute = await import('../../app/api/language-atlas/[id]/route');

beforeEach(() => {
  calls.length = 0;
  identity = { role: 'super_admin' };
  authFailure = false;
  snapshotFailure = false;
  largeIndex = false;
});

const routes = [
  { label: 'index', get: () => indexRoute.GET(new Request(INDEX_URL)), loaded: 'index' },
  {
    label: 'detail',
    get: (id = 'iso:eng') =>
      detailRoute.GET(new Request(`https://admin.example/api/language-atlas/${id}`), {
        params: Promise.resolve({ id }),
      }),
    loaded: 'detail:iso:eng',
  },
] as const;

for (const route of routes) {
  test(`${route.label} denies a non-admin with an uncacheable 401 before loading a snapshot`, async () => {
    identity = null;
    const response = await route.get();
    assert.equal(response.status, 401);
    assert.deepEqual(calls, ['auth']);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  });

  test(`${route.label} returns the record privately and uncached after admin authentication`, async () => {
    const response = await route.get();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['auth', route.loaded]);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await response.json();
    assert.equal(route.label === 'detail' ? body.id : body.records[0].id, 'iso:eng');
  });

  test(`${route.label} gives a retryable error without exposing server paths`, async () => {
    snapshotFailure = true;
    const response = await route.get();
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /sensitive|private\/|corrupt snapshot/);
    assert.match(body, /unavailable/i);
  });

  test(`${route.label} keeps authentication service failures private`, async () => {
    authFailure = true;
    const response = await route.get();
    assert.equal(response.status, 503);
    assert.deepEqual(calls, ['auth']);
    assert.doesNotMatch(await response.text(), /private|configuration/);
  });
}

test('an unknown record id is a JSON 404', async () => {
  const response = await routes[1].get('iso:missing');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Record not found' });
});

test('the complete index streams above Vercel’s 4.5 MB response limit', async () => {
  largeIndex = true;
  const response = await indexRoute.GET(new Request(INDEX_URL));
  assert.equal(response.status, 200);
  assert.ok(response.body, 'index response should use a streaming body');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const payload = await response.arrayBuffer();
  assert.ok(payload.byteLength > 4_500_000);
  assert.equal(JSON.parse(new TextDecoder().decode(payload)).records[0].id, 'iso:eng');
});

function indexRequest(acceptEncoding: string) {
  return new Request(INDEX_URL, {
    headers: { 'accept-encoding': acceptEncoding },
  });
}

test('a browser that accepts gzip receives the stored snapshot without re-serializing it', async () => {
  const response = await indexRoute.GET(indexRequest('gzip, deflate, br, zstd'));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['auth', 'index-gzip']);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  // A constructed Response never inflates its body; the browser's fetch does.
  const body = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
  assert.equal(JSON.parse(body).records[0].id, 'iso:eng');
});

test('a client that refuses gzip gets plain JSON', async () => {
  for (const acceptEncoding of ['identity', 'br', 'gzip;q=0, identity', 'x-gzip']) {
    calls.length = 0;
    const response = await indexRoute.GET(indexRequest(acceptEncoding));
    assert.equal(response.headers.get('content-encoding'), null, acceptEncoding);
    assert.deepEqual(calls, ['auth', 'index'], acceptEncoding);
    assert.equal((await response.json()).records[0].id, 'iso:eng');
  }
});

test('a non-admin asking for gzip still gets a 401 before any snapshot is read', async () => {
  identity = null;
  const response = await indexRoute.GET(indexRequest('gzip'));
  assert.equal(response.status, 401);
  assert.deepEqual(calls, ['auth']);
});

test('a gzip snapshot read failure is a retryable error without server paths', async () => {
  snapshotFailure = true;
  const response = await indexRoute.GET(indexRequest('gzip'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive|private\/|corrupt snapshot/);
});
