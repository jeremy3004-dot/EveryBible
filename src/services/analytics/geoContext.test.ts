import assert from 'node:assert/strict';
import test from 'node:test';

const GEO_WORKER_URL = 'https://everybible-geo.example.workers.dev';

test('resolveGeoContext retries after a null result and caches the first successful lookup', async (t) => {
  const originalFetch = global.fetch;
  const originalGeoWorkerUrl = process.env.EXPO_PUBLIC_GEO_WORKER_URL;

  let fetchCount = 0;

  process.env.EXPO_PUBLIC_GEO_WORKER_URL = GEO_WORKER_URL;
  global.fetch = (async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return {
        ok: false,
      } as Response;
    }

    return {
      ok: true,
      json: async () => ({
        country_code: 'NP',
        latitude: 28.2096,
        longitude: 83.9856,
        timezone: 'Asia/Kathmandu',
      }),
    } as Response;
  }) as typeof fetch;

  t.after(() => {
    global.fetch = originalFetch;

    if (originalGeoWorkerUrl === undefined) {
      delete process.env.EXPO_PUBLIC_GEO_WORKER_URL;
      return;
    }

    process.env.EXPO_PUBLIC_GEO_WORKER_URL = originalGeoWorkerUrl;
  });

  const module = await import(`./geoContext.ts?case=${Date.now()}`);

  const firstAttempt = await module.resolveGeoContext();
  assert.equal(firstAttempt, null);
  assert.equal(fetchCount, 1);

  const secondAttempt = await module.resolveGeoContext();
  assert.deepEqual(secondAttempt, {
    geo_accuracy_km: null,
    geo_country_code: 'NP',
    geo_latitude: 28.2096,
    geo_longitude: 83.9856,
    geo_source: 'cf-worker',
    geo_timezone: 'Asia/Kathmandu',
  });
  assert.equal(fetchCount, 2);

  const thirdAttempt = await module.resolveGeoContext();
  assert.deepEqual(thirdAttempt, secondAttempt);
  assert.equal(fetchCount, 2);
});
