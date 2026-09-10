import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

// Behaviour tests for the authenticated analytics facade. The facade owns only
// the session id and the engagement queries; queueing and delivery belong to
// usageQueue, which is loaded for real here so the seam between them is
// exercised rather than mocked. The existing analyticsService.test.ts checks
// source shape and stays as it is.

// The queue schedules a 30s flush timer; faking setTimeout keeps this file
// deterministic and stops the timer holding the process open.
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
const NOT_CONFIGURED = 'EveryBible backend is not configured for this build yet.';

type AnalyticsService = typeof import('./analyticsService');
let analytics: AnalyticsService;

const originalGetUser = supabase.auth.handlers.getUser;

const persisted = (): Array<Record<string, unknown>> =>
  JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? '[]');

/** Names of the events currently sitting in the shared queue, in order. */
const queuedNames = (): string[] => persisted().map((event) => String(event.event_name));

/** Empty the queue by delivering everything successfully. */
async function drain(): Promise<void> {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  for (let attempt = 0; attempt < 12 && analytics.getPendingEventCount() > 0; attempt += 1) {
    await analytics.flushEvents();
  }
  assert.equal(analytics.getPendingEventCount(), 0, 'drain() left events behind');
}

before(async () => {
  analytics = await import('./analyticsService');
});

beforeEach(() => {
  supabase.reset();
  supabase.auth.handlers.getUser = originalGetUser;
  supabase.auth.setSession(null);
  supabaseConfigured = true;
});

// Module-level session state and the shared queue both survive a test, so each
// test hands the next one a signed-out, empty facade.
afterEach(async () => {
  analytics.endSession();
  await drain();
});

after(() => {
  mock.timers.reset();
});

// ── session lifecycle ──────────────────────────────────────────────────────

test('no session is current until one is started', () => {
  assert.equal(analytics.getCurrentSessionId(), null);
});

test('starting a session generates a v4 session id', () => {
  analytics.startSession();

  assert.match(String(analytics.getCurrentSessionId()), UUID_PATTERN);
});

test('starting a session honours an explicitly supplied id', () => {
  analytics.startSession('session-provided');

  assert.equal(analytics.getCurrentSessionId(), 'session-provided');
});

test('starting a session queues a session_started event', () => {
  analytics.startSession('session-1');

  assert.deepEqual(queuedNames(), ['session_started']);
});

test('the session_started event carries the new session id', () => {
  analytics.startSession('session-1');

  assert.equal(persisted()[0].session_id, 'session-1');
});

test('starting a second session replaces the current id', () => {
  analytics.startSession('session-1');

  analytics.startSession('session-2');

  assert.equal(analytics.getCurrentSessionId(), 'session-2');
  assert.deepEqual(queuedNames(), ['session_started', 'session_started']);
});

test('ending a session queues a session_ended event and clears the id', () => {
  analytics.startSession('session-1');

  analytics.endSession();

  assert.deepEqual(queuedNames(), ['session_started', 'session_ended']);
  assert.equal(analytics.getCurrentSessionId(), null);
});

test('the session_ended event is still tagged with the session that ended', () => {
  analytics.startSession('session-1');

  analytics.endSession();

  assert.equal(persisted()[1].session_id, 'session-1');
});

test('ending a session that was never started queues nothing', () => {
  analytics.endSession();

  assert.deepEqual(queuedNames(), []);
});

test('ending an already-ended session queues nothing more', () => {
  analytics.startSession('session-1');
  analytics.endSession();

  analytics.endSession();

  assert.deepEqual(queuedNames(), ['session_started', 'session_ended']);
});

// ── trackEvent ─────────────────────────────────────────────────────────────

test('a tracked event reaches the shared queue with its name and properties', () => {
  analytics.trackEvent('chapter_opened', { book: 'GEN', chapter: 1 });

  const [event] = persisted();
  assert.equal(event.event_name, 'chapter_opened');
  assert.deepEqual(event.event_properties, {
    book: 'GEN',
    chapter: 1,
    analytics_schema_version: 2,
  });
});

test('a tracked event with no properties still queues', () => {
  analytics.trackEvent('chapter_opened');

  assert.deepEqual(persisted()[0].event_properties, { analytics_schema_version: 2 });
});

test('an event tracked outside a session carries a null session id', () => {
  analytics.trackEvent('chapter_opened');

  assert.equal(persisted()[0].session_id, null);
});

test('an event tracked during a session is tagged with the current session id', () => {
  analytics.startSession('session-1');

  analytics.trackEvent('chapter_opened');

  assert.equal(persisted()[1].session_id, 'session-1');
});

test('an event tracked after the session ended is untagged again', () => {
  analytics.startSession('session-1');
  analytics.endSession();

  analytics.trackEvent('chapter_opened');

  assert.equal(persisted()[2].session_id, null);
});

test('the pending count reports the shared queue depth', () => {
  analytics.trackEvent('a');
  analytics.trackEvent('b');

  assert.equal(analytics.getPendingEventCount(), 2);
});

// ── flushEvents ────────────────────────────────────────────────────────────

test('flushing delivers the queued events and empties the queue', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  analytics.trackEvent('chapter_opened');

  const result = await analytics.flushEvents();

  assert.deepEqual(result, { success: true });
  assert.equal(analytics.getPendingEventCount(), 0);
  assert.equal(supabase.functionCalls.length, 1);
});

test('flushing an empty queue succeeds without calling the backend', async () => {
  const result = await analytics.flushEvents();

  assert.deepEqual(result, { success: true });
  assert.equal(supabase.functionCalls.length, 0);
});

test('a failed flush reports the delivery error and keeps the events', async () => {
  supabase.respondToFunction(() => ({
    error: { message: 'Bad payload', context: { status: 400 } } as never,
  }));
  analytics.trackEvent('chapter_opened');

  const result = await analytics.flushEvents();

  assert.deepEqual(result, { success: false, error: 'Bad payload' });
});

// ── getEngagementSummary ───────────────────────────────────────────────────

test('the engagement summary is unavailable when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: NOT_CONFIGURED });
  assert.equal(supabase.calls.length, 0);
});

test('an auth failure while reading the engagement summary is surfaced', async () => {
  supabase.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: { message: 'Auth session missing' },
  });

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: 'Auth session missing' });
});

test('a signed-out reader is told to sign in for engagement data', async () => {
  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, {
    success: false,
    error: 'You must be signed in to view engagement data',
  });
  assert.equal(supabase.calls.length, 0);
});

test('the engagement summary is read for the signed-in user only', async () => {
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-77' }) }));
  supabase.respondTo('user_engagement_summary', () => ({ data: { user_id: 'user-77' } }));

  await analytics.getEngagementSummary();

  const [call] = supabase.callsFor('user_engagement_summary');
  assert.equal(call.operation, 'select');
  assert.equal(call.columns, '*');
  assert.equal(call.maybeSingle, true);
  assert.deepEqual(call.steps.find((step) => step.method === 'eq')?.args, ['user_id', 'user-77']);
});

test('the engagement summary row is returned to the caller', async () => {
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-77' }) }));
  const row = { user_id: 'user-77', total_events: 42 };
  supabase.respondTo('user_engagement_summary', () => ({ data: row }));

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: true, data: row as never });
});

test('a query error while reading the engagement summary is surfaced', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondTo('user_engagement_summary', () => ({
    data: null,
    error: { message: 'permission denied' },
  }));

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: 'permission denied' });
});

test('a reader with no summary row yet gets a clear not-found result', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondTo('user_engagement_summary', () => ({ data: null }));

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: 'No engagement summary found' });
});

test('a thrown Error while reading the engagement summary is reported, not propagated', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondTo('user_engagement_summary', () => {
    throw new Error('network unreachable');
  });

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: 'network unreachable' });
});

test('a non-Error thrown while reading the engagement summary reports an unknown error', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondTo('user_engagement_summary', () => {
    throw 'boom';
  });

  const result = await analytics.getEngagementSummary();

  assert.deepEqual(result, { success: false, error: 'Unknown error' });
});

// ── refreshEngagement ──────────────────────────────────────────────────────

test('engagement cannot be refreshed when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: false, error: NOT_CONFIGURED });
  assert.equal(supabase.calls.length, 0);
});

test('an auth failure while refreshing engagement is surfaced', async () => {
  supabase.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: { message: 'Auth session missing' },
  });

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: false, error: 'Auth session missing' });
});

test('a signed-out reader is told to sign in before refreshing engagement', async () => {
  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, {
    success: false,
    error: 'You must be signed in to refresh engagement data',
  });
  assert.equal(supabase.calls.length, 0);
});

test('refreshing engagement calls the server-side recompute function', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondToRpc('refresh_my_engagement', () => ({ data: null }));

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: true });
  assert.equal(supabase.callsFor('rpc:refresh_my_engagement').length, 1);
});

test('an rpc error while refreshing engagement is surfaced', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondToRpc('refresh_my_engagement', () => ({
    error: { message: 'function does not exist' },
  }));

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: false, error: 'function does not exist' });
});

test('a thrown Error while refreshing engagement is reported, not propagated', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondToRpc('refresh_my_engagement', () => {
    throw new Error('network unreachable');
  });

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: false, error: 'network unreachable' });
});

test('a non-Error thrown while refreshing engagement reports an unknown error', async () => {
  supabase.auth.setSession(makeFakeSession());
  supabase.respondToRpc('refresh_my_engagement', () => {
    throw 'boom';
  });

  const result = await analytics.refreshEngagement();

  assert.deepEqual(result, { success: false, error: 'Unknown error' });
});
