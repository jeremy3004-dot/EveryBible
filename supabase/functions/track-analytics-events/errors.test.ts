import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadEdgeFunction,
  type EdgeHarnessOptions,
  type EdgeQueryCall,
  type EdgeQueryResult,
} from '../_testing/edgeFunctionHarness';

// Audit 2026-09-24 L7: this endpoint runs with verify_jwt = false, so anyone can reach the
// token check, and signed-in callers must not see database internals either.
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DB_DETAIL =
  'insert or update on table "analytics_events" violates foreign key constraint "analytics_events_user_id_fkey"';

const event = {
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
  geo_timezone: 'Asia/Kathmandu',
};

// The ingest limiter admits the request; an unanswered limiter now refuses writes.
const ADMITTED = {
  data: [{ allowed: true, retry_after_seconds: 0, cached_geo: null, claim_geo_lookup: false }],
};
const admitted =
  (respond: (call: EdgeQueryCall) => EdgeQueryResult = () => ({})) =>
  (call: EdgeQueryCall): EdgeQueryResult =>
    call.table === 'rpc:consume_analytics_ingest_budget' ? ADMITTED : respond(call);

const send = (options: EdgeHarnessOptions) => {
  const harness = loadEdgeFunction(ENTRY, options);
  const response = harness.handle(
    new Request('https://functions.example/track-analytics-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify({ events: [event] }),
    })
  );
  return { harness, response };
};

const signedIn: EdgeHarnessOptions['getUser'] = () => ({
  data: { user: { id: USER_ID } },
  error: null,
});

test('a failed insert returns a generic error and logs the database detail', async () => {
  const { harness, response } = send({
    getUser: signedIn,
    respond: admitted(() => ({ error: { code: '23503', message: DB_DETAIL } })),
  });

  const result = await response;

  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), /analytics_events|foreign key|constraint/);
  assert.ok(harness.loggedErrors.some((line) => line.includes(DB_DETAIL)));
});

test('a rejected token is refused without echoing the auth server message', async () => {
  const { response } = send({
    getUser: () => ({
      data: { user: null },
      error: { message: 'invalid JWT: unable to parse or verify signature, token is malformed' },
    }),
  });

  const result = await response;

  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { success: false, error: 'Unauthorized' });
});

test('a stored batch still reports how many events were inserted', async () => {
  const { response } = send({ getUser: signedIn, respond: admitted() });

  const result = await response;
  const body = await result.json();

  assert.equal(result.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inserted, 1);
});
