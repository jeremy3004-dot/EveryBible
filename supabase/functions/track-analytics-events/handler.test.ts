import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction } from '../_testing/edgeFunctionHarness';

// Behaviour of the signed-in analytics endpoint, with a stateful stand-in for the database
// (auth, the ingest-budget RPC and its geo cache, and analytics_events) and for the geo APIs.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

type BudgetMode = 'normal' | 'over';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DAY = 24 * 60 * 60 * 1000;

function endpoint(
  options: { budgetMode?: BudgetMode; env?: Record<string, string | undefined> } = {}
) {
  const budgetMode = options.budgetMode ?? 'normal';
  const stored: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<Record<string, unknown>> = [];
  const throttle = new Map<string, { claimed: boolean; geo: unknown }>();
  const geoRequests: string[] = [];

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

  const harness = loadEdgeFunction(ENTRY, {
    env: { IPINFO_TOKEN: 'ipinfo-token', ...options.env },
    client,
    fetch: (async (input: string | URL) => {
      const url = String(input);
      geoRequests.push(url);
      if (url.startsWith('https://ipinfo.io/')) {
        return Response.json({
          country: 'NP',
          loc: '28.2096,83.9856',
          city: 'Pokhara',
          timezone: 'Asia/Kathmandu',
        });
      }
      return Response.json({
        country_code: 'NP',
        latitude: 27.7172,
        longitude: 85.324,
        city: 'Kathmandu',
        timezone: 'Asia/Kathmandu',
      });
    }) as typeof fetch,
  });

  const event = {
    event_name: 'reading_ended',
    event_properties: { duration_seconds: 30 },
    device_platform: 'ios',
    app_version: '1.0.9',
    session_id: 'session',
    queued_at: new Date().toISOString(),
  };
  const defaultHeaders = { 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'NP' };
  const request = (body: string, token = 'valid-user-token', headers = defaultHeaders) =>
    new Request('https://collector.example', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        authorization: `Bearer ${token}`,
      },
      body,
    });
  return {
    stored,
    rpcCalls,
    event,
    geoLookups: () => geoRequests.length,
    geoRequests,
    send: (events: unknown[], token?: string, headers?: Record<string, string>) =>
      harness.handle(request(JSON.stringify({ events }), token, headers)),
    sendRaw: (body: string) => harness.handle(request(body)),
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
  const h = endpoint({ budgetMode: 'over' });
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

test('without Cloudflare, the first x-forwarded-for address is looked up via ipinfo', async () => {
  const h = endpoint();
  await h.send([h.event], undefined, { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' });
  assert.deepEqual(h.geoRequests, ['https://ipinfo.io/198.51.100.4/json?token=ipinfo-token']);
  assert.equal(h.stored[0].geo_city, 'Pokhara');
  assert.equal(h.stored[0].geo_source, 'ipinfo');
});

test('x-real-ip is used when no other client address header is present', async () => {
  const h = endpoint();
  await h.send([h.event], undefined, { 'x-real-ip': '198.51.100.9' });
  assert.deepEqual(h.geoRequests, ['https://ipinfo.io/198.51.100.9/json?token=ipinfo-token']);
});

test('without an ipinfo token the free ipapi lookup is used', async () => {
  const h = endpoint({ env: { IPINFO_TOKEN: undefined } });
  await h.send([h.event]);
  assert.deepEqual(h.geoRequests, ['https://ipapi.co/203.0.113.7/json/']);
  assert.equal(h.stored[0].geo_source, 'ipapi');
  assert.equal(h.stored[0].geo_city, 'Kathmandu');
  assert.equal(h.stored[0].geo_latitude, 27.7);
  assert.equal(h.stored[0].geo_longitude, 85.3);
});

test('complete payload geo is stored as sent and no request geo lookup is made', async () => {
  const h = endpoint();
  const body = await (
    await h.send([
      {
        ...h.event,
        geo_country_code: 'in',
        geo_latitude: 19.0761,
        geo_longitude: 72.8775,
        geo_source: 'cf-worker',
        geo_timezone: 'Asia/Kolkata',
      },
    ])
  ).json();
  assert.equal(h.geoLookups(), 0);
  assert.deepEqual(
    {
      country: h.stored[0].geo_country_code,
      latitude: h.stored[0].geo_latitude,
      longitude: h.stored[0].geo_longitude,
      source: h.stored[0].geo_source,
      timezone: h.stored[0].geo_timezone,
    },
    {
      country: 'IN',
      latitude: 19.1,
      longitude: 72.9,
      source: 'cf-worker',
      timezone: 'Asia/Kolkata',
    }
  );
  assert.equal(body.geo, 'IN');
});

test('partial payload geo wins field by field and request geo fills the gaps', async () => {
  const h = endpoint();
  await h.send([
    { ...h.event, geo_country_code: 'IN' },
    { ...h.event, event_properties: { geo_latitude_bucket: 10.04, geo_longitude_bucket: 20.06 } },
  ]);
  assert.equal(h.geoLookups(), 1);
  assert.equal(h.stored[0].geo_country_code, 'IN');
  assert.equal(h.stored[0].geo_latitude, 28.2);
  assert.equal(h.stored[0].geo_city, 'Pokhara');
  assert.equal(h.stored[1].geo_country_code, 'NP');
  assert.equal(h.stored[1].geo_latitude, 10);
  assert.equal(h.stored[1].geo_longitude, 20.1);
});
