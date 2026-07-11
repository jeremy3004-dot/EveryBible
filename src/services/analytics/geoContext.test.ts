import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import {
  __resetGeoContextForTests,
  primeGeoContext,
  resolveGeoContext,
} from './geoContext';

const GEO_WORKER_URL = 'https://everybible-geo.example.workers.dev';

const GEO_CACHE_KEY = 'analytics-geo-cache-v1';

// geoContext.ts lazily does `require('../../stores/mmkvStorage')` (which pulls in
// react-native-mmkv, unavailable under node --test). To exercise the disk cache
// path we seed require.cache for that module with an in-memory fake keyed to the
// same absolute path geoContext resolves to. Returns the backing store + a
// cleanup fn so the fake never leaks into the other (persistence-free) tests.
function installFakeMmkv(seed?: string): {
  store: Map<string, string>;
  restore: () => void;
} {
  const target = require.resolve(
    path.join(process.cwd(), 'src/stores/mmkvStorage')
  );
  const store = new Map<string, string>();
  if (seed !== undefined) {
    store.set(GEO_CACHE_KEY, seed);
  }
  const previous = require.cache[target];
  require.cache[target] = {
    id: target,
    filename: target,
    loaded: true,
    exports: {
      mmkvInstance: {
        getString: (name: string) => store.get(name),
        set: (name: string, value: string) => store.set(name, value),
      },
    },
  } as unknown as NodeModule;
  return {
    store,
    restore: () => {
      if (previous) {
        require.cache[target] = previous;
      } else {
        delete require.cache[target];
      }
    },
  };
}

const WORKER_PAYLOAD = {
  country_code: 'NP',
  latitude: 28.2096,
  longitude: 83.9856,
  timezone: 'Asia/Kathmandu',
  city: 'Pokhara',
  region: 'Gandaki',
  region_code: 'p4',
};

const EXPECTED_GEO = {
  geo_accuracy_km: null,
  geo_country_code: 'NP',
  geo_latitude: 28.2096,
  geo_longitude: 83.9856,
  geo_source: 'cf-worker',
  geo_timezone: 'Asia/Kathmandu',
  geo_city: 'Pokhara',
  geo_region_code: 'P4',
  geo_region_name: 'Gandaki',
};

function setup(
  t: { after: (fn: () => void) => void },
  fetchImpl: () => Promise<Response>
) {
  __resetGeoContextForTests();
  const originalFetch = global.fetch;
  const originalUrl = publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL;
  publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL = GEO_WORKER_URL;
  global.fetch = fetchImpl as typeof fetch;
  t.after(() => {
    global.fetch = originalFetch;
    __resetGeoContextForTests();
    publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL = originalUrl;
  });
}

test('primeGeoContext resolves + caches worker geo (incl. city/region); resolve reads cache, no refetch', async (t) => {
  let fetchCount = 0;
  setup(t, async () => {
    fetchCount += 1;
    return { ok: true, json: async () => WORKER_PAYLOAD } as Response;
  });

  const primed = await primeGeoContext();
  assert.deepEqual(primed, EXPECTED_GEO, 'prime should capture country/coords/timezone AND city/region');
  assert.equal(fetchCount, 1);

  // resolveGeoContext (called at flush) must return the cache WITHOUT refetching.
  const resolved = await resolveGeoContext();
  assert.deepEqual(resolved, EXPECTED_GEO);
  assert.equal(fetchCount, 1, 'flush-time resolve must never hit the network when a cache exists');

  // A second prime short-circuits on the warm cf-worker cache.
  await primeGeoContext();
  assert.equal(fetchCount, 1, 'a warm cf-worker cache should not be refetched within a session');
});

test('resolveGeoContext returns null (never throws/waits) when the worker is unavailable', async (t) => {
  setup(t, async () => ({ ok: false }) as Response);

  const resolved = await resolveGeoContext();
  assert.equal(resolved, null, 'no cache + failed worker => null, so the server enriches by IP instead');
});

test('stale fallback: once primed, a later worker failure still yields the cached geo', async (t) => {
  let shouldFail = false;
  setup(t, async () => {
    if (shouldFail) return { ok: false } as Response;
    return { ok: true, json: async () => WORKER_PAYLOAD } as Response;
  });

  await primeGeoContext();

  // Worker now dies (e.g. flush fires on app-background with the network gone).
  shouldFail = true;
  const resolved = await resolveGeoContext();
  assert.deepEqual(resolved, EXPECTED_GEO, 'the last-known geo must survive as a stale-but-usable fallback');
});

test('cold start: geo restored from MMKV (aged past TTL) refetches on next prime', async (t) => {
  // Simulate a cold start where a PREVIOUS install fetched geo long ago. Aged
  // envelope => disk-restored fix is usable but must refetch to catch travel/VPN.
  const AGED_ENVELOPE = JSON.stringify({
    geo: {
      ...EXPECTED_GEO,
      geo_city: 'StaleCity',
      geo_country_code: 'US',
    },
    fetched_at: Date.now() - 24 * 60 * 60 * 1000, // 24h ago, well past the 3h TTL
  });
  const mmkv = installFakeMmkv(AGED_ENVELOPE);

  let fetchCount = 0;
  setup(t, async () => {
    fetchCount += 1;
    return { ok: true, json: async () => WORKER_PAYLOAD } as Response;
  });
  t.after(mmkv.restore);

  // Flush before any prime still enriches with the stale disk geo (never blocks).
  const stale = await resolveGeoContext();
  assert.equal(stale?.geo_city, 'StaleCity', 'disk-restored geo is usable at flush time');
  assert.equal(fetchCount, 0, 'resolve must not hit the network');

  // Foreground prime on a disk-restored (aged) fix MUST refetch — the core A3 fix.
  const primed = await primeGeoContext();
  assert.deepEqual(primed, EXPECTED_GEO, 'aged disk geo must be replaced by a fresh worker fetch');
  assert.equal(fetchCount, 1, 'disk-restored geo must trigger exactly one refetch');

  // And the fresh in-process fix now short-circuits (no refetch storm).
  await primeGeoContext();
  assert.equal(fetchCount, 1, 'a freshly-fetched in-process fix short-circuits subsequent primes');

  // The refetch persisted a NEW envelope carrying a fresh fetched_at timestamp.
  const persistedRaw = mmkv.store.get(GEO_CACHE_KEY);
  assert.ok(persistedRaw, 'a fresh geo must be persisted back to MMKV');
  const persisted = JSON.parse(persistedRaw as string) as {
    geo: typeof EXPECTED_GEO;
    fetched_at: number;
  };
  assert.deepEqual(persisted.geo, EXPECTED_GEO, 'persisted payload shape is unchanged (still cf-worker)');
  assert.ok(
    persisted.fetched_at > Date.now() - 60 * 1000,
    'persisted fetched_at reflects the fresh fetch'
  );
});

test('cold start: recently-fetched MMKV geo (within TTL) short-circuits without refetch', async (t) => {
  // A device that fetched geo minutes ago restarts — no reason to refetch yet.
  const FRESH_ENVELOPE = JSON.stringify({
    geo: EXPECTED_GEO,
    fetched_at: Date.now() - 60 * 1000, // 1 min ago, well within the 3h TTL
  });
  const mmkv = installFakeMmkv(FRESH_ENVELOPE);

  let fetchCount = 0;
  setup(t, async () => {
    fetchCount += 1;
    return { ok: true, json: async () => WORKER_PAYLOAD } as Response;
  });
  t.after(mmkv.restore);

  const primed = await primeGeoContext();
  assert.deepEqual(primed, EXPECTED_GEO, 'a within-TTL disk fix is served as-is');
  assert.equal(fetchCount, 0, 'recently-fetched disk geo must NOT trigger a refetch');
});

test('cold start: aged disk geo still returns null-safely when the worker refetch fails', async (t) => {
  const AGED_ENVELOPE = JSON.stringify({
    geo: EXPECTED_GEO,
    fetched_at: Date.now() - 24 * 60 * 60 * 1000,
  });
  const mmkv = installFakeMmkv(AGED_ENVELOPE);

  // Offline/airplane: the refetch fails, but the stale disk fix must survive and
  // primeGeoContext must never reject.
  setup(t, async () => ({ ok: false }) as Response);
  t.after(mmkv.restore);

  const primed = await primeGeoContext();
  assert.deepEqual(primed, EXPECTED_GEO, 'a failed refetch falls back to the stale disk geo, never rejects');

  const resolved = await resolveGeoContext();
  assert.deepEqual(resolved, EXPECTED_GEO, 'flush still enriches with the stale disk geo after a failed refetch');
});
