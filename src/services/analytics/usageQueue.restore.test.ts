import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

// Restore-from-disk is a once-per-process path (the queue restores lazily on
// first use), so it needs its own module cache and therefore its own file.
// This file seeds one blob mixing sound and unusable entries and asserts what
// survives; usageQueue.restoreCorrupt.test.ts covers an unreadable blob.

mock.timers.enable({ apis: ['setTimeout'] });

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const soundEvent = (overrides: Record<string, unknown> = {}) => ({
  event_id: '11111111-1111-4111-8111-111111111111',
  attribution_user_id: 'user-1',
  event_name: 'reading_started',
  event_properties: { analytics_schema_version: 2 },
  session_id: 'session-1',
  device_platform: 'ios',
  app_version: '1.0.1',
  queued_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const SEEDED = [
  soundEvent({ event_name: 'kept_intact' }),
  // Written by an older app version that used a non-uuid id.
  soundEvent({ event_name: 'kept_reidentified', event_id: 'legacy-7' }),
  // A blob written before attribution existed.
  (() => {
    const event = soundEvent({ event_name: 'kept_unattributed' }) as Record<string, unknown>;
    delete event.attribution_user_id;
    return event;
  })(),
  soundEvent({ event_name: undefined }),
  soundEvent({ event_name: 'dropped_blank_version', app_version: '   ' }),
  soundEvent({ event_name: 'dropped_bad_timestamp', queued_at: 'not-a-date' }),
  soundEvent({ event_name: 'dropped_numeric_platform', device_platform: 3 }),
  null,
  'not an event at all',
];

mockMmkvStorage(mock, { [QUEUE_CACHE_KEY]: JSON.stringify(SEEDED) });
mockReactNative(mock, { os: 'ios' });

const supabase = createSupabaseFake();
const supabaseExports = {
  supabase: supabase.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null }) },
});

mockModule(mock, sourcePath('services/analytics/geoContext.ts'), {
  getCachedGeoContext: () => null,
  resolveGeoContext: async () => null,
  attachGeoContext: <T extends object>(event: T) => event,
});

const requireFromHere = createRequire(import.meta.url);
mockModule(mock, requireFromHere.resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '4.5.6' } } },
});

type UsageQueue = typeof import('./usageQueue');
let queue: UsageQueue;
/** The batch the queue offered for delivery, i.e. exactly what it restored. */
let restored: Array<Record<string, unknown>> = [];

before(async () => {
  queue = await import('./usageQueue');
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  await queue.flushUsageQueue();
  restored = (
    supabase.functionCalls[0].options as { body: { events: Array<Record<string, unknown>> } }
  ).body.events;
});

after(() => {
  mock.timers.reset();
});

test('events persisted before a force-kill are restored on first use', () => {
  assert.deepEqual(
    restored.map((event) => event.event_name),
    ['kept_intact', 'kept_reidentified', 'kept_unattributed']
  );
});

test('a restored event keeps the fields it was persisted with', () => {
  assert.deepEqual(restored[0], soundEvent({ event_name: 'kept_intact' }));
});

test('a restored event whose id is not a v4 uuid is given a fresh one', () => {
  assert.match(String(restored[1].event_id), UUID_PATTERN);
  assert.notEqual(restored[1].event_id, 'legacy-7');
});

test('a restored event written before attribution existed reads as unattributed', () => {
  assert.equal(restored[2].attribution_user_id, null);
});

test('persisted entries missing a server-required field are dropped, not retried forever', () => {
  const names = restored.map((event) => event.event_name);

  assert.equal(names.includes(undefined), false);
  assert.equal(names.includes('dropped_blank_version'), false);
  assert.equal(names.includes('dropped_bad_timestamp'), false);
  assert.equal(names.includes('dropped_numeric_platform'), false);
});

test('non-object entries in the persisted blob are ignored', () => {
  assert.equal(restored.length, 3);
});

test('the restored queue is delivered and then empty', () => {
  assert.equal(queue.getPendingUsageEventCount(), 0);
});
