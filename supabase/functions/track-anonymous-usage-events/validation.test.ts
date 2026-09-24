import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeHarnessOptions } from '../_testing/edgeFunctionHarness';

// Request validation, the IP geo provider chain, and optional-auth edge cases of the anonymous
// collector. collector.test.ts covers the main ingestion contract with a stateful database;
// this file uses the harness's recording client so every write and lookup can be inspected.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));

type Row = Record<string, unknown>;
type BudgetRow = {
  allowed: boolean;
  retry_after_seconds?: number;
  cached_geo?: unknown;
  claim_geo_lookup?: boolean;
};

const jwt = (payload: Record<string, unknown>) =>
  `header.${btoa(JSON.stringify(payload))}.signature`;

const baseEvent = () => ({
  event_id: 'd2631107-1dbb-42a9-8a91-4de37dbe7201',
  event_name: 'reading_ended',
  event_properties: { duration_seconds: 30 },
  device_platform: 'ios',
  app_version: '1.0.8',
  session_id: 'session',
  queued_at: new Date().toISOString(),
});

/** An event with no event-time geo, so the collector resolves geo from the request. */
const needsRequestGeo = baseEvent;

function collector(
  options: {
    env?: EdgeHarnessOptions['env'];
    budget?: BudgetRow;
    lookup?: (url: URL) => Response | Promise<Response>;
    getUser?: EdgeHarnessOptions['getUser'];
    failWrite?: boolean;
  } = {}
) {
  const lookups: URL[] = [];
  const harness = loadEdgeFunction(ENTRY, {
    env: { IPINFO_TOKEN: 'ipinfo-token', ...options.env },
    getUser: options.getUser,
    respond: (call) => {
      if (call.table === 'rpc:consume_analytics_ingest_budget') {
        return { data: [options.budget ?? { allowed: true, claim_geo_lookup: true }] };
      }
      if (call.table === 'analytics_events' && options.failWrite) {
        throw new Error('socket hang up');
      }
      return { data: null, error: null };
    },
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      lookups.push(url);
      if (!options.lookup) throw new Error('no geo provider reachable');
      return options.lookup(url);
    }) as typeof fetch,
  });
  const rows = (): Row[] =>
    harness.calls
      .filter((call) => call.table === 'analytics_events')
      .flatMap(
        (call) => (call.steps.find((step) => step.method === 'upsert')?.args[0] as Row[]) ?? []
      );
  const rememberedGeo = (): unknown[] =>
    harness.calls
      .filter((call) => call.table === 'analytics_ingest_throttle')
      .map((call) => (call.steps.find((step) => step.method === 'update')?.args[0] as Row)?.geo);
  const budgetCharges = () =>
    harness.calls.filter((call) => call.table === 'rpc:consume_analytics_ingest_budget').length;
  const post = (body: string, headers: Record<string, string> = {}) =>
    harness.handle(
      new Request('https://collector.example', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.1',
          'cf-ipcountry': 'GB',
          ...headers,
        },
        body,
      })
    );
  return {
    harness,
    lookups,
    rows,
    rememberedGeo,
    budgetCharges,
    post,
    send: (events: unknown[], headers?: Record<string, string>) =>
      post(JSON.stringify({ events }), headers),
  };
}

const geoColumns = (row: Row | undefined) => ({
  country: row?.geo_country_code,
  latitude: row?.geo_latitude,
  longitude: row?.geo_longitude,
  city: row?.geo_city,
  region: row?.geo_region_name,
  regionCode: row?.geo_region_code,
  timezone: row?.geo_timezone,
  source: row?.geo_source,
});

// ── transport ───────────────────────────────────────────────────────────────

test('a CORS preflight is answered and exposes Retry-After to the app', async () => {
  const h = collector();
  const response = await h.harness.handle(
    new Request('https://collector.example', { method: 'OPTIONS' })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'retry-after');
  assert.equal(h.harness.clientsCreated.length, 0);
});

test('a GET or HEAD health probe reports the service without touching the database', async () => {
  const h = collector();
  for (const method of ['GET', 'HEAD']) {
    const response = await h.harness.handle(new Request('https://collector.example', { method }));
    assert.equal(response.status, 200);
    if (method === 'GET') {
      assert.deepEqual(await response.json(), {
        ok: true,
        service: 'track-anonymous-usage-events',
      });
    }
  }
  assert.equal(h.harness.clientsCreated.length, 0);
});

test('methods other than POST are refused', async () => {
  const h = collector();
  const response = await h.harness.handle(
    new Request('https://collector.example', { method: 'PUT', body: '{}' })
  );
  assert.equal(response.status, 405);
});

// ── batch validation ────────────────────────────────────────────────────────

test('a body that is not JSON is rejected before the budget is charged', async () => {
  const h = collector();
  const response = await h.post('{ events: [');
  assert.equal(response.status, 400);
  assert.equal(h.budgetCharges(), 0);
});

test('a body without a non-empty events array is rejected', async () => {
  const h = collector();
  for (const body of ['null', '"events"', '{}', '{"events":{}}', '{"events":[]}']) {
    assert.equal((await h.post(body)).status, 400, body);
  }
  assert.equal(h.budgetCharges(), 0);
  assert.deepEqual(h.rows(), []);
});

test('one non-object entry rejects the whole batch', async () => {
  const h = collector();
  assert.equal((await h.send([baseEvent(), 'reading_ended'])).status, 400);
  assert.deepEqual(h.rows(), []);
});

test('an event missing a required field rejects the whole batch', async () => {
  const h = collector();
  for (const field of ['event_name', 'device_platform', 'app_version', 'queued_at'] as const) {
    const response = await h.send([{ ...baseEvent(), [field]: '   ' }]);
    assert.equal(response.status, 400, field);
  }
  assert.deepEqual(h.rows(), []);
});

test('an event id that is not a v4 UUID rejects the batch so ids cannot be chosen freely', async () => {
  const h = collector();
  const response = await h.send([{ ...baseEvent(), event_id: '1; drop table analytics_events' }]);
  assert.equal(response.status, 400);
  assert.deepEqual(h.rows(), []);
});

test('non-object event properties are stored as an empty bag', async () => {
  const h = collector();
  await h.send([
    { ...baseEvent(), event_properties: ['a', 'b'] },
    { ...baseEvent(), event_id: undefined, event_properties: 'text' },
  ]);
  assert.deepEqual(
    h.rows().map((row) => row.event_properties),
    [{}, {}]
  );
});

test('an event without an id is given a fresh server id', async () => {
  const h = collector();
  const { event_id: _id, ...legacy } = baseEvent();
  await h.send([legacy]);
  assert.match(String(h.rows()[0]?.id), /^[0-9a-f-]{36}$/);
});

test('a blank or missing session id is stored as null; a real one is trimmed', async () => {
  const h = collector();
  await h.send([
    { ...baseEvent(), session_id: '   ' },
    { ...baseEvent(), event_id: undefined, session_id: null },
    { ...baseEvent(), event_id: undefined, session_id: '  s-1  ' },
  ]);
  assert.deepEqual(
    h.rows().map((row) => row.session_id),
    [null, null, 's-1']
  );
});

test('a blank event-time identity is stored unattributed', async () => {
  const h = collector();
  await h.send([{ ...baseEvent(), attribution_user_id: '  ' }]);
  assert.equal(h.rows()[0]?.user_id, null);
});

// ── geo: provider chain ─────────────────────────────────────────────────────

test('ipinfo coordinates are parsed from its loc string, rounded, and remembered for the key', async () => {
  const h = collector({
    lookup: () =>
      Response.json({
        country: 'np',
        loc: '28.2096,83.9856',
        city: ' Pokhara ',
        region: 'Gandaki',
        timezone: 'Asia/Kathmandu',
      }),
  });

  const body = await (await h.send([needsRequestGeo()])).json();

  assert.equal(body.geo, 'NP');
  assert.equal(body.geo_source, 'ipinfo');
  assert.equal(h.lookups.length, 1);
  assert.equal(h.lookups[0].hostname, 'ipinfo.io');
  assert.equal(h.lookups[0].pathname, '/203.0.113.1/json');
  assert.equal(h.lookups[0].searchParams.get('token'), 'ipinfo-token');
  assert.deepEqual(geoColumns(h.rows()[0]), {
    country: 'NP',
    latitude: 28.2,
    longitude: 84,
    city: 'Pokhara',
    region: 'Gandaki',
    regionCode: null,
    timezone: 'Asia/Kathmandu',
    source: 'ipinfo',
  });
  assert.equal(h.rememberedGeo().length, 1);
  assert.equal((h.rememberedGeo()[0] as Row).countryCode, 'NP');
});

test('an ipinfo answer with an unusable loc keeps the country but no map point', async () => {
  const h = collector({ lookup: () => Response.json({ country: 'NP', loc: 'somewhere' }) });
  await h.send([needsRequestGeo()]);
  const row = h.rows()[0];
  assert.deepEqual(
    [row?.geo_country_code, row?.geo_latitude, row?.geo_longitude],
    ['NP', null, null]
  );
});

test('an ipinfo answer with no country falls back to the Cloudflare country header', async () => {
  const h = collector({ lookup: () => Response.json({ city: 'Somewhere' }) });
  await h.send([needsRequestGeo()]);
  assert.equal(h.rows()[0]?.geo_country_code, 'GB');
  assert.equal(h.rows()[0]?.geo_source, 'ipinfo');
});

test('when ipinfo fails the free ipapi lookup is used instead', async () => {
  const h = collector({
    lookup: (url) =>
      url.hostname === 'ipinfo.io'
        ? new Response('rate limited', { status: 429 })
        : Response.json({
            country_code: 'np',
            latitude: 28.2096,
            longitude: 83.9856,
            city: 'Pokhara',
            region: 'Gandaki',
            region_code: 'p4',
            timezone: 'Asia/Kathmandu',
          }),
  });

  await h.send([needsRequestGeo()]);

  assert.deepEqual(
    h.lookups.map((url) => url.hostname),
    ['ipinfo.io', 'ipapi.co']
  );
  assert.deepEqual(geoColumns(h.rows()[0]), {
    country: 'NP',
    latitude: 28.2,
    longitude: 84,
    city: 'Pokhara',
    region: 'Gandaki',
    regionCode: 'P4',
    timezone: 'Asia/Kathmandu',
    source: 'ipapi',
  });
});

test('without an ipinfo token only the free ipapi lookup is made', async () => {
  const h = collector({
    env: { IPINFO_TOKEN: '  ' },
    lookup: () => Response.json({ country_code: 'KE', latitude: '1.2', longitude: null }),
  });

  await h.send([needsRequestGeo()]);

  assert.deepEqual(
    h.lookups.map((url) => url.hostname),
    ['ipapi.co']
  );
  const row = h.rows()[0];
  assert.deepEqual(
    [row?.geo_country_code, row?.geo_latitude, row?.geo_longitude, row?.geo_region_code],
    ['KE', null, null, null]
  );
});

test('ipapi error payloads, bad JSON and failed responses all fall back to the Cloudflare country', async () => {
  const answers: Array<() => Response> = [
    () => Response.json({ error: true, reason: 'RateLimited' }),
    () => new Response('<html>', { status: 200 }),
    () => new Response('down', { status: 503 }),
  ];
  for (const answer of answers) {
    const h = collector({ env: { IPINFO_TOKEN: undefined }, lookup: answer });
    const body = await (await h.send([needsRequestGeo()])).json();
    assert.deepEqual([body.geo, body.geo_source], ['GB', 'cf_ipcountry']);
    assert.deepEqual(h.rememberedGeo(), [], 'a failed lookup is not cached');
  }
});

test('an ipinfo body that is not JSON falls through to ipapi', async () => {
  const h = collector({
    lookup: (url) =>
      url.hostname === 'ipinfo.io'
        ? new Response('not json')
        : Response.json({ country_code: 'NP' }),
  });
  await h.send([needsRequestGeo()]);
  assert.equal(h.rows()[0]?.geo_source, 'ipapi');
});

test('unreachable geo providers leave the Cloudflare country and never fail the write', async () => {
  const h = collector();
  const response = await h.send([needsRequestGeo()]);
  assert.equal(response.status, 200);
  assert.equal(h.lookups.length, 2, 'both providers were tried');
  assert.deepEqual(
    [h.rows()[0]?.geo_country_code, h.rows()[0]?.geo_source],
    ['GB', 'cf_ipcountry']
  );
});

test('with no Cloudflare country and no lookup the event is stored without geo', async () => {
  const h = collector();
  await h.send([needsRequestGeo()], { 'cf-ipcountry': 'XX' });
  assert.deepEqual([h.rows()[0]?.geo_country_code, h.rows()[0]?.geo_source], [null, null]);
});

test('a request with no client address makes no lookup at all', async () => {
  const h = collector({ lookup: () => Response.json({ country: 'NP' }) });
  await h.harness.handle(
    new Request('https://collector.example', {
      method: 'POST',
      body: JSON.stringify({ events: [needsRequestGeo()] }),
    })
  );
  assert.equal(h.lookups.length, 0);
  assert.equal(h.rows()[0]?.geo_country_code, null);
});

test('without the edge-stamped address only x-real-ip is looked up, never x-forwarded-for', async () => {
  const h = collector({ lookup: () => Response.json({ country: 'NP' }) });
  await h.send([needsRequestGeo()], {
    'cf-connecting-ip': ' ',
    'x-forwarded-for': '198.51.100.7 , 10.0.0.1',
  });
  await h.send([needsRequestGeo()], { 'cf-connecting-ip': '', 'x-real-ip': '192.0.2.44' });
  assert.deepEqual(
    h.lookups.map((url) => url.pathname),
    ['/192.0.2.44/json']
  );
  assert.deepEqual(
    h.rows().map((row) => row.geo_source),
    ['cf_ipcountry', 'ipinfo']
  );
});

test('a client key that is not the lookup claimant gets the Cloudflare country without a lookup', async () => {
  const h = collector({
    budget: { allowed: true, claim_geo_lookup: false },
    lookup: () => Response.json({ country: 'NP' }),
  });
  await h.send([needsRequestGeo()]);
  assert.equal(h.lookups.length, 0);
  assert.equal(h.rows()[0]?.geo_source, 'cf_ipcountry');
});

test('a cached lookup is re-normalised before use and its missing country comes from Cloudflare', async () => {
  const h = collector({
    budget: {
      allowed: true,
      cached_geo: {
        countryCode: 'zz9',
        latitude: 28.2096,
        longitude: 83.9856,
        source: 'ipinfo',
        city: 'Pokhara',
        region: '',
        regionCode: 'P4',
        timezone: 'Asia/Kathmandu',
      },
    },
    lookup: () => Response.json({ country: 'NP' }),
  });
  await h.send([needsRequestGeo()]);
  assert.equal(h.lookups.length, 0);
  assert.deepEqual(geoColumns(h.rows()[0]), {
    country: 'GB',
    latitude: 28.2,
    longitude: 84,
    city: 'Pokhara',
    region: null,
    regionCode: 'P4',
    timezone: 'Asia/Kathmandu',
    source: 'ipinfo',
  });
});

test('an event-time worker fix without a country takes the request geo instead', async () => {
  const h = collector({ lookup: () => Response.json({ country: 'KE', loc: '-1.29,36.82' }) });
  await h.send([
    { ...baseEvent(), geo_source: 'cf-worker', geo_accuracy_km: 25, geo_city: 'Pokhara' },
    {
      ...baseEvent(),
      event_id: undefined,
      geo_source: 'cf-worker',
      geo_accuracy_km: '-4',
      geo_timezone: 'Asia/Kathmandu',
    },
  ]);
  for (const row of h.rows()) {
    assert.deepEqual(
      [row.geo_country_code, row.geo_source, row.geo_city, row.geo_accuracy_km],
      ['KE', 'ipinfo', null, null]
    );
  }
});

test('no request geo is resolved when every event carries its own country fix', async () => {
  const h = collector({ lookup: () => Response.json({ country: 'KE' }) });
  const body = await (
    await h.send([
      {
        ...baseEvent(),
        geo_source: 'cf-worker',
        geo_country_code: 'NP',
        geo_region_code: 'p4',
        geo_accuracy_km: '12',
      },
    ])
  ).json();
  assert.equal(h.lookups.length, 0);
  assert.deepEqual([body.geo, body.geo_source], [null, null]);
  assert.deepEqual(
    [h.rows()[0]?.geo_country_code, h.rows()[0]?.geo_region_code, h.rows()[0]?.geo_source],
    ['NP', 'P4', 'cf-worker']
  );
});

// ── optional auth edge cases ────────────────────────────────────────────────

test('a user token sent without the Bearer prefix is still verified and attributed', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const token = jwt({ role: 'authenticated', sub: id });
  const verified: string[] = [];
  const h = collector({
    getUser: (candidate) => {
      verified.push(candidate);
      return { data: { user: candidate === token ? { id } : null }, error: null };
    },
  });
  const body = await (await h.send([baseEvent()], { authorization: `  ${token}  ` })).json();
  assert.deepEqual(verified, [token]);
  assert.equal(body.attributed, true);
  assert.equal(h.rows()[0]?.user_id, id);
});

test('tokens that are not user-shaped never reach Auth', async () => {
  const verified: string[] = [];
  const h = collector({
    getUser: (candidate) => {
      verified.push(candidate);
      return { data: { user: { id: 'should-not-be-used' } }, error: null };
    },
  });
  for (const token of [
    'Bearer ',
    'Bearer only.two',
    'Bearer header.%%%not-base64%%%.sig',
    `Bearer ${jwt({ role: 'authenticated', sub: '' })}`,
    `Bearer ${jwt({ role: 'authenticated', sub: 42 })}`,
  ]) {
    const response = await h.send([baseEvent()], { authorization: token });
    assert.equal(response.status, 200, token);
  }
  assert.deepEqual(verified, []);
  assert.ok(h.rows().every((row) => row.user_id === null));
});

test('an Auth outage during verification stores the events unattributed', async () => {
  const token = jwt({ role: 'authenticated', sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  const h = collector({
    getUser: () => {
      throw new Error('auth service unavailable');
    },
  });
  const response = await h.send([baseEvent()], { authorization: `Bearer ${token}` });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).attributed, false);
  assert.equal(h.rows()[0]?.user_id, null);
});

// ── failures ────────────────────────────────────────────────────────────────

test('an unexpected failure while writing returns a generic 500 and logs the detail', async () => {
  const h = collector({ failWrite: true });
  const response = await h.send([baseEvent()]);
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.doesNotMatch(text, /socket hang up/);
  assert.ok(h.harness.loggedErrors.some((line) => line.includes('socket hang up')));
});
