import assert from 'node:assert/strict';
import test from 'node:test';

import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import {
  __resetGeoContextForTests,
  primeGeoContext,
  resolveGeoContext,
} from './geoContext';

const GEO_WORKER_URL = 'https://everybible-geo.example.workers.dev';

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
