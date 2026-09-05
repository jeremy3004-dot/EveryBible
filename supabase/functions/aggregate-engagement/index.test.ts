import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadFunction(
  serviceRoleKey: string | undefined = 'trusted-service-key',
  authorizationResult?: { data: boolean | null; error: unknown }
) {
  let handler: (request: Request) => Promise<Response>;
  let clientCalls = 0;
  let privilegedCalls = 0;
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    console,
    Deno: {
      env: {
        get: (name: string) =>
          name === 'SUPABASE_SERVICE_ROLE_KEY'
            ? serviceRoleKey
            : name === 'SUPABASE_ANON_KEY'
              ? 'public-anon-key'
              : 'https://example.invalid',
      },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    require: (specifier: string) => {
      assert.equal(specifier, 'https://esm.sh/@supabase/supabase-js@2');
      return {
        createClient: (
          _url: string,
          key: string,
          options?: { global?: { headers?: { Authorization?: string } } }
        ) => {
          clientCalls += 1;
          if (key === 'public-anon-key') {
            return {
              rpc: async (name: string) => {
                assert.equal(name, 'authorize_engagement_refresh');
                const token = options?.global?.headers?.Authorization;
                return (
                  authorizationResult ??
                  (token === 'Bearer trusted-service-key' ||
                  token === 'Bearer existing-valid-service-key'
                    ? { data: true, error: null }
                    : { data: null, error: { code: '42501' } })
                );
              },
            };
          }
          assert.equal(key, serviceRoleKey);
          assert.equal(options?.global?.headers?.Authorization, undefined);
          privilegedCalls += 1;
          return { from: () => ({ select: () => ({ gte: async () => ({ data: [] }) }) }) };
        },
      };
    },
  });
  return {
    request: (method: string, authorization?: string) =>
      handler(
        new Request('https://example.invalid', {
          method,
          headers: authorization ? { authorization } : {},
          ...(method === 'POST' ? { body: '{}' } : {}),
        })
      ),
    clientCalls: () => clientCalls,
    privilegedCalls: () => privilegedCalls,
  };
}

for (const [label, token] of [
  ['missing token', undefined],
  ['ordinary authenticated JWT', 'Bearer ordinary-user-jwt'],
  ['forged service role claim', 'Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.'],
  ['wrong scheme', 'Basic trusted-service-key'],
] as const) {
  test(`aggregate engagement rejects ${label} before privileged database access`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request('POST', token)).status, 401);
    assert.equal(runtime.privilegedCalls(), 0);
  });
}

test('aggregate engagement fails closed without its service key', async () => {
  const runtime = loadFunction('');
  assert.equal((await runtime.request('POST', 'Bearer ')).status, 503);
  assert.equal(runtime.clientCalls(), 0);
});

for (const token of ['trusted-service-key', 'existing-valid-service-key']) {
  test(`aggregate engagement accepts verified backend credential ${token}`, async () => {
    const runtime = loadFunction();
    const response = await runtime.request('POST', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(runtime.privilegedCalls(), 1);
    assert.deepEqual(await response.json(), {
      success: true,
      refreshed: 0,
      errors: 0,
      total_users: 0,
    });
  });
}

for (const result of [
  { data: true, error: { message: 'Verification failed' } },
  { data: false, error: null },
  { data: null, error: null },
]) {
  test(`aggregate engagement rejects failed authorization ${JSON.stringify(result)}`, async () => {
    const runtime = loadFunction('trusted-service-key', result);
    assert.equal((await runtime.request('POST', 'Bearer trusted-service-key')).status, 401);
    assert.equal(runtime.privilegedCalls(), 0);
  });
}

test('aggregate engagement CORS preflight never accesses data', async () => {
  const runtime = loadFunction();
  assert.equal((await runtime.request('OPTIONS')).status, 200);
  assert.equal(runtime.clientCalls(), 0);
});
