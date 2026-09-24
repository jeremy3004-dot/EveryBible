import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeClientOptions } from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against aggregate-engagement. Only a verified backend credential
// gets past authorization, but even that caller's mistakes must be a 4xx, not a failed uuid
// cast answered as a 500, and methods it never uses must not trigger a full refresh.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SERVICE_KEY = 'trusted-service-key';
const ANON_KEY = 'public-anon-key';
const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function load() {
  const refreshes: unknown[] = [];
  const harness = loadEdgeFunction(ENTRY, {
    env: {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    },
    createClient: (_url: string, key: string, options?: EdgeClientOptions) => ({
      rpc: async (fn: string, args?: { p_user_id?: unknown }) => {
        if (fn === 'authorize_engagement_refresh') {
          const ok =
            key === ANON_KEY && options?.global?.headers?.Authorization === `Bearer ${SERVICE_KEY}`;
          return ok ? { data: true, error: null } : { data: null, error: { code: '42501' } };
        }
        refreshes.push(args);
        // PostgREST casts p_user_id to uuid.
        const id = args?.p_user_id;
        if (id != null && !(typeof id === 'string' && UUID.test(id))) {
          return {
            data: null,
            error: { code: '22P02', message: 'invalid input syntax for type uuid' },
          };
        }
        return { data: { success: true, refreshed: id ? 1 : 3 }, error: null };
      },
    }),
  });
  const request = async (method: string, body?: string) => {
    const response = await harness.handle(
      new Request('https://example.invalid', {
        method,
        headers: { authorization: `Bearer ${SERVICE_KEY}` },
        ...(body === undefined ? {} : { body }),
      })
    );
    return { status: response.status, json: (await response.json()) as Record<string, unknown> };
  };
  return { harness, refreshes, request };
}

test('PUT, PATCH and DELETE are a 405 and never start a refresh', async () => {
  const runtime = load();
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const result = await runtime.request(method, '{}');
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
  }
  assert.deepEqual(runtime.refreshes, []);
  assert.deepEqual(runtime.harness.clientsCreated, []);
});

test('a JSON body that is null, an array, a string or a number refreshes every user', async () => {
  const runtime = load();
  for (const body of ['null', '[]', '"x"', '42', '']) {
    const result = await runtime.request('POST', body);
    assert.equal(result.status, 200, body);
  }
  assert.deepEqual(runtime.refreshes, Array(5).fill({ p_user_id: null }));
});

test('a user_id that is not a UUID is a 400 before the refresh', async () => {
  const runtime = load();
  for (const userId of ['user-1', 42, true, { id: USER_ID }, [USER_ID], `${USER_ID}\u0000`]) {
    const result = await runtime.request('POST', JSON.stringify({ user_id: userId }));
    assert.equal(result.status, 400, JSON.stringify(userId));
    assert.deepEqual(result.json, { success: false, error: 'user_id must be a UUID' });
  }
  assert.deepEqual(runtime.refreshes, []);
});

test('a UUID user_id is refreshed alone; an empty or null one refreshes everyone', async () => {
  const runtime = load();
  for (const body of [{ user_id: USER_ID }, { user_id: null }, { user_id: '' }, {}]) {
    assert.equal((await runtime.request('POST', JSON.stringify(body))).status, 200);
  }
  assert.deepEqual(runtime.refreshes, [
    { p_user_id: USER_ID },
    { p_user_id: null },
    { p_user_id: null },
    { p_user_id: null },
  ]);
});

test('prototype-pollution keys cannot supply a user id', async () => {
  const runtime = load();
  const result = await runtime.request('POST', `{"__proto__":{"user_id":"${USER_ID}"}}`);
  assert.equal(result.status, 200);
  assert.deepEqual(runtime.refreshes, [{ p_user_id: null }]);
});
