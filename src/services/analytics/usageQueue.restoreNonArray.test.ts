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

// Restore is a once-per-process path, so a blob that parses as JSON but is not
// an event list (e.g. written by another schema) needs its own module cache.
// See usageQueue.restoreCorrupt.test.ts for the unparseable blob.

mock.timers.enable({ apis: ['setTimeout'] });

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';

const mmkv = mockMmkvStorage(mock, {
  [QUEUE_CACHE_KEY]: JSON.stringify({ event_name: 'not-a-list', queued_at: '2026-01-01' }),
});
mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/analytics/reportingPolicy.ts'), {
  canReportUsage: () => true,
  installReportingPolicy: () => () => {},
});

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

before(async () => {
  queue = await import('./usageQueue');
});

after(() => {
  mock.timers.reset();
});

test('a persisted blob that is not an event list restores nothing', () => {
  assert.equal(queue.getPendingUsageEventCount(), 0);
});

test('the next queued event replaces the foreign blob on disk', () => {
  queue.enqueueUsageEvent('reading_started', {}, null);

  const persisted = JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? 'null') as Array<
    Record<string, unknown>
  >;
  assert.ok(Array.isArray(persisted));
  assert.deepEqual(
    persisted.map((event) => event.event_name),
    ['reading_started']
  );
});
