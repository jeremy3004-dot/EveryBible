import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

// Behaviour tests for the anonymous usage facade. The facade owns only the
// anonymous session_id lifecycle; the real usageQueue is loaded so what it
// actually enqueues (name + session_id) is asserted through real persistence.

// The queue schedules a 30s flush timer; faking setTimeout keeps this file
// deterministic and stops the timer holding the process open.
mock.timers.enable({ apis: ['setTimeout'] });

const mmkv = mockMmkvStorage(mock);
mockReactNative(mock, { os: 'ios' });

const supabase = createSupabaseFake();
const supabaseExports = {
  supabase: supabase.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => supabase.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

// The queue reads the signed-in uid through a lazy require() of the auth store.
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null }) },
});

// Geo enrichment has its own network + cache behaviour and its own tests.
mockModule(mock, sourcePath('services/analytics/geoContext.ts'), {
  getCachedGeoContext: () => null,
  resolveGeoContext: async () => null,
  attachGeoContext: <T extends object>(event: T) => event,
});

// `require('expo-constants')` resolves through CJS, where a mocked module's
// `default` key is unwrapped — hence the double nesting.
const requireFromHere = createRequire(import.meta.url);
mockModule(mock, requireFromHere.resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '4.5.6' } } },
});

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnonymousUsageAnalytics = typeof import('./anonymousUsageAnalytics');
let anonymous: AnonymousUsageAnalytics;

const persisted = (): Array<Record<string, unknown>> =>
  JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? '[]');

/** Every queued event as [name, session_id], in the order it was enqueued. */
const queued = (): Array<[string, unknown]> =>
  persisted().map((event) => [String(event.event_name), event.session_id]);

/** Empty the queue by delivering everything successfully. */
async function drain(): Promise<void> {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  for (
    let attempt = 0;
    attempt < 12 && anonymous.getPendingAnonymousUsageEventCount() > 0;
    attempt += 1
  ) {
    await anonymous.flushAnonymousUsageEvents();
  }
  assert.equal(anonymous.getPendingAnonymousUsageEventCount(), 0, 'drain() left events behind');
}

before(async () => {
  anonymous = await import('./anonymousUsageAnalytics');
});

beforeEach(() => {
  supabase.reset();
});

// Both the module-level session id and the shared queue survive a test, so each
// test hands the next one a cleared context and an empty queue.
afterEach(async () => {
  anonymous.clearAnonymousSessionContext();
  await drain();
});

after(() => {
  mock.timers.reset();
});

// ── unauthenticated session lifecycle ──────────────────────────────────────

test('starting a session mints an id and queues exactly one session_started for it', () => {
  const sessionId = anonymous.startAnonymousUsageSession();

  assert.match(sessionId, UUID_PATTERN);
  assert.equal(anonymous.getCurrentAnonymousUsageSessionId(), sessionId);
  assert.deepEqual(queued(), [['session_started', sessionId]]);
});

test('starting an already-started session does not queue a second session_started', () => {
  const sessionId = anonymous.startAnonymousUsageSession();

  assert.equal(anonymous.startAnonymousUsageSession(), sessionId);
  assert.deepEqual(queued(), [['session_started', sessionId]]);
});

test('ending a session queues session_ended for it and clears the id', () => {
  const sessionId = anonymous.startAnonymousUsageSession();

  anonymous.endAnonymousUsageSession();

  assert.equal(anonymous.getCurrentAnonymousUsageSessionId(), null);
  assert.deepEqual(queued(), [
    ['session_started', sessionId],
    ['session_ended', sessionId],
  ]);
});

test('ending a session that was never started queues nothing', () => {
  anonymous.endAnonymousUsageSession();

  assert.deepEqual(queued(), []);
});

test('ending an already-ended session queues nothing more', () => {
  anonymous.startAnonymousUsageSession();
  anonymous.endAnonymousUsageSession();

  anonymous.endAnonymousUsageSession();

  assert.equal(queued().filter(([name]) => name === 'session_ended').length, 1);
});

// ── event tracking ─────────────────────────────────────────────────────────

test('a tracked event is queued with its properties and the current session id', () => {
  const sessionId = anonymous.startAnonymousUsageSession();

  anonymous.trackAnonymousUsageEvent('audio_completed', { chapter: 3 });

  const event = persisted()[1];
  assert.equal(event.event_name, 'audio_completed');
  assert.equal(event.session_id, sessionId);
  assert.deepEqual(event.event_properties, { chapter: 3, analytics_schema_version: 2 });
});

test('a tracked event with no properties still queues', () => {
  anonymous.startAnonymousUsageSession();

  anonymous.trackAnonymousUsageEvent('reading_ended');

  assert.equal(persisted()[1].event_name, 'reading_ended');
});

// A background audio tick fires after App.tsx already ended the session. It must
// carry a session id, but must never originate a second session_started — that
// would leave an unpaired lifecycle event and inflate session counts.
test('a background tick after the session ended carries a fresh id without a new session_started', () => {
  const foregroundId = anonymous.startAnonymousUsageSession();
  anonymous.endAnonymousUsageSession();

  anonymous.trackAnonymousUsageEvent('audio_playback_progress', { position_seconds: 42 });

  const tickSessionId = anonymous.getCurrentAnonymousUsageSessionId();
  assert.match(String(tickSessionId), UUID_PATTERN);
  assert.notEqual(tickSessionId, foregroundId);
  assert.deepEqual(queued(), [
    ['session_started', foregroundId],
    ['session_ended', foregroundId],
    ['audio_playback_progress', tickSessionId],
  ]);
});

test('the next foreground after a background tick emits one paired session for the tick id', () => {
  anonymous.startAnonymousUsageSession();
  anonymous.endAnonymousUsageSession();
  anonymous.trackAnonymousUsageEvent('audio_playback_progress', { listened_ms: 30_000 });

  const nextId = anonymous.startAnonymousUsageSession();
  anonymous.endAnonymousUsageSession();

  assert.equal(queued().filter(([name]) => name === 'session_started').length, 2);
  assert.equal(queued().filter(([name]) => name === 'session_ended').length, 2);
  assert.deepEqual(queued().at(-1), ['session_ended', nextId]);
});

// ── authenticated path: id context only, no lifecycle events ───────────────

test('establishing the session id context for a signed-in reader queues nothing', () => {
  const sessionId = anonymous.initAnonymousSessionContext();

  assert.match(sessionId, UUID_PATTERN);
  assert.equal(anonymous.getCurrentAnonymousUsageSessionId(), sessionId);
  assert.deepEqual(queued(), []);
});

test('an existing session id context is reused rather than replaced', () => {
  const sessionId = anonymous.initAnonymousSessionContext();

  assert.equal(anonymous.initAnonymousSessionContext(), sessionId);
});

test('clearing the session id context queues no session_ended', () => {
  anonymous.initAnonymousSessionContext();

  anonymous.clearAnonymousSessionContext();

  assert.equal(anonymous.getCurrentAnonymousUsageSessionId(), null);
  assert.deepEqual(queued(), []);
});

test('the anonymous facade never emits session_started on the authenticated path', () => {
  anonymous.initAnonymousSessionContext();
  anonymous.clearAnonymousSessionContext();

  anonymous.trackAnonymousUsageEvent('audio_playback_progress');

  assert.deepEqual(
    queued().map(([name]) => name),
    ['audio_playback_progress']
  );
});

test('a cleared context lets the next foreground start emit its own session_started', () => {
  anonymous.initAnonymousSessionContext();
  anonymous.clearAnonymousSessionContext();

  const sessionId = anonymous.startAnonymousUsageSession();

  assert.deepEqual(queued(), [['session_started', sessionId]]);
});

// ── queue delegation ───────────────────────────────────────────────────────

test('the pending count reports the shared queue depth', () => {
  anonymous.startAnonymousUsageSession();
  anonymous.trackAnonymousUsageEvent('reading_ended');

  assert.equal(anonymous.getPendingAnonymousUsageEventCount(), 2);
});

test('flushing delivers the queued events through the shared queue and empties it', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  anonymous.startAnonymousUsageSession();

  const result = await anonymous.flushAnonymousUsageEvents();

  assert.deepEqual(result, { success: true });
  assert.equal(anonymous.getPendingAnonymousUsageEventCount(), 0);
  assert.equal(supabase.functionCalls.length, 1);
});
