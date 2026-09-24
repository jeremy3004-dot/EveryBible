import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeClientOptions,
  type EdgeHarnessOptions,
} from '../_testing/edgeFunctionHarness';

const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const SERVICE_KEY = 'trusted-service-key';
const ANON_KEY = 'public-anon-key';
const SUMMARY = { success: true, refreshed: 0, errors: 0, total_users: 0 };

type RpcResult = { data: unknown; error: unknown };

// The verifier client (anon key + caller's bearer) asks PostgREST whether the credential may
// refresh; the privileged client (service key, no caller header) runs the refresh. The fake
// answers by credential, the way PostgREST would.
function load(
  options: {
    serviceRoleKey?: string;
    authorizationResult?: RpcResult;
    refreshResult?: RpcResult;
  } = {}
) {
  const rpcCalls: Array<{ key: string; fn: string; args: unknown }> = [];
  const createClient: EdgeHarnessOptions['createClient'] = (
    _url: string,
    key: string,
    clientOptions?: EdgeClientOptions
  ) => ({
    rpc: async (fn: string, args?: unknown): Promise<RpcResult> => {
      rpcCalls.push({ key, fn, args });
      if (key === ANON_KEY && fn === 'authorize_engagement_refresh') {
        const token = clientOptions?.global?.headers?.Authorization;
        return (
          options.authorizationResult ??
          (token === `Bearer ${SERVICE_KEY}` || token === 'Bearer existing-valid-service-key'
            ? { data: true, error: null }
            : { data: null, error: { code: '42501' } })
        );
      }
      if (key === SERVICE_KEY && fn === 'refresh_engagement_summaries') {
        return options.refreshResult ?? { data: SUMMARY, error: null };
      }
      return { data: null, error: { message: `unexpected ${fn} with ${key}` } };
    },
  });
  const harness = loadEdgeFunction(ENTRY, {
    env: {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: options.serviceRoleKey ?? SERVICE_KEY,
    },
    createClient,
  });
  return {
    harness,
    privilegedCalls: () => rpcCalls.filter((call) => call.fn === 'refresh_engagement_summaries'),
    request: (method: string, authorization?: string, body = '{}') =>
      harness.handle(
        new Request('https://example.invalid', {
          method,
          headers: authorization ? { authorization } : {},
          ...(method === 'POST' ? { body } : {}),
        })
      ),
  };
}

for (const [label, token] of [
  ['missing token', undefined],
  ['ordinary authenticated JWT', 'Bearer ordinary-user-jwt'],
  ['forged service role claim', 'Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.'],
  ['wrong scheme', 'Basic trusted-service-key'],
] as const) {
  test(`aggregate engagement rejects ${label} before privileged database access`, async () => {
    const runtime = load();
    assert.equal((await runtime.request('POST', token)).status, 401);
    assert.deepEqual(runtime.privilegedCalls(), []);
    assert.equal(
      runtime.harness.clientsCreated.some((client) => client.key === SERVICE_KEY),
      false
    );
  });
}

test('aggregate engagement fails closed without its service key', async () => {
  const runtime = load({ serviceRoleKey: '' });
  assert.equal((await runtime.request('POST', 'Bearer ')).status, 503);
  assert.deepEqual(runtime.harness.clientsCreated, []);
});

for (const token of ['trusted-service-key', 'existing-valid-service-key']) {
  test(`aggregate engagement accepts verified backend credential ${token}`, async () => {
    const runtime = load();
    const response = await runtime.request('POST', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(runtime.privilegedCalls().length, 1);
    assert.deepEqual(await response.json(), SUMMARY);
  });
}

test('the caller credential is checked with the public key and never forwarded to the service client', async () => {
  const runtime = load();
  await runtime.request('POST', `Bearer ${SERVICE_KEY}`);
  const [verifier, privileged] = runtime.harness.clientsCreated;
  assert.equal(runtime.harness.clientsCreated.length, 2);
  assert.equal(verifier.key, ANON_KEY);
  assert.equal(verifier.options?.global?.headers?.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(privileged.key, SERVICE_KEY);
  assert.equal(privileged.options?.global?.headers?.Authorization, undefined);
});

test('a requested user id is passed to the refresh; otherwise every user is refreshed', async () => {
  const runtime = load();
  const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  await runtime.request('POST', `Bearer ${SERVICE_KEY}`, JSON.stringify({ user_id: userId }));
  await runtime.request('POST', `Bearer ${SERVICE_KEY}`);
  assert.deepEqual(
    runtime.privilegedCalls().map((call) => call.args),
    [{ p_user_id: userId }, { p_user_id: null }]
  );
});

for (const result of [
  { data: true, error: { message: 'Verification failed' } },
  { data: false, error: null },
  { data: null, error: null },
]) {
  test(`aggregate engagement rejects failed authorization ${JSON.stringify(result)}`, async () => {
    const runtime = load({ authorizationResult: result });
    assert.equal((await runtime.request('POST', 'Bearer trusted-service-key')).status, 401);
    assert.deepEqual(runtime.privilegedCalls(), []);
  });
}

test('a refresh that fails with an Error is a generic 500 that keeps the message in the log', async () => {
  const runtime = load({
    refreshResult: { data: null, error: new Error('statement timeout') },
  });

  const response = await runtime.request('POST', `Bearer ${SERVICE_KEY}`);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Unable to refresh engagement summaries.',
  });
  assert.ok(runtime.harness.loggedErrors.some((line) => line.includes('statement timeout')));
});

test('an unreadable body or a GET refreshes every user', async () => {
  const runtime = load();
  await runtime.request('POST', `Bearer ${SERVICE_KEY}`, 'not json');
  await runtime.request('GET', `Bearer ${SERVICE_KEY}`);
  assert.deepEqual(
    runtime.privilegedCalls().map((call) => call.args),
    [{ p_user_id: null }, { p_user_id: null }]
  );
});

test('aggregate engagement CORS preflight never accesses data', async () => {
  const runtime = load();
  assert.equal((await runtime.request('OPTIONS')).status, 200);
  assert.deepEqual(runtime.harness.clientsCreated, []);
});

// Same rule as every other function (audit 2026-09-24 L7): database detail goes to the log only.
test('a failed refresh returns a generic error and logs the database detail', async () => {
  const detail = 'relation "engagement_summaries" does not exist';
  const runtime = load({
    refreshResult: { data: null, error: { code: '42P01', message: detail } },
  });

  const response = await runtime.request('POST', `Bearer ${SERVICE_KEY}`);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { success: false, error: 'Unable to refresh engagement summaries.' });
  assert.ok(runtime.harness.loggedErrors.some((line) => line.includes(detail)));
});
