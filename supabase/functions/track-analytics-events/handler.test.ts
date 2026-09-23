import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Deno edge function: loaded like track-anonymous-usage-events/collector.test.ts, with the
// shared ingest module wired in and supabase-js replaced by a recording fake.

type BudgetMode = 'normal' | 'over';

function transpile(url: URL): string {
  return ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DAY = 24 * 60 * 60 * 1000;

function endpoint(budgetMode: BudgetMode = 'normal') {
  let handle!: (request: Request) => Promise<Response>;
  const stored: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<Record<string, unknown>> = [];
  const throttle = new Map<string, { claimed: boolean; geo: unknown }>();
  let geoLookups = 0;

  const rpc = async (_fn: string, args: Record<string, unknown>) => {
    rpcCalls.push(args);
    if (budgetMode === 'over') {
      return {
        data: [
          { allowed: false, retry_after_seconds: 90, cached_geo: null, claim_geo_lookup: false },
        ],
        error: null,
      };
    }
    const key = String(args.p_client_key);
    const entry = throttle.get(key) ?? { claimed: false, geo: null };
    throttle.set(key, entry);
    const claim = entry.geo == null && !entry.claimed;
    if (claim) entry.claimed = true;
    return {
      data: [
        { allowed: true, retry_after_seconds: 0, cached_geo: entry.geo, claim_geo_lookup: claim },
      ],
      error: null,
    };
  };
  const client = {
    auth: {
      getUser: async (token: string) =>
        token === 'valid-user-token'
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    rpc,
    from: (table: string) => ({
      insert: async (rows: Array<Record<string, unknown>>) => {
        stored.push(...rows);
        return { error: null };
      },
      update: (values: { geo?: unknown }) => ({
        eq: async (_column: string, key: string) => {
          if (table === 'analytics_ingest_throttle') {
            throttle.set(key, { claimed: true, geo: values.geo });
          }
          return { error: null };
        },
      }),
    }),
  };

  const globals = {
    Request,
    Response,
    URL,
    AbortSignal,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    console: { log() {}, warn() {} },
  };
  const shared = {};
  runInNewContext(transpile(new URL('../_shared/analyticsIngest.ts', import.meta.url)), {
    ...globals,
    exports: shared,
  });
  runInNewContext(transpile(new URL('./index.ts', import.meta.url)), {
    ...globals,
    exports: {},
    Deno: {
      env: { get: () => 'configured' },
      serve: (handler: typeof handle) => {
        handle = handler;
      },
    },
    fetch: async () => {
      geoLookups++;
      return Response.json({ country: 'NP', loc: '28.2096,83.9856', city: 'Pokhara' });
    },
    require: (id: string) =>
      id.includes('_shared/analyticsIngest') ? shared : { createClient: () => client },
  });

  const event = {
    event_name: 'reading_ended',
    event_properties: { duration_seconds: 30 },
    device_platform: 'ios',
    app_version: '1.0.9',
    session_id: 'session',
    queued_at: new Date().toISOString(),
  };
  const request = (body: string, token = 'valid-user-token') =>
    new Request('https://collector.example', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        'cf-ipcountry': 'NP',
        authorization: `Bearer ${token}`,
      },
      body,
    });
  return {
    stored,
    rpcCalls,
    event,
    geoLookups: () => geoLookups,
    send: (events: unknown[], token?: string) => handle(request(JSON.stringify({ events }), token)),
    sendRaw: (body: string) => handle(request(body)),
  };
}

test('an unverified token is still refused', async () => {
  const h = endpoint();
  const response = await h.send([h.event], 'forged');
  assert.equal(response.status, 401);
  assert.equal(h.stored.length, 0);
});

test('a signed-in user cannot backdate events past the 30-day offline window', async () => {
  const h = endpoint();
  const stale = { ...h.event, queued_at: new Date(Date.now() - 31 * DAY).toISOString() };
  const replay = { ...h.event, queued_at: new Date(Date.now() - 29 * DAY).toISOString() };
  const body = await (await h.send([stale, replay])).json();
  assert.equal(body.inserted, 1);
  assert.equal(body.rejected, 1);
  assert.equal(h.stored.length, 1);
  assert.equal(h.stored[0].created_at, replay.queued_at);
});

test('a future queued_at is clamped to the time of receipt', async () => {
  const h = endpoint();
  const before = Date.now();
  await h.send([{ ...h.event, queued_at: new Date(Date.now() + 365 * DAY).toISOString() }]);
  const createdAt = Date.parse(String(h.stored[0].created_at));
  assert.ok(createdAt >= before && createdAt <= Date.now());
});

test('an event with no queued_at is stamped now; an unparseable one is dropped', async () => {
  const h = endpoint();
  const { queued_at: _queuedAt, ...unstamped } = h.event;
  const body = await (await h.send([unstamped, { ...h.event, queued_at: 'nonsense' }])).json();
  assert.equal(body.inserted, 1);
  assert.equal(body.rejected, 1);
  assert.ok(Number.isFinite(Date.parse(String(h.stored[0].created_at))));
});

test('oversized properties and over-long text fields are dropped per event', async () => {
  const h = endpoint();
  const body = await (
    await h.send([
      { ...h.event, event_properties: { blob: 'x'.repeat(5000) } },
      { ...h.event, event_name: 'x'.repeat(200) },
      h.event,
    ])
  ).json();
  assert.equal(body.inserted, 1);
  assert.equal(body.rejected, 2);
  assert.equal(h.stored.length, 1);
  assert.equal(h.stored[0].event_name, 'reading_ended');
});

test('a request body over 512 KB is refused before authentication or any write', async () => {
  const h = endpoint();
  const response = await h.sendRaw(
    JSON.stringify({ events: [h.event], pad: 'x'.repeat(600 * 1024) })
  );
  assert.equal(response.status, 413);
  assert.equal(h.stored.length, 0);
  assert.equal(h.rpcCalls.length, 0);
});

test('an account over its ingest budget gets 429 with Retry-After', async () => {
  const h = endpoint('over');
  const response = await h.send([h.event]);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '90');
  assert.equal(h.stored.length, 0);
  assert.equal(h.geoLookups(), 0);
});

test('the budget is keyed on a digest of the verified user, not the raw id', async () => {
  const h = endpoint();
  await h.send([h.event, h.event]);
  assert.equal(h.rpcCalls[0].p_event_count, 2);
  assert.match(String(h.rpcCalls[0].p_client_key), /^[0-9a-f]{64}$/);
  assert.ok(!String(h.rpcCalls[0].p_client_key).includes(USER_ID));
});

test('repeated requests from one account make one paid geo lookup and reuse the result', async () => {
  const h = endpoint();
  for (let i = 0; i < 4; i++) {
    assert.equal((await h.send([h.event])).status, 200);
  }
  assert.equal(h.geoLookups(), 1);
  assert.equal(h.stored.length, 4);
  assert.ok(h.stored.every((row) => row.geo_country_code === 'NP' && row.geo_city === 'Pokhara'));
});

test('a batch above the 500-event ceiling is refused outright', async () => {
  const h = endpoint();
  const response = await h.send(Array.from({ length: 501 }, () => h.event));
  assert.equal(response.status, 400);
  assert.equal(h.stored.length, 0);
});

test('an over-long geo value smuggled in event_properties cannot reach a bounded column', async () => {
  const h = endpoint();
  const body = await (
    await h.send([
      { ...h.event, event_properties: { geo_source: 'ipinfo', geo_city: 'y'.repeat(300) } },
      h.event,
    ])
  ).json();
  assert.equal(body.inserted, 1);
  assert.equal(body.rejected, 1);
});
