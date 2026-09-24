import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import * as ingest from './analyticsIngest.ts';

// analyticsIngest.ts has no Deno or supabase-js imports, so it loads through the normal
// loader. The limiter's console.warn is silenced for the degraded-path cases.
mock.method(console, 'warn', () => undefined);

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
  assert.deepEqual(body, { ok: true, text: '{"events":[]}', bytes: 13 });
});

test('a chunked body with no content-length is cut off as soon as it passes the cap', async () => {
  const body = await ingest.readBodyWithinLimit(
    streamingRequest(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(40)]),
    64
  );
  assert.deepEqual(body, { ok: false, reason: 'too_large' });
});

test('a declared content-length above the cap is refused without reading the body', async () => {
  const body = await ingest.readBodyWithinLimit(
    streamingRequest(['{}'], { 'content-length': '999999' }),
    64
  );
  assert.deepEqual(body, { ok: false, reason: 'too_large' });
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
  assert.equal(ingest.resolveQueuedAt(now, now), 'invalid', 'epoch numbers are not accepted');
  assert.equal(ingest.resolveQueuedAt(undefined, now), 'invalid');
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

test('a caller-chosen x-forwarded-for cannot mint a fresh throttle key', async () => {
  const spoofed = (forwarded: string) =>
    new Request('https://collector.example', { headers: { 'x-forwarded-for': forwarded } });
  assert.equal(
    await ingest.hashIngestClientKey(spoofed('198.51.100.1'), 'salt'),
    await ingest.hashIngestClientKey(spoofed('198.51.100.2'), 'salt')
  );
  const stamped = new Request('https://collector.example', {
    headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' },
  });
  assert.equal(ingest.getClientIp(stamped), '203.0.113.9');
});

test('the budget RPC is charged with this request’s events and bytes', async () => {
  const fake = rpcFake({
    data: [{ allowed: true, retry_after_seconds: 0, cached_geo: null, claim_geo_lookup: true }],
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 7, bytes: 900 });
  assert.deepEqual(budget, {
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

// Writes used to continue when the limiter was unavailable. With the 3 s limiter timeout, a
// flood that queues on one address's throttle row makes the limiter "unavailable" on demand,
// which waved that flood past its budget (security review 2026-09-24, pass 2). The collectors
// now refuse with Retry-After; the app keeps the batch and retries it.
test('if the limiter is unavailable, writes are refused for a minute and paid lookups stop', async () => {
  const fake = rpcFake({ error: { message: 'function does not exist' } });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.deepEqual(budget, {
    allowed: false,
    retryAfterSeconds: 60,
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

test('a request with no body reads as empty text', async () => {
  const request = new Request('https://collector.example', { method: 'POST' });
  assert.deepEqual(await ingest.readBodyWithinLimit(request), { ok: true, text: '', bytes: 0 });
});

test('the user throttle key is a salted digest that never contains the user id', async () => {
  const key = await ingest.hashIngestUserKey('user-123', 'salt-a');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key.includes('user-123'), false);
  assert.equal(await ingest.hashIngestUserKey('user-123', 'salt-a'), key);
  assert.notEqual(await ingest.hashIngestUserKey('user-123', 'salt-b'), key);
  assert.notEqual(await ingest.hashIngestUserKey('user-456', 'salt-a'), key);
  const request = new Request('https://collector.example', {
    headers: { 'cf-connecting-ip': 'user-123' },
  });
  assert.notEqual(
    await ingest.hashIngestClientKey(request, 'salt-a'),
    key,
    'user and IP keys live in separate namespaces'
  );
});

test('a limiter that returns a single row object (not a set) is read the same way', async () => {
  const fake = rpcFake({
    data: { allowed: true, retry_after_seconds: 0, cached_geo: null, claim_geo_lookup: true },
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.equal(budget.allowed, true);
  assert.equal(budget.mayLookupGeo, true);
  assert.equal(budget.degraded, false);
});

test('a limiter row without a boolean verdict refuses writes and paid lookups', async () => {
  for (const data of [[], [{ allowed: 'yes', claim_geo_lookup: true }]]) {
    const fake = rpcFake({ data });
    const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
    assert.deepEqual(budget, {
      allowed: false,
      retryAfterSeconds: 60,
      cachedGeo: null,
      mayLookupGeo: false,
      degraded: true,
    });
  }
});

test('a limiter that throws or times out refuses writes and paid lookups', async () => {
  const client = {
    ...rpcFake({}).client,
    rpc: async () => {
      throw new Error('connection reset');
    },
  };
  const budget = await ingest.consumeIngestBudget(client, 'key', { events: 1, bytes: 10 });
  assert.deepEqual(budget, {
    allowed: false,
    retryAfterSeconds: 60,
    cachedGeo: null,
    mayLookupGeo: false,
    degraded: true,
  });
});

test('a refusal with a missing or invalid retry hint still asks the client to wait', async () => {
  for (const retry of [null, 0, 'soon', -5]) {
    const fake = rpcFake({ data: [{ allowed: false, retry_after_seconds: retry }] });
    const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
    assert.equal(budget.allowed, false);
    assert.equal(budget.retryAfterSeconds, 1, `retry_after_seconds ${String(retry)}`);
  }
});

test('a cached geo value that is not a plain object is ignored', async () => {
  for (const cached of [['NP'], 'NP', 42]) {
    const fake = rpcFake({
      data: [{ allowed: true, cached_geo: cached, claim_geo_lookup: true }],
    });
    const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
    assert.equal(budget.cachedGeo, null);
    assert.equal(budget.mayLookupGeo, true);
  }
});

test('a refused request never claims the paid geo lookup, even if the limiter offers it', async () => {
  const fake = rpcFake({
    data: [{ allowed: false, retry_after_seconds: 5, claim_geo_lookup: true }],
  });
  const budget = await ingest.consumeIngestBudget(fake.client, 'key', { events: 1, bytes: 10 });
  assert.equal(budget.mayLookupGeo, false);
});

test('a failed geo cache write is swallowed', async () => {
  const client = {
    ...rpcFake({}).client,
    from: () => ({
      update: () => ({
        eq: async () => {
          throw new Error('permission denied');
        },
      }),
    }),
  };
  await assert.doesNotReject(ingest.rememberIngestGeo(client, 'key', { countryCode: 'NP' }));
});
