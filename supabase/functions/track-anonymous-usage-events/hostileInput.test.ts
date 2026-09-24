import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction } from '../_testing/edgeFunctionHarness';

// Hostile and malformed input against the public (verify_jwt = false) anonymous collector.
// Every answer must be a small JSON 4xx for a client mistake, never a 500, and nothing that
// Postgres would refuse may reach the upsert (one refused value fails the whole batch, and the
// device then retries that batch forever).
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

type Row = Record<string, unknown>;

const event = (overrides: Row = {}): Row => ({
  event_id: 'd2631107-1dbb-42a9-8a91-4de37dbe7201',
  event_name: 'reading_ended',
  event_properties: { duration_seconds: 30 },
  device_platform: 'ios',
  app_version: '1.0.8',
  session_id: 'session',
  queued_at: new Date().toISOString(),
  ...overrides,
});
const GOOD_ID = '0f5c8a36-2a8b-4c43-9f0e-7d1a5b2c3e4f';

function collector() {
  const harness = loadEdgeFunction(ENTRY, {
    respond: (call) =>
      call.table === 'rpc:consume_analytics_ingest_budget'
        ? { data: [{ allowed: true, claim_geo_lookup: false }] }
        : { data: null, error: null },
  });
  const rows = (): Row[] =>
    harness.calls
      .filter((call) => call.table === 'analytics_events')
      .flatMap(
        (call) => (call.steps.find((step) => step.method === 'upsert')?.args[0] as Row[]) ?? []
      );
  const budgetCharges = () =>
    harness.calls.filter((call) => call.table === 'rpc:consume_analytics_ingest_budget').length;
  const post = async (body: BodyInit, headers: Record<string, string> = {}) => {
    const response = await harness.handle(
      new Request('https://collector.example', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.1', ...headers },
        body,
      })
    );
    const text = await response.text();
    return { status: response.status, text, json: JSON.parse(text) as Row };
  };
  return {
    harness,
    rows,
    budgetCharges,
    post,
    send: (events: unknown[]) => post(JSON.stringify({ events })),
  };
}

test('bodies of the wrong JSON type are a 400 with a one-line error and no budget charge', async () => {
  const h = collector();
  for (const body of ['', '[]', '42', 'true', '"x"', '{"events":null}', '{"events":"a"}']) {
    const result = await h.post(body);
    assert.equal(result.status, 400, body);
    assert.deepEqual(result.json, { error: 'Request body must include analytics events' });
  }
  assert.equal(h.budgetCharges(), 0);
  assert.deepEqual(h.rows(), []);
});

test('a missing or wrong Content-Type does not change how the JSON body is read', async () => {
  const h = collector();
  for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
    const result = await h.post(
      JSON.stringify({ events: [event()] }),
      contentType ? { 'Content-Type': contentType } : {}
    );
    assert.equal(result.status, 200, contentType);
  }
});

test('a 5 MB body is refused with 413 before parsing or charging the budget', async () => {
  const h = collector();
  const result = await h.post(JSON.stringify({ events: [event({ blob: 'x'.repeat(5e6) })] }));
  assert.equal(result.status, 413);
  assert.equal(h.budgetCharges(), 0);
});

test('100k tiny events that fit the byte cap are refused by the batch ceiling', async () => {
  const h = collector();
  const result = await h.post(`{"events":[${Array(100_000).fill('{}').join(',')}]}`);
  assert.equal(result.status, 400);
  assert.equal(h.budgetCharges(), 0);
});

test('deeply nested JSON is a 400 or a dropped event, never a 500', async () => {
  const h = collector();
  const depth = 200_000;
  const nestedBody = await h.post(`${'['.repeat(depth)}${']'.repeat(depth)}`);
  assert.equal(nestedBody.status, 400);

  // Built as text: JSON.stringify of this object in the test itself could overflow the stack.
  const nested = `${'{"a":'.repeat(20_000)}1${'}'.repeat(20_000)}`;
  const shallow = JSON.stringify(event()).slice(0, -1);
  const good = JSON.stringify(event({ event_id: GOOD_ID }));
  const result = await h.post(`{"events":[${shallow},"event_properties":${nested}},${good}]}`);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 1);
  assert.equal(h.rows().length, 1);
});

test('an event with a NUL byte in a text column is dropped, not the batch', async () => {
  const h = collector();
  const result = await h.send([
    event({ event_name: 'reading\u0000ended' }),
    event({ event_id: GOOD_ID }),
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 1);
  assert.deepEqual(
    h.rows().map((row) => row.id),
    [GOOD_ID]
  );
});

test('NUL bytes anywhere in event_properties (values or keys) drop that event', async () => {
  const h = collector();
  const result = await h.send([
    event({ event_properties: { note: 'a\u0000b' } }),
    event({ event_id: undefined, event_properties: { 'k\u0000': 1 } }),
    event({ event_id: undefined, event_properties: { list: [{ deep: '\u0000' }] } }),
    event({ event_id: GOOD_ID, event_properties: { path: 'C:\\u0000 is literal text' } }),
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 3);
  assert.deepEqual(
    h.rows().map((row) => row.event_properties),
    [{ path: 'C:\\u0000 is literal text' }]
  );
});

test('a lone UTF-16 surrogate (no UTF-8 form) drops the event', async () => {
  const h = collector();
  const result = await h.send([
    event({ session_id: 'abc\ud800' }),
    event({ event_id: undefined, event_properties: { t: '\udc00x' } }),
    event({ event_id: GOOD_ID }),
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.json.rejected, 2);
  assert.equal(h.rows().length, 1);
});

test('emoji, RTL, zero-width and combining text is stored exactly as sent', async () => {
  const h = collector();
  const text = 'قراءة 📖 ‎a\u200bb\u200dc e\u0301';
  const result = await h.send([event({ event_name: text, event_properties: { text } })]);
  assert.equal(result.status, 200);
  assert.equal(h.rows()[0].event_name, text);
  assert.deepEqual(h.rows()[0].event_properties, { text });
});

test('prototype-pollution keys are stored as plain data and pollute nothing', async () => {
  const h = collector();
  const body =
    '{"events":[{"event_id":"d2631107-1dbb-42a9-8a91-4de37dbe7201","event_name":"x",' +
    '"device_platform":"ios","app_version":"1","queued_at":"' +
    new Date().toISOString() +
    '","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},' +
    '"event_properties":{"__proto__":{"polluted":true},"constructor":1}}],' +
    '"__proto__":{"polluted":true}}';
  const result = await h.post(body);
  assert.equal(result.status, 200);
  assert.equal(({} as Row).polluted, undefined);
  const stored = h.rows()[0];
  assert.equal(Object.getPrototypeOf(stored), Object.prototype);
  assert.equal(stored.polluted, undefined);
  assert.equal(stored.constructor, Object);
  const properties = stored.event_properties as Row;
  assert.deepEqual(Object.keys(properties), ['__proto__', 'constructor']);
});

test('a duplicated event id in one batch is written once', async () => {
  const h = collector();
  const result = await h.send([event(), event({ event_name: 'replayed' })]);
  assert.equal(result.status, 200);
  assert.equal(result.json.inserted, 1);
  assert.deepEqual(
    h.rows().map((row) => row.event_name),
    ['reading_ended']
  );
});

test('huge, negative and non-finite geo numbers become null instead of failing the write', async () => {
  const h = collector();
  const result = await h.post(
    `{"events":[${JSON.stringify(event({ geo_source: 'cf-worker', geo_country_code: 'NP' })).slice(0, -1)},` +
      '"geo_latitude":1e309,"geo_longitude":-1e309,"geo_accuracy_km":-5}]}'
  );
  assert.equal(result.status, 200);
  const row = h.rows()[0];
  assert.equal(row.geo_latitude, null);
  assert.equal(row.geo_longitude, null);
  assert.equal(row.geo_accuracy_km, null);
});

test('a far-future queued_at is clamped to receipt time; unparseable dates reject the batch', async () => {
  const h = collector();
  const before = Date.now();
  const future = await h.send([event({ queued_at: '+275760-09-13T00:00:00.000Z' })]);
  assert.equal(future.status, 200);
  const createdAt = Date.parse(String(h.rows()[0].created_at));
  assert.ok(createdAt >= before && createdAt <= Date.now());

  for (const queuedAt of ['2026-13-45T99:00:00Z', 'yesterday', 12345]) {
    const result = await h.send([event({ queued_at: queuedAt })]);
    assert.equal(result.status, 400, String(queuedAt));
  }
});

test('wrong types for required fields reject the batch without a write', async () => {
  const h = collector();
  for (const overrides of [
    { event_name: 42 },
    { device_platform: ['ios'] },
    { app_version: { v: 1 } },
  ]) {
    assert.equal((await h.send([event(overrides)])).status, 400, JSON.stringify(overrides));
  }
  assert.deepEqual(h.rows(), []);
});

test('a non-string event id is ignored and the server assigns its own', async () => {
  const h = collector();
  assert.equal((await h.send([event({ event_id: 7 })])).status, 200);
  assert.match(String(h.rows()[0].id), /^[0-9a-f-]{36}$/);
});

test('extra unexpected fields are ignored, never stored', async () => {
  const h = collector();
  await h.send([event({ user_id: 'someone-else', is_admin: true, received_at: '1999-01-01' })]);
  const row = h.rows()[0];
  assert.equal(row.user_id, null);
  assert.equal('is_admin' in row, false);
  assert.notEqual(row.received_at, '1999-01-01');
});
