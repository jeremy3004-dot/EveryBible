import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Edge functions are Deno modules (URL imports, Deno globals), so they are loaded the same
// way as councilAccess.test.ts: transpile and run in a context with only the web globals.
type Ingest = typeof import('./analyticsIngest');

function loadIngest(): Ingest {
  const exports = {} as Ingest;
  const source = ts.transpileModule(
    readFileSync(new URL('./analyticsIngest.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    crypto,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    Uint8Array,
    Number,
    JSON,
    Array,
    console: { warn() {} },
  });
  return exports;
}

const ingest = loadIngest();

// Values built inside the vm context carry that realm's prototypes; compare them as plain data.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function streamingRequest(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request('https://collector.example', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);
}

function rpcFake(result: { data?: unknown; error?: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: unknown; key: unknown }> = [];
  return {
    calls,
    updates,
    client: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
      from: (table: string) => ({
        update: (values: unknown) => ({
          eq: async (_column: string, key: unknown) => {
            updates.push({ table, values, key });
            return { error: null };
          },
        }),
      }),
    },
  };
}

test('a body within the cap is returned with its byte length', async () => {
  const body = await ingest.readBodyWithinLimit(streamingRequest(['{"events":', '[]}']), 64);
  assert.deepEqual(plain(body), { ok: true, text: '{"events":[]}', bytes: 13 });
});

test('a chunked body with no content-length is cut off as soon as it passes the cap', async () => {
  const body = await ingest.readBodyWithinLimit(
    streamingRequest(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(40)]),
    64
  );
  assert.deepEqual(plain(body), { ok: false, reason: 'too_large' });
});

test('a declared content-length above the cap is refused without reading the body', async () => {
  const body = await ingest.readBodyWithinLimit(
    streamingRequest(['{}'], { 'content-length': '999999' }),
    64
  );
  assert.deepEqual(plain(body), { ok: false, reason: 'too_large' });
});

test('byte length counts UTF-8 bytes, not UTF-16 code units', async () => {
  const body = await ingest.readBodyWithinLimit(streamingRequest(['éé']), 64);
  assert.equal(body.ok && body.bytes, 4);
});

test('text fields longer than the column bound are rejected; absent fields are fine', () => {
  assert.equal(ingest.textFieldsWithinLimit(['reading_ended', 'ios', null, undefined]), true);
  assert.equal(ingest.textFieldsWithinLimit(['x'.repeat(ingest.MAX_TEXT_FIELD_CHARS + 1)]), false);
});

test('event properties above 4 KB, or unserializable, are rejected', () => {
  assert.equal(ingest.eventPropertiesWithinLimit({ duration_seconds: 30 }), true);
  assert.equal(ingest.eventPropertiesWithinLimit({ blob: 'x'.repeat(5000) }), false);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(ingest.eventPropertiesWithinLimit(circular), false);
});

test('queued_at keeps a 30-day offline replay window and is clamped to now', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;
  assert.equal(
    ingest.resolveQueuedAt(new Date(now - 29 * day).toISOString(), now),
    new Date(now - 29 * day).toISOString()
  );
  assert.equal(ingest.resolveQueuedAt(new Date(now - 31 * day).toISOString(), now), 'too_old');
  assert.equal(
    ingest.resolveQueuedAt(new Date(now + day).toISOString(), now),
    new Date(now).toISOString()
  );
  assert.equal(ingest.resolveQueuedAt('nonsense', now), 'invalid');
});

test('the client key is a salted digest that never contains the raw IP', async () => {
  const request = new Request('https://collector.example', {
    headers: { 'cf-connecting-ip': '203.0.113.9' },
  });
  const key = await ingest.hashIngestClientKey(request, 'salt-a');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes('203.0.113.9'));
  assert.equal(key, await ingest.hashIngestClientKey(request, 'salt-a'));
  assert.notEqual(key, await ingest.hashIngestClientKey(request, 'salt-b'));
});

test('the budget RPC is charged with this request’s events and bytes', async () => {
  const fake = rpcFake({
    data: [{ allowed: true, retry_after_seconds: 0, cached_geo: null, claim_geo_lookup: true }],
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 7, bytes: 900 });
  assert.deepEqual(plain(budget), {
    allowed: true,
    retryAfterSeconds: 0,
    cachedGeo: null,
    mayLookupGeo: true,
    degraded: false,
  });
  assert.equal(fake.calls[0].fn, 'consume_analytics_ingest_budget');
  assert.equal(fake.calls[0].args.p_client_key, 'key');
  assert.equal(fake.calls[0].args.p_event_count, 7);
  assert.equal(fake.calls[0].args.p_byte_count, 900);
});

test('an over-budget request is refused with a retry hint', async () => {
  const fake = rpcFake({
    data: [{ allowed: false, retry_after_seconds: 120, cached_geo: null, claim_geo_lookup: false }],
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.equal(budget.allowed, false);
  assert.equal(budget.retryAfterSeconds, 120);
  assert.equal(budget.mayLookupGeo, false);
});

test('a cached geo result is returned so no paid lookup is needed', async () => {
  const cached = { countryCode: 'NP', latitude: 28.2, longitude: 84, source: 'ipinfo' };
  const fake = rpcFake({
    data: [{ allowed: true, retry_after_seconds: 0, cached_geo: cached, claim_geo_lookup: false }],
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.deepEqual(budget.cachedGeo, cached);
  assert.equal(budget.mayLookupGeo, false);
});

test('if the limiter is unavailable, ingestion continues but paid geo lookups stop', async () => {
  const fake = rpcFake({ error: { message: 'function does not exist' } });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.deepEqual(plain(budget), {
    allowed: true,
    retryAfterSeconds: 0,
    cachedGeo: null,
    mayLookupGeo: false,
    degraded: true,
  });
});

test('a resolved geo result is remembered against the client key', async () => {
  const fake = rpcFake({});
  const geo = { countryCode: 'NP' };
  await ingest.rememberIngestGeo(fake.client, 'key', geo);
  assert.equal(fake.updates.length, 1);
  assert.equal(fake.updates[0].table, 'analytics_ingest_throttle');
  assert.equal(fake.updates[0].key, 'key');
  assert.deepEqual((fake.updates[0].values as { geo: unknown }).geo, geo);
});
