import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function collector(userId: string | null = null) {
  let handle!: (request: Request) => Promise<Response>;
  const stored = new Map<string, Record<string, unknown>>();
  let geoLookups = 0;
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const write = async (rows: Array<Record<string, unknown>>, options?: { ignoreDuplicates?: boolean }) => {
    for (const row of rows) {
      const id = String(row.id ?? crypto.randomUUID());
      if (!options?.ignoreDuplicates || !stored.has(id)) stored.set(id, row);
    }
    return { error: null };
  };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: {}, Request, Response, URL, AbortSignal, AbortController, setTimeout, clearTimeout, crypto, atob, console: { log() {} },
    Deno: { env: { get: () => 'configured' }, serve: (handler: typeof handle) => { handle = handler; } },
    fetch: async () => { geoLookups++; return Response.json({ country_code: 'US', country: 'US', latitude: 40.12345, longitude: -74.12345, city: 'New York' }); },
    require: () => ({ createClient: () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
      from: () => ({ insert: write, upsert: write }),
    }) }),
  });
  const event = { event_id: 'd2631107-1dbb-42a9-8a91-4de37dbe7201', event_name: 'reading_ended', event_properties: { duration_seconds: 30, translation_id: 'bsb' }, device_platform: 'ios', app_version: '1.0.7', session_id: 'session', queued_at: new Date().toISOString(), geo_country_code: 'NP', geo_latitude: 28.2096, geo_longitude: 83.9856, geo_source: 'cf-worker' };
  return { stored, event, geoLookups: () => geoLookups, send: (events: unknown[]) => handle(new Request('https://collector.example', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...(userId ? { authorization: `Bearer header.${btoa(JSON.stringify({ role: 'authenticated', sub: userId }))}.signature` } : {}) }, body: JSON.stringify({ events }) })) };
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
