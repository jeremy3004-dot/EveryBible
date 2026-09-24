import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, type EdgeHarnessOptions } from '../_testing/edgeFunctionHarness';

// Request handling edge cases, the IP geo provider fallbacks and payload-geo filtering of the
// signed-in analytics endpoint. handler.test.ts covers the main contract with a stateful
// database; this file uses the harness's recording client so writes can be inspected directly.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'valid-user-token';

type Row = Record<string, unknown>;
type BudgetRow = { allowed: boolean; cached_geo?: unknown; claim_geo_lookup?: boolean };

const baseEvent = () => ({
  event_name: 'reading_ended',
  event_properties: { duration_seconds: 30 },
  device_platform: 'android',
  app_version: '1.0.9',
  session_id: 'session',
  queued_at: new Date().toISOString(),
});

/** Every geo field the endpoint needs, so no request geo is resolved for this event. */
const completeGeo = {
  geo_country_code: 'IN',
  geo_latitude: 19.0761,
  geo_longitude: 72.8775,
  geo_source: 'cf-worker',
  geo_timezone: 'Asia/Kolkata',
};

function endpoint(
  options: {
    env?: EdgeHarnessOptions['env'];
    budget?: BudgetRow;
    lookup?: (url: URL) => Response | Promise<Response>;
    failInsert?: boolean;
  } = {}
) {
  const lookups: URL[] = [];
  const verified: string[] = [];
  const harness = loadEdgeFunction(ENTRY, {
    env: { IPINFO_TOKEN: 'ipinfo-token', ...options.env },
    getUser: (token) => {
      verified.push(token);
      return token === TOKEN
        ? { data: { user: { id: USER_ID } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } };
    },
    respond: (call) => {
      if (call.table === 'rpc:consume_analytics_ingest_budget') {
        return { data: [options.budget ?? { allowed: true, claim_geo_lookup: true }] };
      }
      if (call.table === 'analytics_events' && options.failInsert) {
        throw new Error('connection terminated');
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
        (call) => (call.steps.find((step) => step.method === 'insert')?.args[0] as Row[]) ?? []
      );
  const budgetCharges = () =>
    harness.calls.filter((call) => call.table === 'rpc:consume_analytics_ingest_budget');
  const post = (body: string, headers: Record<string, string> = {}) =>
    harness.handle(
      new Request('https://collector.example', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.7',
          'cf-ipcountry': 'GB',
          authorization: `Bearer ${TOKEN}`,
          ...headers,
        },
        body,
      })
    );
  return {
    harness,
    lookups,
    verified,
    rows,
    budgetCharges,
    post,
    send: (events: unknown[], headers?: Record<string, string>) =>
      post(JSON.stringify({ events }), headers),
  };
}

// ── transport and auth ──────────────────────────────────────────────────────

test('a CORS preflight is answered without creating a database client', async () => {
  const h = endpoint();
  const response = await h.harness.handle(
    new Request('https://collector.example', { method: 'OPTIONS' })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'retry-after');
  assert.equal(h.harness.clientsCreated.length, 0);
});

test('a request with no or an empty Authorization header is refused before Auth is asked', async () => {
  const h = endpoint();
  for (const authorization of [undefined, '   ']) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authorization !== undefined) headers.authorization = authorization;
    const response = await h.harness.handle(
      new Request('https://collector.example', {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: [baseEvent()] }),
      })
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, error: 'Missing auth token' });
  }
  assert.deepEqual(h.verified, []);
  assert.deepEqual(h.rows(), []);
});

test('a token sent without the Bearer prefix is verified as-is', async () => {
  const h = endpoint();
  const response = await h.send([{ ...baseEvent(), ...completeGeo }], {
    authorization: ` ${TOKEN} `,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(h.verified, [TOKEN]);
  assert.equal(h.rows()[0]?.user_id, USER_ID);
});

test('events are always attributed to the verified user, never a user named in the payload', async () => {
  const h = endpoint();
  await h.send([
    { ...baseEvent(), ...completeGeo, user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  ]);
  assert.equal(h.rows()[0]?.user_id, USER_ID);
});

// ── body handling ───────────────────────────────────────────────────────────

test('a body that is not JSON is treated as an empty batch and nothing is charged', async () => {
  const h = endpoint();
  const response = await h.post('{ events: [');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, inserted: 0, geo: null });
  assert.equal(h.budgetCharges().length, 0);
});

test('a body without an events array, or with an empty one, stores nothing', async () => {
  const h = endpoint();
  for (const body of ['null', '{}', '{"events":"many"}', '{"events":[]}']) {
    const response = await h.post(body);
    assert.equal(response.status, 200, body);
    assert.equal((await response.json()).inserted, 0, body);
  }
  assert.deepEqual(h.rows(), []);
  assert.equal(h.budgetCharges().length, 0);
});

test('a batch whose every event is dropped is acknowledged without a write or lookup', async () => {
  const h = endpoint({ lookup: () => Response.json({ country: 'NP' }) });
  const response = await h.send(['text', null, ['array'], { ...baseEvent(), queued_at: 'never' }]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, inserted: 0, rejected: 4, geo: null });
  assert.deepEqual(h.rows(), []);
  assert.equal(h.lookups.length, 0);
  const charged = h.budgetCharges()[0]?.steps[0]?.args[0] as Row | undefined;
  assert.equal(charged?.p_event_count, 0, 'the request still counts against the budget');
});

test('non-object event properties are stored as an empty bag', async () => {
  const h = endpoint();
  await h.send([
    { ...baseEvent(), ...completeGeo, event_properties: ['a'] },
    { ...baseEvent(), ...completeGeo, event_properties: null },
  ]);
  assert.deepEqual(
    h.rows().map((row) => row.event_properties),
    [{}, {}]
  );
});

// ── payload geo ─────────────────────────────────────────────────────────────

test('payload geo from an untrusted source such as GPS is ignored in favour of request geo', async () => {
  const h = endpoint({ lookup: () => Response.json({ country: 'NP', loc: '28.2096,83.9856' }) });
  await h.send([
    { ...baseEvent(), ...completeGeo, geo_source: 'gps' },
    { ...baseEvent(), event_properties: { geo_source: 'device', geo_city: 'Home' } },
  ]);
  for (const row of h.rows()) {
    assert.deepEqual(
      [row.geo_country_code, row.geo_latitude, row.geo_longitude, row.geo_source, row.geo_city],
      ['NP', 28.2, 84, 'ipinfo', null]
    );
  }
});

test('geo carried only inside event_properties is used when complete', async () => {
  const h = endpoint();
  await h.send([
    {
      ...baseEvent(),
      event_properties: {
        geo_country_code: 'ke',
        geo_latitude: '-1.2921',
        geo_longitude: '36.8219',
        geo_source: 'cf-worker',
        geo_timezone: ' Africa/Nairobi ',
        geo_accuracy_km: 25,
        geo_city: 'Nairobi',
        geo_region_name: 'Nairobi County',
        geo_region_code: 'nb',
      },
    },
  ]);
  const row = h.rows()[0];
  assert.equal(h.lookups.length, 0);
  assert.deepEqual(
    [
      row?.geo_country_code,
      row?.geo_latitude,
      row?.geo_longitude,
      row?.geo_source,
      row?.geo_timezone,
      row?.geo_city,
      row?.geo_region_name,
      row?.geo_region_code,
      row?.geo_accuracy_km,
    ],
    ['KE', -1.3, 36.8, 'cf-worker', 'Africa/Nairobi', 'Nairobi', 'Nairobi County', 'NB', null]
  );
});

test('unusable payload coordinates never become a map point', async () => {
  const h = endpoint();
  await h.send([
    { ...baseEvent(), ...completeGeo, geo_latitude: 95, geo_longitude: 72.8775 },
    { ...baseEvent(), ...completeGeo, geo_latitude: 19.07, geo_longitude: 'east' },
  ]);
  const rows = h.rows();
  assert.deepEqual(
    rows.map((row) => [row.geo_latitude, row.geo_longitude]),
    [
      [null, null],
      [null, null],
    ]
  );
});

test('a payload accuracy radius is never stored because IP geo has no measured radius', async () => {
  const h = endpoint();
  await h.send([
    { ...baseEvent(), ...completeGeo, geo_accuracy_km: 3 },
    { ...baseEvent(), ...completeGeo, geo_accuracy_km: '-1' },
    { ...baseEvent(), ...completeGeo, geo_accuracy_km: ' 12 ' },
  ]);
  assert.ok(h.rows().every((row) => row.geo_accuracy_km === null));
});

// ── request geo fallbacks ───────────────────────────────────────────────────

test('an ipinfo failure falls back to the free ipapi lookup', async () => {
  const h = endpoint({
    lookup: (url) =>
      url.hostname === 'ipinfo.io'
        ? new Response('quota exceeded', { status: 403 })
        : Response.json({
            country_code: 'np',
            latitude: 27.7172,
            longitude: 85.324,
            region: 'Bagmati',
            region_code: 'p3',
          }),
  });
  const body = await (await h.send([baseEvent()])).json();
  assert.deepEqual(
    h.lookups.map((url) => url.hostname),
    ['ipinfo.io', 'ipapi.co']
  );
  assert.deepEqual([body.geo, body.geo_source], ['NP', 'ipapi']);
  const row = h.rows()[0];
  assert.deepEqual(
    [row?.geo_latitude, row?.geo_longitude, row?.geo_region_name, row?.geo_region_code],
    [27.7, 85.3, 'Bagmati', 'P3']
  );
});

test('lookup answers without a country take the Cloudflare country', async () => {
  const cases: Array<[string, (url: URL) => Response]> = [
    ['ipinfo', () => Response.json({ loc: 'not,numbers', city: 'Somewhere' })],
    [
      'ipapi',
      (url) =>
        url.hostname === 'ipinfo.io'
          ? new Response('not json')
          : Response.json({ latitude: 'n/a', city: 'Somewhere' }),
    ],
  ];
  for (const [source, lookup] of cases) {
    const h = endpoint({ lookup });
    await h.send([baseEvent()]);
    const row = h.rows()[0];
    assert.deepEqual(
      [row?.geo_country_code, row?.geo_source, row?.geo_latitude, row?.geo_longitude],
      ['GB', source, null, null],
      source
    );
  }
});

test('when every lookup fails the Cloudflare country is stored on its own', async () => {
  const answers: Array<(url: URL) => Response> = [
    () => Response.json({ error: true }),
    () => new Response('down', { status: 502 }),
    () => {
      throw new TypeError('fetch failed');
    },
  ];
  for (const lookup of answers) {
    const h = endpoint({ env: { IPINFO_TOKEN: undefined }, lookup });
    const body = await (await h.send([baseEvent()])).json();
    assert.deepEqual([body.geo, body.geo_source], ['GB', 'cf_ipcountry']);
    assert.equal(
      h.harness.calls.some((call) => call.table === 'analytics_ingest_throttle'),
      false,
      'a failed lookup is not remembered'
    );
  }
});

test('with no client address and no usable Cloudflare country the event has no geo', async () => {
  const h = endpoint({ lookup: () => Response.json({ country: 'NP' }) });
  await h.send([baseEvent()], { 'cf-connecting-ip': '', 'cf-ipcountry': 'T1' });
  assert.equal(h.lookups.length, 0);
  const row = h.rows()[0];
  assert.deepEqual([row?.geo_country_code, row?.geo_source], [null, null]);
});

test('a key that did not claim the lookup gets the Cloudflare country without spending one', async () => {
  const h = endpoint({
    budget: { allowed: true, claim_geo_lookup: false },
    lookup: () => Response.json({ country: 'NP' }),
  });
  await h.send([baseEvent()]);
  assert.equal(h.lookups.length, 0);
  assert.equal(h.rows()[0]?.geo_source, 'cf_ipcountry');
});

test('a cached lookup is used without a request and filled with the Cloudflare country', async () => {
  const h = endpoint({
    budget: {
      allowed: true,
      cached_geo: { latitude: '28.2096', longitude: 83.9856, source: 'ipinfo', city: 'Pokhara' },
    },
    lookup: () => Response.json({ country: 'NP' }),
  });
  await h.send([baseEvent()]);
  assert.equal(h.lookups.length, 0);
  const row = h.rows()[0];
  assert.deepEqual(
    [row?.geo_country_code, row?.geo_latitude, row?.geo_longitude, row?.geo_city, row?.geo_source],
    ['GB', 28.2, 84, 'Pokhara', 'ipinfo']
  );
});

// ── failures ────────────────────────────────────────────────────────────────

test('an unexpected failure while writing returns a generic 500 and logs the detail', async () => {
  const h = endpoint({ failInsert: true });
  const response = await h.send([{ ...baseEvent(), ...completeGeo }]);
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.doesNotMatch(text, /connection terminated/);
  assert.ok(h.harness.loggedErrors.some((line) => line.includes('connection terminated')));
});
