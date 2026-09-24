import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeHarnessOptions } from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against the signed-in analytics endpoint (verify_jwt = false,
// token verified in the function). Client mistakes are a small JSON 4xx, and nothing Postgres
// would refuse reaches the insert: one refused value fails the whole batch with a 500 and the
// app retries that batch forever.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Row = Record<string, unknown>;

const event = (overrides: Row = {}): Row => ({
  event_name: 'reading_ended',
  event_properties: { duration_seconds: 30 },
  device_platform: 'ios',
  app_version: '1.0.8',
  session_id: 'session',
  queued_at: new Date().toISOString(),
  ...overrides,
});

function endpoint(options: { getUser?: EdgeHarnessOptions['getUser'] } = {}) {
  const harness = loadEdgeFunction(ENTRY, {
    getUser:
      options.getUser ??
      ((token) =>
        token === 'valid-user-token'
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'JWT expired' } }),
    respond: (call) =>
      call.table === 'rpc:consume_analytics_ingest_budget'
        ? { data: [{ allowed: true, claim_geo_lookup: false }] }
        : { data: null, error: null },
  });
  const rows = (): Row[] =>
    harness.calls
      .filter((call) => call.table === 'analytics_events')
      .flatMap(
        (call) => (call.steps.find((step) => step.method === 'insert')?.args[0] as Row[]) ?? []
      );
  const request = async (
    body: BodyInit | null,
    init: { method?: string; token?: string | null } = {}
  ) => {
    const token = init.token === undefined ? 'valid-user-token' : init.token;
    const response = await harness.handle(
      new Request('https://functions.example/track-analytics-events', {
        method: init.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      })
    );
    const text = await response.text();
    return { status: response.status, json: JSON.parse(text) as Row };
  };
  return {
    harness,
    rows,
    request,
    send: (events: unknown[]) => request(JSON.stringify({ events })),
  };
}

test('GET, PUT, PATCH and DELETE are refused with 405 before any auth or database work', async () => {
  const h = endpoint();
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const result = await h.request(method === 'GET' ? null : '{"events":[]}', { method });
    assert.equal(result.status, 405, method);
    assert.deepEqual(result.json, { success: false, error: 'Method not allowed' });
  }
  assert.equal(h.harness.clientsCreated.length, 0);
  assert.deepEqual(h.harness.calls, []);
});

test('a missing, garbage or expired token is a 401 and nothing is stored', async () => {
  const h = endpoint();
  for (const token of [null, 'garbage', 'Bearer', 'eyJhbGciOiJIUzI1NiJ9.e30.x']) {
    const result = await h.request(JSON.stringify({ events: [event()] }), { token });
    assert.equal(result.status, 401, String(token));
  }
  assert.deepEqual(h.rows(), []);
});

test('bodies of the wrong JSON type are a 400', async () => {
  const h = endpoint();
  for (const body of ['', 'null', '[]', '42', '"events"', '{"events":{}}', '{"events":"x"}']) {
    const result = await h.request(body);
    assert.equal(result.status, 400, body);
    assert.deepEqual(result.json, {
      success: false,
      error: 'Request body must include an events list',
    });
  }
  assert.deepEqual(h.rows(), []);
});

test('an event with a NUL byte in a text column is dropped, not the batch', async () => {
  const h = endpoint();
  const result = await h.send([event({ event_name: 'reading\u0000ended' }), event()]);
  assert.equal(result.status, 200);
  assert.equal(result.json.inserted, 1);
  assert.equal(result.json.rejected, 1);
  assert.deepEqual(
    h.rows().map((row) => row.event_name),
    ['reading_ended']
  );
});

test('NUL bytes and lone surrogates anywhere in event_properties drop that event', async () => {
  const h = endpoint();
  const result = await h.send([
    event({ event_properties: { note: 'a\u0000b' } }),
    event({ event_properties: { 'k\u0000': 1 } }),
    event({ event_properties: { nested: [{ t: '\ud83d' }] } }),
    event({ session_id: '\udc00' }),
    event({ event_properties: { emoji: '📖', path: 'C:\\u0000' } }),
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 4);
  assert.deepEqual(
    h.rows().map((row) => row.event_properties),
    [{ emoji: '📖', path: 'C:\\u0000' }]
  );
});

test('a NUL byte in accepted payload geo drops the event rather than the batch', async () => {
  const h = endpoint();
  const result = await h.send([
    event({ geo_source: 'cf-worker', geo_country_code: 'NP', geo_city: 'Pokh\u0000ara' }),
    event(),
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 1);
  assert.equal(h.rows().length, 1);
});

test('prototype-pollution keys neither pollute nor reach a stored column', async () => {
  const h = endpoint();
  const raw =
    '{"__proto__":{"polluted":1},"events":[{"event_name":"x","device_platform":"ios",' +
    '"app_version":"1","__proto__":{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},' +
    '"constructor":{"prototype":{"polluted":1}},"event_properties":{"__proto__":{"a":1}}}]}';
  const result = await h.request(raw);
  assert.equal(result.status, 200);
  assert.equal(({} as Row).polluted, undefined);
  const row = h.rows()[0];
  assert.equal(row.user_id, USER_ID);
  assert.deepEqual(Object.keys(row.event_properties as Row), ['__proto__']);
});

test('huge and non-finite numbers in payload geo never become a map point', async () => {
  const h = endpoint();
  const withGeo = JSON.stringify(event({ geo_source: 'cf-worker', geo_country_code: 'NP' }));
  const result = await h.request(
    `{"events":[${withGeo.slice(0, -1)},"geo_latitude":1e309,"geo_longitude":-1e999}]}`
  );
  assert.equal(result.status, 200);
  assert.equal(h.rows()[0].geo_latitude, null);
  assert.equal(h.rows()[0].geo_longitude, null);
});

test('100k events inside the byte cap are refused by the batch ceiling', async () => {
  const h = endpoint();
  const result = await h.request(`{"events":[${Array(100_000).fill('0').join(',')}]}`);
  assert.equal(result.status, 400);
  assert.deepEqual(h.rows(), []);
});

test('deeply nested properties are dropped per event instead of failing the request', async () => {
  const h = endpoint();
  const nested = `${'{"a":'.repeat(20_000)}1${'}'.repeat(20_000)}`;
  const shallow = JSON.stringify(event()).slice(0, -1);
  const result = await h.request(
    `{"events":[${shallow},"event_properties":${nested}},${JSON.stringify(event())}]}`
  );
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 1);
  assert.equal(h.rows().length, 1);
});

test('an Auth outage while verifying the token is a generic 500 without detail', async () => {
  const h = endpoint({
    getUser: () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:9999 service-key=secret');
    },
  });
  const result = await h.send([event()]);
  assert.equal(result.status, 500);
  assert.deepEqual(result.json, {
    success: false,
    error: 'Unable to record analytics events right now.',
  });
  assert.deepEqual(h.rows(), []);
});
