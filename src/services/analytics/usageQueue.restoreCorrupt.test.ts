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

// Restore is a once-per-process path, so the unreadable-blob case needs its own
// module cache. See usageQueue.restore.test.ts for the mixed-validity blob.

mock.timers.enable({ apis: ['setTimeout'] });

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';

const mmkv = mockMmkvStorage(mock, { [QUEUE_CACHE_KEY]: '{ this is not json' });
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

before(async () => {
  queue = await import('./usageQueue');
});

after(() => {
  mock.timers.reset();
});

test('an unreadable persisted blob restores nothing instead of throwing', () => {
  assert.equal(queue.getPendingUsageEventCount(), 0);
});

test('the queue still accepts and delivers events after a corrupt restore', async () => {
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  queue.enqueueUsageEvent('reading_started', {}, null);

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true });
  assert.equal(queue.getPendingUsageEventCount(), 0);
  assert.equal(mmkv.store.has(QUEUE_CACHE_KEY), false);
});
