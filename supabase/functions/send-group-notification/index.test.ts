import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction } from '../_testing/edgeFunctionHarness';

const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const groupId = '11111111-1111-4111-8111-111111111111';
const callerId = '22222222-2222-4222-8222-222222222222';
const recipientId = '33333333-3333-4333-8333-333333333333';
const outsiderId = '44444444-4444-4444-8444-444444444444';
const secondRecipientId = '55555555-5555-4555-8555-555555555555';
const sessionId = '66666666-6666-4666-8666-666666666666';
const validBody = { group_id: groupId, session_id: sessionId };
type Call = { table: string; filters: Record<string, unknown>; args?: unknown };
type Push = { to: string; title: string; body: string; data: { groupId: string; screen: string } };
type Recipient = { user_id: string; language: string | null };

function loadFunction(
  options: {
    env?: Record<string, string | undefined>;
    authError?: boolean;
    authThrows?: boolean;
    claim?: Record<string, unknown> | null;
    claimError?: boolean;
    deviceQueryError?: boolean;
    recipients?: Recipient[];
    groupName?: unknown;
    devices?: Array<{ user_id: string; push_token: string | null }>;
    tickets?: unknown;
    pushStatus?: number;
    // Batch numbers (0-based) whose request to Expo throws, e.g. a network drop.
    throwingBatches?: number[];
  } = {}
) {
  const authCalls: string[] = [];
  const calls: Call[] = [];
  const pushes: Push[][] = [];
  const pushSignals: Array<AbortSignal | null | undefined> = [];
  const env = {
    SUPABASE_URL: 'https://backend.example',
    SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
    ...options.env,
  };
  const claim =
    options.claim !== undefined
      ? options.claim
      : {
          status: 'ok',
          group_id: groupId,
          group_name: options.groupName ?? 'Alpha',
          recipients: options.recipients ?? [{ user_id: recipientId, language: 'ne' }],
        };
  const client = {
    auth: {
      async getUser(token: string) {
        authCalls.push(token);
        if (options.authThrows) throw new Error('Auth unavailable');
        const id =
          token === 'member-token' ? callerId : token === 'outsider-token' ? outsiderId : null;
        return {
          data: { user: id ? { id } : null },
          error: !id || options.authError ? { message: 'Invalid token' } : null,
        };
      },
    },
    async rpc(fn: string, args: unknown) {
      calls.push({ table: `rpc:${fn}`, filters: {}, args });
      if (options.claimError) return { data: null, error: { message: 'Private claim error' } };
      return { data: claim, error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const execute = () => {
        calls.push({ table, filters: structuredClone(filters) });
        assert.equal(table, 'user_devices');
        if (options.deviceQueryError)
          return { data: null, error: { message: 'Private device query error' } };
        const recipientIds = filters.user_id as string[];
        const devices = options.devices ?? [
          { user_id: callerId, push_token: 'caller-token' },
          { user_id: recipientId, push_token: 'recipient-token' },
        ];
        return {
          data: devices.filter((device) => recipientIds.includes(device.user_id)),
          error: null,
        };
      };
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
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(execute()).then(resolve);
        },
      };
      return query;
    },
  };
  const harness = loadEdgeFunction(ENTRY, {
    env,
    client,
    fetch: (async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://exp.host/--/api/v2/push/send');
      const batch = JSON.parse(String(init.body)) as Push[];
      pushes.push(batch);
      pushSignals.push(init.signal);
      if (options.throwingBatches?.includes(pushes.length - 1)) {
        throw new TypeError('network connection lost');
      }
      return new Response(
        JSON.stringify({
          data: options.tickets ?? batch.map(() => ({ status: 'ok', id: 'ticket' })),
        }),
        { status: options.pushStatus ?? 200 }
      );
    }) as typeof fetch,
  });
  return {
    authCalls,
    calls,
    pushes,
    pushSignals,
    clientsCreated: harness.clientsCreated,
    loggedErrors: harness.loggedErrors,
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
      return harness.handle(
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
  test(`rejects invalid credentials ${authorization} before any claim or device access`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ authorization })).status, 401);
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

for (const options of [{ authError: true }, { authThrows: true }]) {
  test(`fails closed on auth failure ${JSON.stringify(options)}`, async () => {
    const runtime = loadFunction(options);
    assert.ok([401, 500].includes((await runtime.request()).status));
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('the claim is made for the verified caller, never a request-supplied user', async () => {
  const runtime = loadFunction();
  await runtime.request({
    body: { ...validBody, exclude_user_id: recipientId, sender_id: recipientId },
  });
  assert.deepEqual(runtime.calls[0], {
    table: 'rpc:claim_group_session_notification',
    filters: {},
    args: { p_session_id: sessionId, p_group_id: groupId, p_sender_id: callerId },
  });
});

for (const status of ['not_found', 'forbidden']) {
  test(`a refused claim (${status}) is forbidden and reads no recipients`, async () => {
    const runtime = loadFunction({ claim: { status } });
    const response = await runtime.request({ authorization: 'Bearer outsider-token' });
    assert.equal(response.status, 403);
    assert.deepEqual(
      runtime.calls.map((call) => call.table),
      ['rpc:claim_group_session_notification']
    );
    assert.equal(runtime.pushes.length, 0);
  });
}

for (const status of ['stale', 'duplicate']) {
  test(`a ${status} session sends nothing and is not an error for the app`, async () => {
    const runtime = loadFunction({ claim: { status } });
    const response = await runtime.request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, sent: 0, reason: status });
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('a rate-limited sender gets 429 and sends nothing', async () => {
  const runtime = loadFunction({ claim: { status: 'rate_limited' } });
  assert.equal((await runtime.request()).status, 429);
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.pushes.length, 0);
});

for (const claim of [null, { status: 'surprise' }]) {
  test(`an unrecognised claim ${JSON.stringify(claim)} fails closed`, async () => {
    const runtime = loadFunction({ claim });
    assert.equal((await runtime.request()).status, 500);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('claim errors do not permit fanout or expose backend details', async () => {
  const runtime = loadFunction({ claimError: true });
  const response = await runtime.request();
  assert.equal(response.status, 500);
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.pushes.length, 0);
  assert.doesNotMatch(await response.text(), /Private claim error/);
});

test('the service client uses server config and never carries the caller credential', async () => {
  const runtime = loadFunction();
  assert.equal((await runtime.request()).status, 200);
  assert.equal(runtime.clientsCreated.length, 1);
  const [serviceClient] = runtime.clientsCreated;
  assert.equal(serviceClient.url, 'https://backend.example');
  assert.equal(serviceClient.key, 'private-service-key');
  assert.equal(serviceClient.options?.global?.headers?.Authorization, undefined);
});

for (const field of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  for (const value of [undefined, '', '   ']) {
    test(`missing config ${field}=${JSON.stringify(value)} fails closed`, async () => {
      const runtime = loadFunction({ env: { [field]: value } });
      assert.equal((await runtime.request()).status, 503);
      assert.deepEqual(runtime.clientsCreated, []);
      assert.equal(runtime.pushes.length, 0);
    });
  }
}

for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
  test(`${method} does not access authentication or group data`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ method })).status, method === 'OPTIONS' ? 200 : 405);
    assert.deepEqual(runtime.clientsCreated, []);
    assert.equal(runtime.pushes.length, 0);
  });
}

for (const body of [
  null,
  [],
  {},
  { group_id: groupId },
  { session_id: sessionId },
  { ...validBody, group_id: 'not-a-uuid' },
  { ...validBody, session_id: 42 },
  // The old contract: caller-written text without a session is no longer accepted.
  { group_id: groupId, title: 'Urgent', body: 'Reset your password at example.test' },
]) {
  test(`rejects invalid request body ${JSON.stringify(body).slice(0, 100)}`, async () => {
    const runtime = loadFunction();
    assert.equal((await runtime.request({ body })).status, 400);
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.pushes.length, 0);
  });
}

test('malformed JSON is rejected before group data access', async () => {
  const runtime = loadFunction();
  assert.equal((await runtime.request({ rawBody: '{' })).status, 400);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.pushes.length, 0);
});

test('the push text is written by the server in the recipient language; caller text is ignored', async () => {
  const runtime = loadFunction();
  const response = await runtime.request({
    body: { ...validBody, title: 'Urgent', body: 'Reset your password at example.test' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(runtime.authCalls, ['member-token']);
  assert.deepEqual(runtime.calls[1], {
    table: 'user_devices',
    filters: { is_active: true, user_id: [recipientId] },
  });
  assert.deepEqual(runtime.pushes, [
    [
      {
        to: 'recipient-token',
        title: 'समूह सत्र सम्पन्न',
        body: 'Alpha मा सत्र रेकर्ड गरियो',
        sound: 'default',
        data: { screen: 'GroupDetail', groupId },
      },
    ],
  ]);
  assert.deepEqual(await response.json(), { success: true, sent: 1, errors: 0 });
});

test('each recipient gets their own language, with English when none is saved', async () => {
  const runtime = loadFunction({
    groupName: '  Alpha\nClick here  ',
    recipients: [
      { user_id: recipientId, language: 'es' },
      { user_id: secondRecipientId, language: null },
    ],
    devices: [
      { user_id: recipientId, push_token: 'token-es' },
      { user_id: secondRecipientId, push_token: 'token-en' },
    ],
  });
  await runtime.request();
  assert.deepEqual(
    runtime.pushes.flat().map(({ to, title, body }) => ({ to, title, body })),
    [
      {
        to: 'token-es',
        title: 'Sesión de grupo completada',
        body: 'Se registró una sesión en Alpha Click here',
      },
      {
        to: 'token-en',
        title: 'Group Session Completed',
        body: 'A session was recorded in Alpha Click here',
      },
    ]
  );
});

test('the caller is never a recipient, even if the claim lists them', async () => {
  const runtime = loadFunction({
    recipients: [
      { user_id: callerId, language: 'en' },
      { user_id: recipientId, language: 'en' },
    ],
  });
  await runtime.request();
  assert.deepEqual(runtime.calls[1].filters.user_id, [recipientId]);
  assert.deepEqual(
    runtime.pushes.flat().map((push) => push.to),
    ['recipient-token']
  );
});

test('device lookup errors prevent push delivery', async () => {
  const runtime = loadFunction({ deviceQueryError: true });
  assert.equal((await runtime.request()).status, 500);
  assert.equal(runtime.pushes.length, 0);
});

test('groups with only the verified caller do not look up devices or send', async () => {
  const runtime = loadFunction({ recipients: [] });
  const response = await runtime.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, 'only_creator_in_group');
  assert.equal(
    runtime.calls.some((call) => call.table === 'user_devices'),
    false
  );
  assert.equal(runtime.pushes.length, 0);
});

test('recipients without active tokens are reported, not sent', async () => {
  const runtime = loadFunction({ devices: [] });
  assert.deepEqual(await (await runtime.request()).json(), {
    success: true,
    sent: 0,
    reason: 'no_active_tokens',
  });
  assert.equal(runtime.pushes.length, 0);
});

test('deduplicates nonblank device tokens and counts actual Expo ticket outcomes', async () => {
  const runtime = loadFunction({
    devices: ['token-a', 'token-a', null, '', 'token-b'].map((push_token) => ({
      user_id: recipientId,
      push_token,
    })),
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

test('pushes go out in batches of at most 100', async () => {
  const devices = Array.from({ length: 150 }, (_, index) => ({
    user_id: recipientId,
    push_token: `token-${index}`,
  }));
  const runtime = loadFunction({ devices });
  assert.deepEqual(await (await runtime.request()).json(), { success: true, sent: 150, errors: 0 });
  assert.deepEqual(
    runtime.pushes.map((batch) => batch.length),
    [100, 50]
  );
});

test('a batch whose Expo request throws counts as failed and later batches still go out', async () => {
  const devices = Array.from({ length: 150 }, (_, index) => ({
    user_id: recipientId,
    push_token: `token-${index}`,
  }));
  const runtime = loadFunction({ devices, throwingBatches: [0] });

  assert.deepEqual(await (await runtime.request()).json(), {
    success: true,
    sent: 50,
    errors: 100,
  });
  assert.equal(runtime.pushes.length, 2);
});

for (const options of [{ tickets: [] }, { pushStatus: 500 }]) {
  test(`missing tickets or failed Expo requests do not count as sent ${JSON.stringify(options)}`, async () => {
    const runtime = loadFunction(options);
    assert.deepEqual(await (await runtime.request()).json(), { success: true, sent: 0, errors: 1 });
  });
}

// A hung Expo endpoint must not hold the function (and the caller's request) open until the
// platform's wall-clock limit; each batch is abandoned and counted as failed instead.
test('every Expo push request is bounded by a timeout signal', async () => {
  const runtime = loadFunction();
  assert.equal((await runtime.request()).status, 200);
  assert.equal(runtime.pushSignals.length, 1);
  const signal = runtime.pushSignals[0];
  assert.ok(signal instanceof AbortSignal, 'fetch was called without an AbortSignal');
  assert.equal(signal.aborted, false);
});
