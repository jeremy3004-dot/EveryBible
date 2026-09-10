import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession } from '../../testing/supabaseFake';

// Behaviour tests that load the real queue through the loader. The existing
// usageQueue.test.ts (source shape) and usageQueueDelivery.test.ts (vm harness)
// stay as they are. Restore-from-disk paths need their own module cache and live
// in usageQueue.restore*.test.ts.

// setTimeout is faked so the queue's 30s flush timer is deterministic and does
// not hold the process open after the file finishes.
mock.timers.enable({ apis: ['setTimeout'] });

const mmkv = mockMmkvStorage(mock);
mockReactNative(mock, { os: 'ios' });

const supabase = createSupabaseFake();
/** Mutable so the "backend not configured" branch can be driven in-file. */
let supabaseConfigured = true;
const supabaseExports = {
  supabase: supabase.client,
  isSupabaseConfigured: () => supabaseConfigured,
  getCurrentUserId: async () => supabase.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

// The queue reads the signed-in uid through a lazy require() of the auth store.
let currentUid: string | null = null;
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: currentUid ? { uid: currentUid } : null }) },
});

// Geo resolution is a separate module with its own network + cache behaviour;
// stub it so this file stays hermetic and can drive both enrichment branches.
type Geo = Record<string, string | number | null>;
let cachedGeo: Geo | null = null;
let resolvedGeo: Geo | null = null;
mockModule(mock, sourcePath('services/analytics/geoContext.ts'), {
  getCachedGeoContext: () => cachedGeo,
  resolveGeoContext: async () => resolvedGeo,
  attachGeoContext: <T extends object>(event: T, geo: Geo | null) =>
    geo ? { ...event, ...geo } : event,
});

// `require('expo-constants')` resolves through CJS, where a mocked module's
// `default` key is unwrapped — hence the double nesting.
const requireFromHere = createRequire(import.meta.url);
mockModule(mock, requireFromHere.resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '4.5.6' } } },
});

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UsageQueue = typeof import('./usageQueue');
let queue: UsageQueue;

const persisted = (): Array<Record<string, unknown>> =>
  JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? '[]');

const sentBatches = () =>
  supabase.functionCalls.map(
    (call) => (call.options as { body: { events: Array<Record<string, unknown>> } }).body.events
  );

/** Lets a flush kicked off by a fake timer settle. setImmediate is not faked. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Empty the queue by delivering everything successfully. */
async function drain(): Promise<void> {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  for (let attempt = 0; attempt < 12 && queue.getPendingUsageEventCount() > 0; attempt += 1) {
    await queue.flushUsageQueue();
  }
  assert.equal(queue.getPendingUsageEventCount(), 0, 'drain() left events behind');
}

/** Put retryDelayMs back to its 30s baseline after a failure test. */
async function resetBackoff(): Promise<void> {
  queue.enqueueUsageEvent('backoff_reset', {}, null);
  await drain();
}

before(async () => {
  queue = await import('./usageQueue');
});

beforeEach(() => {
  supabase.reset();
  supabase.auth.setSession(null);
  currentUid = null;
  cachedGeo = null;
  resolvedGeo = null;
  supabaseConfigured = true;
});

after(() => {
  mock.timers.reset();
});

// ── enqueue ────────────────────────────────────────────────────────────────

test('an enqueued event carries the name, properties and schema version', async () => {
  queue.enqueueUsageEvent('reading_started', { book: 'GEN' }, 'session-1');

  const [event] = persisted();
  assert.equal(event.event_name, 'reading_started');
  assert.deepEqual(event.event_properties, { book: 'GEN', analytics_schema_version: 2 });
  assert.equal(event.session_id, 'session-1');
  await drain();
});

test('an enqueued event records the device platform and app version', async () => {
  queue.enqueueUsageEvent('reading_started', {}, null);

  const [event] = persisted();
  assert.equal(event.device_platform, 'ios');
  assert.equal(event.app_version, '4.5.6');
  await drain();
});

test('an enqueued event gets a v4 event id and an ISO queue timestamp', async () => {
  queue.enqueueUsageEvent('reading_started', {}, null);

  const [event] = persisted();
  assert.match(String(event.event_id), UUID_PATTERN);
  assert.equal(new Date(String(event.queued_at)).toISOString(), event.queued_at);
  await drain();
});

test('a signed-out event is attributed to no user', async () => {
  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(persisted()[0].attribution_user_id, null);
  await drain();
});

test('an event captures the signed-in uid at enqueue time', async () => {
  currentUid = 'user-77';

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(persisted()[0].attribution_user_id, 'user-77');
  await drain();
});

test('the pending count tracks what has been queued but not delivered', async () => {
  queue.enqueueUsageEvent('a', {}, null);
  queue.enqueueUsageEvent('b', {}, null);

  assert.equal(queue.getPendingUsageEventCount(), 2);
  await drain();
});

test('every queued event is written through to disk in order', async () => {
  queue.enqueueUsageEvent('first', {}, null);
  queue.enqueueUsageEvent('second', {}, null);

  assert.deepEqual(
    persisted().map((event) => event.event_name),
    ['first', 'second']
  );
  await drain();
});

test('cached geo is attached at enqueue time so an offline event keeps its own location', async () => {
  cachedGeo = { geo_source: 'cf-worker', geo_country_code: 'NP' };

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(persisted()[0].geo_country_code, 'NP');
  await drain();
});

// ── auto-flush and scheduling ──────────────────────────────────────────────

test('a low-volume session schedules delivery instead of flushing immediately', async () => {
  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(supabase.functionCalls.length, 0);
  assert.equal(queue.getPendingUsageEventCount(), 1);
  await drain();
});

test('the scheduled timer delivers the queue 30 seconds later', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  mock.timers.tick(30_000);
  await settle();

  assert.equal(supabase.functionCalls.length, 1);
  assert.equal(queue.getPendingUsageEventCount(), 0);
});

test('the twentieth event flushes the queue without waiting for the timer', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));

  for (let index = 0; index < 20; index += 1) {
    queue.enqueueUsageEvent(`event-${index}`, {}, null);
  }
  await settle();

  assert.equal(supabase.functionCalls.length, 1);
  assert.equal(sentBatches()[0].length, 20);
});

// ── delivery ───────────────────────────────────────────────────────────────

test('a flush posts the batch to the single unified ingestion endpoint', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, 'session-1');

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true });
  assert.equal(supabase.functionCalls[0].name, queue.UNIFIED_USAGE_ENDPOINT);
  assert.equal(sentBatches()[0][0].event_name, 'reading_started');
});

test('a signed-out flush sends no Authorization header', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  const options = supabase.functionCalls[0].options as { headers?: unknown };
  assert.equal(options.headers, undefined);
});

test('a signed-in flush attaches the access token so the server can attribute the events', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  supabase.auth.setSession(makeFakeSession({ access_token: 'token-abc' }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  const options = supabase.functionCalls[0].options as { headers?: Record<string, string> };
  assert.deepEqual(options.headers, { Authorization: 'Bearer token-abc' });
});

test('a whitespace-only access token is treated as no token at all', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  supabase.auth.setSession(makeFakeSession({ access_token: '   ' }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  const options = supabase.functionCalls[0].options as { headers?: unknown };
  assert.equal(options.headers, undefined);
});

test('a delivered batch is removed from the queue and from disk', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  assert.equal(queue.getPendingUsageEventCount(), 0);
  assert.equal(mmkv.store.has(QUEUE_CACHE_KEY), false);
});

test('flushing an empty queue succeeds without calling the backend', async () => {
  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true });
  assert.equal(supabase.functionCalls.length, 0);
});

test('a flush with the backend unconfigured succeeds locally and keeps the events', async () => {
  queue.enqueueUsageEvent('reading_started', {}, null);
  supabaseConfigured = false;

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true });
  assert.equal(supabase.functionCalls.length, 0);
  assert.equal(queue.getPendingUsageEventCount(), 1);

  supabaseConfigured = true;
  await drain();
});

test('a batch is capped at 100 events, leaving the rest queued', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  for (let index = 0; index < 150; index += 1) {
    queue.enqueueUsageEvent(`event-${index}`, {}, null);
  }
  await settle();

  // The 20-event auto-flush already sent a capped batch; every batch is bounded.
  assert.ok(sentBatches().every((batch) => batch.length <= 100));
  await drain();
});

test('events arriving during delivery are not dropped when the batch is acknowledged', async () => {
  let acknowledge!: () => void;
  supabase.respondToFunction(
    () =>
      new Promise((resolve) => {
        acknowledge = () => resolve({ data: { ok: true }, error: null });
      })
  );
  queue.enqueueUsageEvent('in-flight', {}, null);
  const flushing = queue.flushUsageQueue();
  await settle();

  queue.enqueueUsageEvent('arrived-late', {}, null);
  acknowledge();
  await flushing;

  assert.equal(queue.getPendingUsageEventCount(), 1);
  assert.equal(persisted()[0].event_name, 'arrived-late');
  await drain();
});

test('concurrent flushes share one in-flight request', async () => {
  let acknowledge!: () => void;
  supabase.respondToFunction(
    () =>
      new Promise((resolve) => {
        acknowledge = () => resolve({ data: { ok: true }, error: null });
      })
  );
  queue.enqueueUsageEvent('reading_started', {}, null);

  const first = queue.flushUsageQueue();
  const second = queue.flushUsageQueue();
  await settle();
  acknowledge();

  assert.deepEqual(await first, await second);
  assert.equal(supabase.functionCalls.length, 1);
});

// ── geo enrichment at delivery ─────────────────────────────────────────────

test('an event queued without geo is enriched from the upload network', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, null);
  resolvedGeo = { geo_source: 'cf-worker', geo_country_code: 'GB' };

  await queue.flushUsageQueue();

  assert.equal(sentBatches()[0][0].geo_country_code, 'GB');
});

test('an event that already captured geo keeps it rather than taking the upload network', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  cachedGeo = { geo_source: 'cf-worker', geo_country_code: 'NP' };
  queue.enqueueUsageEvent('reading_started', {}, null);
  resolvedGeo = { geo_source: 'cf-worker', geo_country_code: 'GB' };

  await queue.flushUsageQueue();

  assert.equal(sentBatches()[0][0].geo_country_code, 'NP');
});

// ── failure handling ───────────────────────────────────────────────────────

test('a transient failure keeps the events queued and reports the error', async () => {
  supabase.respondToFunction(() => ({
    error: { message: 'Rate limit', context: { status: 429 } } as never,
  }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: false, error: 'Rate limit' });
  assert.equal(queue.getPendingUsageEventCount(), 1);
  assert.equal(persisted().length, 1);
  await resetBackoff();
});

test('a retried event keeps its original event id so the collector can dedupe', async () => {
  supabase.respondToFunction(() => ({ error: { message: 'Offline' } as never }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();
  const firstId = sentBatches()[0][0].event_id;
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  await queue.flushUsageQueue();

  assert.equal(sentBatches()[1][0].event_id, firstId);
  await resetBackoff();
});

test('a 400 rejection drops the malformed batch instead of retrying it forever', async () => {
  supabase.respondToFunction(() => ({
    error: { message: 'Bad payload', context: { status: 400 } } as never,
  }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  const result = await queue.flushUsageQueue();

  assert.equal(result.success, false);
  assert.equal(queue.getPendingUsageEventCount(), 0);
  await resetBackoff();
});

test('a 422 rejection also drops the batch', async () => {
  supabase.respondToFunction(() => ({
    error: { message: 'Unprocessable', context: { status: 422 } } as never,
  }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  assert.equal(queue.getPendingUsageEventCount(), 0);
  await resetBackoff();
});

test('a 500 from the collector is retryable and keeps the batch', async () => {
  supabase.respondToFunction(() => ({
    error: { message: 'Bad gateway', context: { status: 502 } } as never,
  }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  await queue.flushUsageQueue();

  assert.equal(queue.getPendingUsageEventCount(), 1);
  await resetBackoff();
});

test('a failure with no message at all still reports a delivery error', async () => {
  supabase.respondToFunction(() => ({ error: {} as never }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: false, error: 'Analytics delivery failed' });
  await resetBackoff();
});

test('a thrown Error surfaces its message to the caller', async () => {
  supabase.respondToFunction(() => {
    throw new Error('network unreachable');
  });
  queue.enqueueUsageEvent('reading_started', {}, null);

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: false, error: 'network unreachable' });
  await resetBackoff();
});

test('a failed flush backs off to a 60 second retry before trying again', async () => {
  supabase.respondToFunction(() => ({ error: { message: 'Offline' } as never }));
  queue.enqueueUsageEvent('reading_started', {}, null);
  await queue.flushUsageQueue();
  const attemptsAfterFailure = supabase.functionCalls.length;

  mock.timers.tick(59_999);
  await settle();
  assert.equal(supabase.functionCalls.length, attemptsAfterFailure, 'retried too early');

  mock.timers.tick(1);
  await settle();
  assert.equal(supabase.functionCalls.length, attemptsAfterFailure + 1);

  await resetBackoff();
});

test('while backed off, reaching the auto-flush size no longer flushes immediately', async () => {
  supabase.respondToFunction(() => ({ error: { message: 'Offline' } as never }));
  queue.enqueueUsageEvent('reading_started', {}, null);
  await queue.flushUsageQueue();
  const attemptsAfterFailure = supabase.functionCalls.length;

  for (let index = 0; index < 25; index += 1) {
    queue.enqueueUsageEvent(`event-${index}`, {}, null);
  }
  await settle();

  assert.equal(supabase.functionCalls.length, attemptsAfterFailure);
  await resetBackoff();
});

test('repeated failures cap the retry delay at five minutes', async () => {
  supabase.respondToFunction(() => ({ error: { message: 'Offline' } as never }));
  queue.enqueueUsageEvent('reading_started', {}, null);
  // 30s doubling: 60, 120, 240, 480 -> clamped to 300_000.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await queue.flushUsageQueue();
  }
  const attempts = supabase.functionCalls.length;

  mock.timers.tick(299_999);
  await settle();
  assert.equal(supabase.functionCalls.length, attempts, 'retried before the cap');

  mock.timers.tick(1);
  await settle();
  assert.equal(supabase.functionCalls.length, attempts + 1);

  await resetBackoff();
});

// ── bounded queue ──────────────────────────────────────────────────────────

test('the queue stops growing at 500 events and keeps the oldest pending work', async () => {
  for (let index = 0; index < 520; index += 1) {
    queue.enqueueUsageEvent(`event-${index}`, {}, null);
  }
  await settle();

  assert.ok(queue.getPendingUsageEventCount() <= 500);
  await drain();
});

test('an event arriving at a full queue is dropped rather than evicting queued work', async () => {
  supabase.respondToFunction(() => ({ error: { message: 'Offline' } as never }));
  for (let index = 0; index < 500; index += 1) {
    queue.enqueueUsageEvent(`event-${index}`, {}, null);
  }
  await settle();
  const depth = queue.getPendingUsageEventCount();

  queue.enqueueUsageEvent('overflow', {}, null);

  assert.equal(queue.getPendingUsageEventCount(), depth);
  assert.equal(
    persisted().some((event) => event.event_name === 'overflow'),
    false
  );
  assert.equal(persisted()[0].event_name, 'event-0', 'the oldest event must survive');
  await drain();
  await resetBackoff();
});

// ── generateUUID ───────────────────────────────────────────────────────────

test('generateUUID uses the platform crypto when it offers randomUUID', () => {
  const first = queue.generateUUID();
  const second = queue.generateUUID();

  assert.match(first, UUID_PATTERN);
  assert.notEqual(first, second);
});

test('generateUUID falls back to a Math.random v4 when crypto.randomUUID is missing', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const generated = queue.generateUUID();

    assert.match(generated, UUID_PATTERN);
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  }
});
