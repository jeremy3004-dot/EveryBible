import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeQueryResult } from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against send-group-notification (verify_jwt = true, then the
// caller's token is verified again in the function). Client mistakes are a small JSON 4xx;
// data a group member controls (their saved interface language) must not break the push for
// everyone else.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const CALLER_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_A = '33333333-3333-4333-8333-333333333333';
const MEMBER_B = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const SERVICE_KEY = 'private-service-key';

type Push = { to: string; title: string; body: string };

function endpoint(
  options: {
    claim?: unknown;
    claimResult?: EdgeQueryResult;
    devices?: EdgeQueryResult;
    pushResponse?: () => Response | Promise<Response>;
  } = {}
) {
  const pushes: Push[][] = [];
  const harness = loadEdgeFunction(ENTRY, {
    env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY },
    getUser: (token) => ({
      data: { user: token === 'member-token' ? { id: CALLER_ID } : null },
      error: token === 'member-token' ? null : { message: 'invalid JWT: service key detail' },
    }),
    respond: (call) => {
      if (call.table === 'rpc:claim_group_session_notification') {
        return (
          options.claimResult ?? {
            data: options.claim ?? {
              status: 'ok',
              group_name: 'Alpha',
              recipients: [
                { user_id: MEMBER_A, language: 'es' },
                { user_id: MEMBER_B, language: 'en' },
              ],
            },
          }
        );
      }
      if (call.table === 'user_devices') {
        return (
          options.devices ?? {
            data: [
              { user_id: MEMBER_A, push_token: 'token-a' },
              { user_id: MEMBER_B, push_token: 'token-b' },
            ],
          }
        );
      }
      return {};
    },
    fetch: (async (_url: string, init: RequestInit) => {
      const batch = JSON.parse(String(init.body)) as Push[];
      pushes.push(batch);
      if (options.pushResponse) return options.pushResponse();
      return Response.json({ data: batch.map(() => ({ status: 'ok' })) });
    }) as typeof fetch,
  });
  const request = async (
    body: BodyInit | null,
    init: { method?: string; authorization?: string | null } = {}
  ) => {
    const authorization =
      init.authorization === undefined ? 'Bearer member-token' : init.authorization;
    const response = await harness.handle(
      new Request('https://functions.example/send-group-notification', {
        method: init.method ?? 'POST',
        headers: authorization ? { authorization } : {},
        body,
      })
    );
    const text = await response.text();
    return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> };
  };
  const valid = JSON.stringify({ group_id: GROUP_ID, session_id: SESSION_ID });
  return { harness, pushes, request, valid };
}

test('GET, PUT and DELETE are a JSON 405 before auth or any data access', async () => {
  const h = endpoint();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const result = await h.request(method === 'GET' ? null : h.valid, { method });
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
  }
  assert.deepEqual(h.harness.calls, []);
  assert.equal(h.harness.clientsCreated.length, 0);
});

test('the service-role key presented as a user token is refused without echoing Auth detail', async () => {
  const h = endpoint();
  const result = await h.request(h.valid, { authorization: `Bearer ${SERVICE_KEY}` });
  assert.equal(result.status, 401);
  assert.deepEqual(result.json, { success: false, error: 'Unauthorized' });
  assert.deepEqual(h.harness.calls, []);
});

test('bodies of the wrong JSON type or with non-UUID ids are a 400 before the claim', async () => {
  const h = endpoint();
  for (const body of [
    '',
    'null',
    '[]',
    '42',
    '"x"',
    JSON.stringify({ group_id: GROUP_ID }),
    JSON.stringify({ group_id: 7, session_id: SESSION_ID }),
    JSON.stringify({ group_id: `${GROUP_ID}\u0000`, session_id: SESSION_ID }),
    JSON.stringify({ group_id: [GROUP_ID], session_id: SESSION_ID }),
  ]) {
    const result = await h.request(body);
    assert.equal(result.status, 400, body);
    assert.deepEqual(result.json, { success: false, error: 'Invalid notification request' });
  }
  assert.deepEqual(h.harness.calls, []);
  assert.deepEqual(h.pushes, []);
});

test('an oversized body is a 413 before the claim', async () => {
  const h = endpoint();
  const result = await h.request(
    JSON.stringify({ group_id: GROUP_ID, session_id: SESSION_ID, padding: 'x'.repeat(5e6) })
  );
  assert.equal(result.status, 413);
  assert.deepEqual(result.json, { success: false, error: 'Request body is too large' });
  assert.deepEqual(h.harness.calls, []);
});

test('caller-chosen text, recipients and prototype keys never reach the push', async () => {
  const h = endpoint();
  const result = await h.request(
    `{"group_id":"${GROUP_ID}","session_id":"${SESSION_ID}","title":"Win a prize",` +
      '"body":"click me","exclude_user_id":"x","recipients":["someone"],' +
      '"__proto__":{"title":"polluted"}}'
  );
  assert.equal(result.status, 200);
  assert.deepEqual(
    h.pushes.flat().map((push) => push.to),
    ['token-a', 'token-b']
  );
  assert.ok(h.pushes.flat().every((push) => !/prize|click|polluted/.test(push.title + push.body)));
  assert.equal(({} as Record<string, unknown>).title, undefined);
});

test('a member whose saved language is an Object.prototype key still gets a push, and so does everyone else', async () => {
  for (const language of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const h = endpoint({
      claim: {
        status: 'ok',
        group_name: 'Alpha',
        recipients: [
          { user_id: MEMBER_A, language },
          { user_id: MEMBER_B, language: 'es' },
        ],
      },
    });
    const result = await h.request(h.valid);
    assert.equal(result.status, 200, language);
    assert.deepEqual(result.json, { success: true, sent: 2, errors: 0 }, language);
    const [toA, toB] = h.pushes.flat();
    assert.equal(toA.title, 'Group Session Completed', language);
    assert.equal(toB.title, 'Sesión de grupo completada', language);
  }
});

test('a saved language or group name with unusual text cannot break the push', async () => {
  // Escapes, not literal characters: U+2028 is a line terminator inside a regex literal.
  const lineSeparator = String.fromCharCode(0x2028);
  const h = endpoint({
    claim: {
      status: 'ok',
      group_name: `Grupo${String.fromCharCode(0)} 📖 ${String.fromCharCode(0x202e)}evil${lineSeparator}line`,
      recipients: [
        { user_id: MEMBER_A, language: 42 },
        { user_id: MEMBER_B, language: 'x'.repeat(10_000) },
      ],
    },
  });
  const result = await h.request(h.valid);
  assert.equal(result.status, 200);
  assert.equal(h.pushes.flat().length, 2);
  for (const push of h.pushes.flat()) {
    assert.ok(!push.body.includes(String.fromCharCode(0)));
    assert.ok(!push.body.includes(lineSeparator));
  }
});

test('a claim of an unexpected shape is a generic 500 and sends nothing', async () => {
  for (const claim of [null, 'ok', [], { status: 'surprise' }, { status: ['ok'] }]) {
    const h = endpoint({ claimResult: { data: claim } });
    const result = await h.request(h.valid);
    assert.equal(result.status, 500, JSON.stringify(claim));
    assert.deepEqual(result.json, { success: false, error: 'Unable to send group notification' });
    assert.deepEqual(h.pushes, []);
  }
});

test('garbage recipients and device rows are skipped rather than failing the request', async () => {
  const h = endpoint({
    claim: {
      status: 'ok',
      group_name: 'Alpha',
      recipients: [null, 'x', { user_id: 'not-a-uuid' }, { user_id: MEMBER_A, language: 'en' }],
    },
    devices: {
      data: [
        { user_id: MEMBER_A, push_token: null },
        { user_id: MEMBER_A, push_token: 42 },
        { user_id: MEMBER_B, push_token: 'not-a-recipient' },
        { user_id: MEMBER_A, push_token: 'token-a' },
      ],
    },
  });
  const result = await h.request(h.valid);
  assert.equal(result.status, 200);
  assert.deepEqual(
    h.pushes.flat().map((push) => push.to),
    ['token-a']
  );
});

test('a device lookup of an unexpected shape is a generic 500 with no detail', async () => {
  const h = endpoint({ devices: { data: { rows: [] } } });
  const result = await h.request(h.valid);
  assert.equal(result.status, 500);
  assert.deepEqual(result.json, { success: false, error: 'Unable to send group notification' });
});

test('an Expo answer that is not JSON counts the batch as failed, not the request', async () => {
  const h = endpoint({ pushResponse: () => new Response('<html>502</html>', { status: 200 }) });
  const result = await h.request(h.valid);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { success: true, sent: 0, errors: 2 });
});
