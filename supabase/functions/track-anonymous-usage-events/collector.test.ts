import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

type BudgetMode = 'normal' | 'over' | 'unavailable';

function transpile(url: URL): string {
  return ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function collector(userId: string | null = null, budgetMode: BudgetMode = 'normal') {
  let handle!: (request: Request) => Promise<Response>;
  const stored = new Map<string, Record<string, unknown>>();
  let geoLookups = 0;
  const rpcCalls: Array<Record<string, unknown>> = [];
  // Minimal stand-in for consume_analytics_ingest_budget: one geo claim per key, then the
  // remembered geo is served from cache.
  const throttle = new Map<string, { claimed: boolean; geo: unknown }>();
  const write = async (rows: Array<Record<string, unknown>>, options?: { ignoreDuplicates?: boolean }) => {
    for (const row of rows) {
      const id = String(row.id ?? crypto.randomUUID());
      if (!options?.ignoreDuplicates || !stored.has(id)) stored.set(id, row);
    }
    return { error: null };
  };
  const rpc = async (_fn: string, args: Record<string, unknown>) => {
    rpcCalls.push(args);
    if (budgetMode === 'unavailable') return { data: null, error: { message: 'function does not exist' } };
    if (budgetMode === 'over') {
      return { data: [{ allowed: false, retry_after_seconds: 240, cached_geo: null, claim_geo_lookup: false }], error: null };
    }
    const key = String(args.p_client_key);
    const entry = throttle.get(key) ?? { claimed: false, geo: null };
    throttle.set(key, entry);
    const claim = entry.geo == null && !entry.claimed;
    if (claim) entry.claimed = true;
    return { data: [{ allowed: true, retry_after_seconds: 0, cached_geo: entry.geo, claim_geo_lookup: claim }], error: null };
  };
  const update = (table: string) => (values: { geo?: unknown }) => ({
    eq: async (_column: string, key: string) => {
      if (table === 'analytics_ingest_throttle') throttle.set(key, { claimed: true, geo: values.geo });
      return { error: null };
    },
  });
  const globals = {
    Request, Response, URL, AbortSignal, AbortController, setTimeout, clearTimeout, crypto, atob,
    TextEncoder, TextDecoder, Uint8Array, console: { log() {}, warn() {} },
  };
  const shared = {};
  runInNewContext(transpile(new URL('../_shared/analyticsIngest.ts', import.meta.url)), { ...globals, exports: shared });
  runInNewContext(transpile(new URL('./index.ts', import.meta.url)), {
    ...globals,
    exports: {},
    Deno: { env: { get: () => 'configured' }, serve: (handler: typeof handle) => { handle = handler; } },
    fetch: async () => { geoLookups++; return Response.json({ country_code: 'US', country: 'US', latitude: 40.12345, longitude: -74.12345, city: 'New York' }); },
    require: (id: string) => id.includes('_shared/analyticsIngest') ? shared : ({ createClient: () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
      rpc,
      from: (table: string) => ({ insert: write, upsert: write, update: update(table) }),
    }) }),
  });
  const event = { event_id: 'd2631107-1dbb-42a9-8a91-4de37dbe7201', event_name: 'reading_ended', event_properties: { duration_seconds: 30, translation_id: 'bsb' }, device_platform: 'ios', app_version: '1.0.7', session_id: 'session', queued_at: new Date().toISOString(), geo_country_code: 'NP', geo_latitude: 28.2096, geo_longitude: 83.9856, geo_source: 'cf-worker' };
  const headers = (extra: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.1', 'cf-ipcountry': 'GB', ...(userId ? { authorization: `Bearer header.${btoa(JSON.stringify({ role: 'authenticated', sub: userId }))}.signature` } : {}), ...extra });
  return {
    stored, event, rpcCalls, geoLookups: () => geoLookups,
    send: (events: unknown[], extraHeaders: Record<string, string> = {}) => handle(new Request('https://collector.example', { method: 'POST', headers: headers(extraHeaders), body: JSON.stringify({ events }) })),
    sendRaw: (body: string) => handle(new Request('https://collector.example', { method: 'POST', headers: headers(), body })),
  };
}

test('replaying an acknowledged event does not double-count it', async () => {
  const h = collector();
  assert.equal((await h.send([h.event])).status, 200);
  assert.equal((await h.send([h.event])).status, 200);
  assert.equal(h.stored.size, 1);
});

test('complete client IP geo skips external lookup and is rounded before storage', async () => {
  const h = collector();
  await h.send([h.event]);
  assert.equal(h.geoLookups(), 0);
  const row = [...h.stored.values()][0];
  assert.equal(row.geo_latitude, 28.2);
  assert.equal(row.geo_longitude, 84);
});

test('invalid dates are rejected before writing; malformed coordinates cannot create fake locations', async () => {
  const h = collector();
  assert.equal((await h.send([{ ...h.event, queued_at: 'nonsense' }])).status, 400);
  assert.equal(h.stored.size, 0);
  assert.equal((await h.send([{ ...h.event, geo_latitude: '', geo_longitude: 999 }])).status, 200);
  const row = [...h.stored.values()][0];
  assert.ok(row.geo_latitude === null || Math.abs(Number(row.geo_latitude)) <= 90);
  assert.ok(row.geo_longitude === null || Math.abs(Number(row.geo_longitude)) <= 180);
});

test('older clients without event IDs still ingest and GPS payloads are not trusted', async () => {
  const h = collector();
  const { event_id: _id, ...legacy } = h.event;
  assert.equal((await h.send([{ ...legacy, geo_source: 'gps', geo_latitude: 12.34567, geo_longitude: 45.67891 }])).status, 200);
  const row = [...h.stored.values()][0];
  assert.notEqual(row.geo_source, 'gps');
  assert.notEqual(row.geo_latitude, 12.34567);
});


test('offline usage is never reassigned to a different signed-in account', async () => {
  const h = collector('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await h.send([{ ...h.event, attribution_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);
  assert.equal([...h.stored.values()][0].user_id, null);
});

test('matching event-time identity is attributed only after token verification', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const h = collector(id);
  await h.send([{ ...h.event, attribution_user_id: id }]);
  assert.equal([...h.stored.values()][0].user_id, id);
});

test('an oversized event_properties bag is dropped without failing the rest of the batch (S5)', async () => {
  const h = collector();
  const oversized = { ...h.event, event_id: '11111111-1111-4111-8111-111111111111', event_properties: { blob: 'x'.repeat(5000) } };
  const response = await h.send([oversized, h.event]);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rejected, 1);
  assert.equal(body.inserted, 1);
  assert.equal(h.stored.size, 1);
  assert.equal([...h.stored.values()][0].event_properties.blob, undefined);
});

test('events queued more than 30 days ago cannot backdate the rollups (S5)', async () => {
  const h = collector();
  const stale = { ...h.event, event_id: '22222222-2222-4222-8222-222222222222', queued_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() };
  const fresh = { ...h.event, event_id: '33333333-3333-4333-8333-333333333333', queued_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString() };
  const body = await (await h.send([stale, fresh])).json();
  assert.equal(body.rejected, 1);
  assert.equal(body.inserted, 1);
  assert.equal([...h.stored.values()][0].id, '33333333-3333-4333-8333-333333333333');
});

test('a batch whose every event is dropped is acknowledged so the client stops retrying (S5)', async () => {
  const h = collector();
  const response = await h.send([{ ...h.event, event_properties: { blob: 'x'.repeat(5000) } }]);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.inserted, 0);
  assert.equal(body.rejected, 1);
  assert.equal(body.ok, true);
  assert.equal(h.stored.size, 0);
  assert.equal(h.geoLookups(), 0, 'a fully-rejected batch must not spend an external geo lookup');
});

test('a batch above the 500-event ceiling is refused outright (S5)', async () => {
  const h = collector();
  const batch = Array.from({ length: 501 }, () => ({ ...h.event, event_id: crypto.randomUUID() }));
  assert.equal((await h.send(batch)).status, 400);
  assert.equal(h.stored.size, 0);
});

// ── M1: body cap, field caps, per-client budget, geo lookup cache ───────────

test('a request body over 512 KB is refused before parsing or charging the budget', async () => {
  const h = collector();
  const response = await h.sendRaw(JSON.stringify({ events: [h.event], pad: 'x'.repeat(600 * 1024) }));
  assert.equal(response.status, 413);
  assert.equal(h.stored.size, 0);
  assert.equal(h.rpcCalls.length, 0);
});

test('an event whose text fields exceed the column bound is dropped, not the batch', async () => {
  const h = collector();
  const longName = { ...h.event, event_id: '44444444-4444-4444-8444-444444444444', event_name: 'x'.repeat(200) };
  const longCity = { ...h.event, event_id: '55555555-5555-4555-8555-555555555555', geo_city: 'y'.repeat(200) };
  const body = await (await h.send([longName, longCity, h.event])).json();
  assert.equal(body.inserted, 1);
  assert.equal(body.rejected, 2);
  assert.deepEqual([...h.stored.keys()], [h.event.event_id]);
});

test('an over-budget client gets 429 with Retry-After and costs no write or geo lookup', async () => {
  const h = collector(null, 'over');
  const { geo_source: _source, ...needsRequestGeo } = h.event;
  const response = await h.send([needsRequestGeo]);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '240');
  assert.equal(h.stored.size, 0);
  assert.equal(h.geoLookups(), 0);
});

test('the budget is charged with the accepted events and body bytes under a hashed key', async () => {
  const h = collector();
  await h.send([h.event, h.event]);
  assert.equal(h.rpcCalls.length, 1);
  assert.equal(h.rpcCalls[0].p_event_count, 2);
  assert.ok(Number(h.rpcCalls[0].p_byte_count) > 100);
  assert.match(String(h.rpcCalls[0].p_client_key), /^[0-9a-f]{64}$/);
  assert.ok(!String(h.rpcCalls[0].p_client_key).includes('203.0.113.1'));
});

test('a flood from one address makes one paid geo lookup and reuses the cached result', async () => {
  const h = collector();
  const { geo_source: _source, ...needsRequestGeo } = h.event;
  for (let i = 0; i < 5; i++) {
    const response = await h.send([{ ...needsRequestGeo, event_id: crypto.randomUUID() }]);
    assert.equal(response.status, 200);
  }
  assert.equal(h.geoLookups(), 1);
  const rows = [...h.stored.values()];
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.geo_country_code === 'US' && row.geo_city === 'New York'));
});

test('when the limiter is unavailable events are still stored but no paid lookup is made', async () => {
  const h = collector(null, 'unavailable');
  const { geo_source: _source, ...needsRequestGeo } = h.event;
  const response = await h.send([needsRequestGeo]);
  assert.equal(response.status, 200);
  assert.equal(h.geoLookups(), 0);
  const row = [...h.stored.values()][0];
  assert.equal(row.geo_country_code, 'GB');
  assert.equal(row.geo_source, 'cf_ipcountry');
});

test('a real client batch (100 events, 30-day-old replay) fits every limit', async () => {
  const h = collector();
  const day = 24 * 60 * 60 * 1000;
  const batch = Array.from({ length: 100 }, (_, i) => ({
    ...h.event,
    event_id: crypto.randomUUID(),
    event_properties: { duration_seconds: 30, translation_id: 'bsb', book_id: 'GEN', chapter: i, analytics_schema_version: 2 },
    queued_at: new Date(Date.now() - 29 * day - i * 1000).toISOString(),
  }));
  const body = await (await h.send(batch)).json();
  assert.equal(body.inserted, 100);
  assert.equal(body.rejected, 0);
});
