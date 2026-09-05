import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const groupId = '11111111-1111-4111-8111-111111111111';
const callerId = '22222222-2222-4222-8222-222222222222';
const recipientId = '33333333-3333-4333-8333-333333333333';
const outsiderId = '44444444-4444-4444-8444-444444444444';
const validBody = { group_id: groupId, title: 'नयाँ समूह सत्र', body: 'समूहमा नयाँ सत्र थपियो।' };
type Query = { table: string; filters: Record<string, unknown> };
type Push = { to: string; title: string; body: string; data: { groupId: string; screen: string } };

function loadFunction(
  options: {
    env?: Record<string, string | undefined>;
    authError?: boolean;
    authThrows?: boolean;
    membershipError?: boolean;
    memberQueryError?: boolean;
    deviceQueryError?: boolean;
    members?: string[];
    tokens?: Array<string | null>;
    tickets?: unknown;
    pushStatus?: number;
  } = {}
) {
  let handler: (request: Request) => Promise<Response>;
  let clientCalls = 0;
  const authCalls: string[] = [];
  const queries: Query[] = [];
  const pushes: Push[][] = [];
  const members = options.members ?? [callerId, recipientId];
  const env = {
    SUPABASE_URL: 'https://backend.example',
    SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
    ...options.env,
  };
  const source = ts.transpileModule(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: {},
    Request,
    Response,
    console: { error() {} },
    Deno: {
      env: { get: (name: keyof typeof env) => env[name] },
      serve(callback: typeof handler) {
        handler = callback;
      },
    },
    fetch: async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://exp.host/--/api/v2/push/send');
      const batch = JSON.parse(String(init.body)) as Push[];
      pushes.push(batch);
      return new Response(
        JSON.stringify({
          data: options.tickets ?? batch.map(() => ({ status: 'ok', id: 'ticket' })),
        }),
        { status: options.pushStatus ?? 200 }
      );
    },
    require(specifier: string) {
      assert.equal(specifier, 'https://esm.sh/@supabase/supabase-js@2');
      return {
        createClient(
          url: string,
          key: string,
          clientOptions?: { global?: { headers?: { Authorization?: string } } }
        ) {
          clientCalls += 1;
          assert.equal(url, env.SUPABASE_URL);
          assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY);
          assert.equal(clientOptions?.global?.headers?.Authorization, undefined);
          return {
            auth: {
              async getUser(token: string) {
                authCalls.push(token);
                if (options.authThrows) throw new Error('Auth unavailable');
                const id =
                  token === 'member-token'
                    ? callerId
                    : token === 'outsider-token'
                      ? outsiderId
                      : null;
                return {
                  data: { user: id ? { id } : null },
                  error: !id || options.authError ? { message: 'Invalid token' } : null,
                };
              },
            },
            from(table: string) {
              const filters: Record<string, unknown> = {};
              function execute(single: boolean) {
                queries.push({ table, filters: structuredClone(filters) });
                if (table === 'group_members') {
                  const membership = Object.hasOwn(filters, 'user_id');
                  const error = membership ? options.membershipError : options.memberQueryError;
                  if (error) return { data: null, error: { message: 'Private database error' } };
                  const matches =
                    filters.group_id === groupId
                      ? members
                          .filter((id) => !membership || id === filters.user_id)
                          .map((user_id) => ({ user_id }))
                      : [];
                  return { data: single ? (matches[0] ?? null) : matches, error: null };
                }
                assert.equal(table, 'user_devices');
                if (options.deviceQueryError)
                  return { data: null, error: { message: 'Private device query error' } };
                const recipientIds = filters.user_id as string[];
                const devices = [
                  { user_id: callerId, push_token: 'caller-token' },
                  ...(options.tokens ?? ['recipient-token']).map((push_token) => ({
                    user_id: recipientId,
                    push_token,
                  })),
                ].filter((device) => recipientIds.includes(device.user_id));
                return { data: devices, error: null };
              }
              const query = {
                select() {
                  return query;
                },
                eq(column: string, value: unknown) {
                  filters[column] = value;
                  return query;
                },
                in(column: string, values: unknown[]) {
                  filters[column] = values;
                  return query;
                },
                async maybeSingle() {
                  return execute(true);
                },
                then(resolve: (value: unknown) => unknown) {
                  return Promise.resolve(execute(false)).then(resolve);
                },
              };
              return query;
            },
          };
        },
      };
    },
  });
  return {
    authCalls,
    queries,
    pushes,
    clientCalls: () => clientCalls,
    request({
      method = 'POST',
      authorization = 'Bearer member-token',
      body = validBody,
      rawBody,
    }: {
      method?: string;
      authorization?: string | null;
      body?: unknown;
      rawBody?: string;
    } = {}) {
      return handler(
        new Request('https://backend.example/functions/v1/send-group-notification', {
          method,
          headers: authorization ? { authorization, 'content-type': 'application/json' } : {},
          ...(!['GET', 'HEAD'].includes(method) ? { body: rawBody ?? JSON.stringify(body) } : {}),
        })
      );
    },
  };
}

for (const authorization of [
  null,
  'Basic member-token',
  'Bearer',
  'Bearer token extra',
  'Bearer forged-jwt',
]) {
  test(`rejects invalid credentials ${authorization} before member or device access`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ authorization })).status, 401);
    assert.equal(runtime.queries.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

for (const options of [{ authError: true }, { authThrows: true }]) {
  test(`fails closed on auth failure ${JSON.stringify(options)}`, async () => {
    const runtime = loadFunction(options);
    assert.ok([401, 500].includes((await runtime.request()).status));
    assert.equal(runtime.queries.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('an authenticated nonmember cannot trigger group fanout', async () => {
  const runtime = loadFunction();
  const response = await runtime.request({ authorization: 'Bearer outsider-token' });
  assert.equal(response.status, 403);
  assert.deepEqual(runtime.authCalls, ['outsider-token']);
  assert.deepEqual(runtime.queries, [
    { table: 'group_members', filters: { group_id: groupId, user_id: outsiderId } },
  ]);
  assert.equal(runtime.pushes.length, 0);
});

test('membership lookup errors do not permit fanout or expose backend details', async () => {
  const runtime = loadFunction({ membershipError: true });
  const response = await runtime.request();
  assert.equal(response.status, 500);
  assert.equal(runtime.queries.length, 1);
  assert.equal(runtime.pushes.length, 0);
  assert.doesNotMatch(await response.text(), /Private database error/);
});

for (const field of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  for (const value of [undefined, '', '   ']) {
    test(`missing config ${field}=${JSON.stringify(value)} fails closed`, async () => {
      const runtime = loadFunction({ env: { [field]: value } });
      assert.equal((await runtime.request()).status, 503);
      assert.equal(runtime.clientCalls(), 0);
      assert.equal(runtime.pushes.length, 0);
    });
  }
}

for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
  test(`${method} does not access authentication or group data`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ method })).status, method === 'OPTIONS' ? 200 : 405);
    assert.equal(runtime.clientCalls(), 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

for (const body of [
  null,
  [],
  {},
  { ...validBody, group_id: 'not-a-uuid' },
  { ...validBody, title: 42 },
  { ...validBody, body: {} },
  { ...validBody, title: '   ' },
  { ...validBody, body: '' },
  { ...validBody, title: 'x'.repeat(201) },
  { ...validBody, body: 'x'.repeat(2001) },
]) {
  test(`rejects invalid request body ${JSON.stringify(body).slice(0, 100)}`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ body })).status, 400);
    assert.equal(runtime.queries.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('malformed JSON is rejected before group data access', async () => {
  const runtime = loadFunction();
  assert.equal((await runtime.request({ rawBody: '{' })).status, 400);
  assert.equal(runtime.queries.length, 0);
  assert.equal(runtime.pushes.length, 0);
});

test('ordinary members notify other members with localized content and cannot spoof caller exclusion', async () => {
  const runtime = loadFunction();
  const response = await runtime.request({ body: { ...validBody, exclude_user_id: recipientId } });
  assert.equal(response.status, 200);
  assert.deepEqual(runtime.authCalls, ['member-token']);
  assert.deepEqual(runtime.queries, [
    { table: 'group_members', filters: { group_id: groupId, user_id: callerId } },
    { table: 'group_members', filters: { group_id: groupId } },
    { table: 'user_devices', filters: { is_active: true, user_id: [recipientId] } },
  ]);
  assert.deepEqual(runtime.pushes, [
    [
      {
        to: 'recipient-token',
        title: validBody.title,
        body: validBody.body,
        sound: 'default',
        data: { screen: 'GroupDetail', groupId },
      },
    ],
  ]);
  assert.deepEqual(await response.json(), { success: true, sent: 1, errors: 0 });
});

for (const options of [{ memberQueryError: true }, { deviceQueryError: true }]) {
  test(`recipient lookup errors prevent push delivery ${JSON.stringify(options)}`, async () => {
    const runtime = loadFunction(options);
    assert.equal((await runtime.request()).status, 500);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('groups with only the verified caller do not send notifications', async () => {
  const runtime = loadFunction({ members: [callerId] });
  assert.equal((await runtime.request()).status, 200);
  assert.equal(
    runtime.queries.some((query) => query.table === 'user_devices'),
    false
  );
  assert.equal(runtime.pushes.length, 0);
});

test('deduplicates nonblank device tokens and counts actual Expo ticket outcomes', async () => {
  const runtime = loadFunction({
    tokens: ['token-a', 'token-a', null, '', 'token-b'],
    tickets: [
      { status: 'ok', id: 'ticket-a' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ],
  });
  const response = await runtime.request();
  assert.deepEqual(
    runtime.pushes.flat().map((push) => push.to),
    ['token-a', 'token-b']
  );
  assert.deepEqual(await response.json(), { success: true, sent: 1, errors: 1 });
});

for (const options of [{ tickets: [] }, { pushStatus: 500 }]) {
  test(`missing tickets or failed Expo requests do not count as sent ${JSON.stringify(options)}`, async () => {
    const runtime = loadFunction(options);
    assert.deepEqual(await (await runtime.request()).json(), { success: true, sent: 0, errors: 1 });
  });
}
