import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// Audit 2026-09-24 L7: the anonymous collector has no authentication at all, so database
// details go to the function log only.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const DB_DETAIL =
  'new row for relation "analytics_events" violates check constraint "analytics_events_event_name_check"';

const event = {
  event_id: 'd2631107-1dbb-42a9-8a91-4de37dbe7201',
  event_name: 'reading_ended',
  event_properties: { duration_seconds: 30 },
  device_platform: 'ios',
  app_version: '1.0.8',
  session_id: 'session',
  queued_at: new Date().toISOString(),
  geo_country_code: 'NP',
  geo_latitude: 28.2,
  geo_longitude: 83.9,
  geo_source: 'cf-worker',
};

// The ingest limiter admits the request; an unanswered limiter now refuses writes.
const ADMITTED = {
  data: [{ allowed: true, retry_after_seconds: 0, cached_geo: null, claim_geo_lookup: false }],
};
const admitted =
  (respond: (call: EdgeQueryCall) => EdgeQueryResult = () => ({})) =>
  (call: EdgeQueryCall): EdgeQueryResult =>
    call.table === 'rpc:consume_analytics_ingest_budget' ? ADMITTED : respond(call);

const send = (harness: ReturnType<typeof loadEdgeFunction>, body: unknown) =>
  harness.handle(
    new Request('https://functions.example/track-anonymous-usage-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
      body: JSON.stringify(body),
    })
  );

test('a failed write returns a generic error and logs the database detail', async () => {
  const harness = loadEdgeFunction(ENTRY, {
    respond: admitted(() => ({ error: { code: '23514', message: DB_DETAIL } })),
  });

  const response = await send(harness, { events: [event] });
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.doesNotMatch(text, /analytics_events|constraint|relation/);
  assert.ok(harness.loggedErrors.some((line) => line.includes(DB_DETAIL)));
});

test('missing collector configuration is not described to the caller', async () => {
  const harness = loadEdgeFunction(ENTRY, { env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });

  const response = await send(harness, { events: [event] });

  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /Supabase credentials|environment/i);
  assert.ok(harness.loggedErrors.length > 0);
});

test('a successful write still reports what was stored', async () => {
  const harness = loadEdgeFunction(ENTRY, { respond: admitted() });

  const response = await send(harness, { events: [event] });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.inserted, 1);
});
