import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';
import { assertDefined } from '../../utils/assertDefined';

// Degraded-environment fallbacks: the app version stamped on each event (from
// expo-constants, legacy manifest, or a bundled default), an unreadable auth
// store, a failing disk write, and the reporting policy turning unsuitable
// mid-flush. The fakes are mutable so each fallback can be driven under this
// file's single mock configuration.

mock.timers.enable({ apis: ['setTimeout'] });

const QUEUE_CACHE_KEY = 'analytics-usage-queue-v1';

const mmkv = mockMmkvStorage(mock);
mockReactNative(mock, { os: 'android' });
let reportable = true;
let onReportingChange: (() => void) | null = null;
mockModule(mock, sourcePath('services/analytics/reportingPolicy.ts'), {
  canReportUsage: () => reportable,
  installReportingPolicy: (listener: () => void) => {
    onReportingChange = listener;
    return () => {
      onReportingChange = null;
    };
  },
});

const supabase = createSupabaseFake();
const supabaseExports = {
  supabase: supabase.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

let authStoreUnreadable = false;
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => {
      if (authStoreUnreadable) throw new Error('auth store not hydrated');
      return { user: { uid: 'reader-1' } };
    },
  },
});

mockModule(mock, sourcePath('services/analytics/geoContext.ts'), {
  getCachedGeoContext: () => null,
  resolveGeoContext: async () => null,
  attachGeoContext: <T extends object>(event: T) => event,
});

type ConstantsShape = {
  expoConfig?: { version?: string } | null;
  manifest?: { version?: string } | null;
};
let constantsState: ConstantsShape = {};
let constantsUnreadable = false;
const constants = {
  get expoConfig() {
    if (constantsUnreadable) throw new Error('native constants unavailable');
    return constantsState.expoConfig;
  },
  get manifest() {
    return constantsState.manifest;
  },
};

// `require('expo-constants')` resolves through CJS, where a mocked module's
// `default` key is unwrapped — hence the double nesting.
const requireFromHere = createRequire(import.meta.url);
mockModule(mock, requireFromHere.resolve('expo-constants'), {
  default: { default: constants },
});

type UsageQueue = typeof import('./usageQueue');
let queue: UsageQueue;

const lastPersistedVersion = (): unknown => {
  const events = JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? '[]') as Array<
    Record<string, unknown>
  >;
  return events.at(-1)?.app_version;
};

before(async () => {
  queue = await import('./usageQueue');
});

beforeEach(() => {
  constantsState = {};
  constantsUnreadable = false;
  authStoreUnreadable = false;
  reportable = true;
  supabase.reset();
});

after(() => {
  mock.timers.reset();
});

test('an event is stamped with the expo config version when one is available', () => {
  constantsState = { expoConfig: { version: '7.1.0' }, manifest: { version: '0.0.1' } };

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(lastPersistedVersion(), '7.1.0');
});

test('an event falls back to the legacy manifest version when expo config has none', () => {
  constantsState = { expoConfig: null, manifest: { version: '3.2.1' } };

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(lastPersistedVersion(), '3.2.1');
});

test('an event falls back to the bundled default version when neither source has one', () => {
  constantsState = { expoConfig: {}, manifest: null };

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(lastPersistedVersion(), '1.0.1');
});

test('unreadable native constants still queue the event with the bundled default version', () => {
  constantsUnreadable = true;
  const before = queue.getPendingUsageEventCount();

  queue.enqueueUsageEvent('reading_started', {}, null);

  assert.equal(queue.getPendingUsageEventCount(), before + 1);
  assert.equal(lastPersistedVersion(), '1.0.1');
});

test('an unreadable auth store queues the event unattributed rather than dropping it', () => {
  queue.enqueueUsageEvent('reading_started', {}, null);
  authStoreUnreadable = true;
  queue.enqueueUsageEvent('reading_started', {}, null);

  const events = JSON.parse(mmkv.store.get(QUEUE_CACHE_KEY) ?? '[]') as Array<
    Record<string, unknown>
  >;
  assert.equal(events.at(-1)?.attribution_user_id, null);
  assert.equal(events.at(-2)?.attribution_user_id, 'reader-1');
});

test('a failing disk write keeps the event in memory and it is still delivered', async () => {
  const writeToDisk = mmkv.mmkvInstance.set;
  mmkv.mmkvInstance.set = () => {
    throw new Error('disk full');
  };
  const onDisk = mmkv.store.get(QUEUE_CACHE_KEY);
  const pending = queue.getPendingUsageEventCount();
  try {
    queue.enqueueUsageEvent('chapter_completed', {}, null);
  } finally {
    mmkv.mmkvInstance.set = writeToDisk;
  }

  assert.equal(queue.getPendingUsageEventCount(), pending + 1);
  assert.equal(mmkv.store.get(QUEUE_CACHE_KEY), onDisk, 'the failed write left disk unchanged');

  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));
  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true });
  const [call] = supabase.functionCalls;
  const sent = (
    assertDefined(call, 'first function call').options as {
      body: { events: Array<Record<string, unknown>> };
    }
  ).body.events;
  assert.equal(sent.at(-1)?.event_name, 'chapter_completed');
  assert.equal(queue.getPendingUsageEventCount(), 0);
  assert.equal(mmkv.store.has(QUEUE_CACHE_KEY), false);
});

test('losing permission to report while the session is read defers delivery without sending', async () => {
  const pending = queue.getPendingUsageEventCount();
  queue.enqueueUsageEvent('reading_started', {}, null);
  supabase.auth.handlers.getSession = async () => {
    reportable = false;
    return { data: { session: null }, error: null };
  };

  const result = await queue.flushUsageQueue();

  assert.deepEqual(result, { success: true, deferred: true });
  assert.equal(supabase.functionCalls.length, 0);
  assert.equal(queue.getPendingUsageEventCount(), pending + 1);
});

test('a reporting-policy change to unsuitable cancels the pending flush timer', async () => {
  const stop = queue.installUsageQueueReporting();
  queue.enqueueUsageEvent('reading_started', {}, null);
  supabase.respondToFunction(() => ({ data: { ok: true }, error: null }));

  reportable = false;
  onReportingChange?.();
  // A second unsuitable notification finds no timer left to cancel.
  onReportingChange?.();
  reportable = true;
  mock.timers.tick(300_000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(supabase.functionCalls.length, 0, 'the cancelled timer never fired');
  assert.ok(queue.getPendingUsageEventCount() > 0);

  onReportingChange?.();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(supabase.functionCalls.length, 1, 'becoming suitable again flushes');
  assert.equal(queue.getPendingUsageEventCount(), 0);
  stop();
  assert.equal(onReportingChange, null);
});
