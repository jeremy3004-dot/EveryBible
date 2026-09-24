import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockMmkvStorage } from '../../testing/mockModules';

// Edge cases of geo resolution: worker failures and junk payloads, the on-disk
// cache's legacy/corrupt shapes, disk faults, and attaching geo to an event.
// geoContext.test.ts covers the happy path and TTL behaviour.

const mmkv = mockMmkvStorage(mock);

const GEO_CACHE_KEY = 'analytics-geo-cache-v1';
const GEO_WORKER_URL = 'https://everybible-geo.example.workers.dev';
const HOUR_MS = 60 * 60 * 1000;

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
  geo_latitude: 28.2,
  geo_longitude: 84,
  geo_source: 'cf-worker',
  geo_timezone: 'Asia/Kathmandu',
  geo_city: 'Pokhara',
  geo_region_code: 'P4',
  geo_region_name: 'Gandaki',
};

type GeoModule = typeof import('./geoContext');
type RuntimeConfigModule = typeof import('../startup/publicRuntimeConfig');

let geo: GeoModule;
let runtimeConfig: RuntimeConfigModule['publicRuntimeConfig'];
let fetchCalls = 0;
let fetchImpl: (init?: RequestInit) => Promise<Response> = async () =>
  ({ ok: true, json: async () => WORKER_PAYLOAD }) as Response;

const originalFetch = globalThis.fetch;
let originalWorkerUrl: string | undefined;

beforeEach(async () => {
  geo ??= await import('./geoContext');
  runtimeConfig ??= (await import('../startup/publicRuntimeConfig')).publicRuntimeConfig;
  geo.__resetGeoContextForTests();
  mmkv.store.clear();
  fetchCalls = 0;
  fetchImpl = async () => ({ ok: true, json: async () => WORKER_PAYLOAD }) as Response;
  originalWorkerUrl = runtimeConfig.EXPO_PUBLIC_GEO_WORKER_URL;
  runtimeConfig.EXPO_PUBLIC_GEO_WORKER_URL = GEO_WORKER_URL;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    fetchCalls += 1;
    return fetchImpl(init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  runtimeConfig.EXPO_PUBLIC_GEO_WORKER_URL = originalWorkerUrl;
});

const workerReturns = (payload: unknown) => {
  fetchImpl = async () => ({ ok: true, json: async () => payload }) as Response;
};

const seedDisk = (value: unknown) => {
  mmkv.store.set(GEO_CACHE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
};

// ── attachGeoContext ────────────────────────────────────────────────────────

test('attaching no geo returns the event untouched', () => {
  const event = { event_name: 'reading_started', geo_city: 'Kept' };

  assert.equal(geo.attachGeoContext(event, null), event);
});

test('attaching geo copies all nine geo fields over the event and keeps its other fields', () => {
  const event = { event_name: 'reading_started', geo_city: 'Old', geo_source: 'ip' };

  assert.deepEqual(geo.attachGeoContext(event, EXPECTED_GEO), {
    event_name: 'reading_started',
    ...EXPECTED_GEO,
  });
  assert.deepEqual(event, { event_name: 'reading_started', geo_city: 'Old', geo_source: 'ip' });
});

// ── worker failures and junk payloads ───────────────────────────────────────

test('without a configured worker URL no request is made and geo stays unknown', async () => {
  runtimeConfig.EXPO_PUBLIC_GEO_WORKER_URL = '';

  assert.equal(await geo.primeGeoContext(), null);
  assert.equal(fetchCalls, 0);
});

test('a worker body that is not JSON yields no geo and caches nothing', async () => {
  fetchImpl = async () =>
    ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as Response;

  assert.equal(await geo.primeGeoContext(), null);
  assert.equal(mmkv.store.has(GEO_CACHE_KEY), false);
});

test('a worker payload with no usable location is rejected so the server can fall back to IP', async () => {
  workerReturns({ country_code: 'XX', latitude: null, longitude: null, city: '   ' });

  assert.equal(await geo.primeGeoContext(), null);
  assert.equal(geo.getCachedGeoContext(), null);
  assert.equal(mmkv.store.has(GEO_CACHE_KEY), false);
});

test('placeholder and malformed country codes are dropped but the rest of the fix is kept', async () => {
  for (const countryCode of ['XX', 'T1', 'NPL', 42]) {
    geo.__resetGeoContextForTests();
    workerReturns({ ...WORKER_PAYLOAD, country_code: countryCode });

    const resolved = await geo.primeGeoContext();

    assert.equal(resolved?.geo_country_code, null, `country ${String(countryCode)}`);
    assert.equal(resolved?.geo_city, 'Pokhara');
  }
});

test('blank or non-string text fields are stored as null', async () => {
  workerReturns({ country_code: ' np ', timezone: '  ', city: 7, region: '', region_code: null });

  assert.deepEqual(await geo.primeGeoContext(), {
    geo_accuracy_km: null,
    geo_country_code: 'NP',
    geo_latitude: null,
    geo_longitude: null,
    geo_source: 'cf-worker',
    geo_timezone: null,
    geo_city: null,
    geo_region_code: null,
    geo_region_name: null,
  });
});

test('a network error reaching the worker resolves to no geo instead of rejecting', async () => {
  fetchImpl = async () => {
    throw new TypeError('Network request failed');
  };

  assert.equal(await geo.primeGeoContext(), null);
});

test('a worker that does not answer within three seconds is abandoned', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  fetchImpl = (init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });

  const pending = geo.primeGeoContext();
  t.mock.timers.tick(2999);
  assert.equal(aborted, false);
  t.mock.timers.tick(1);

  assert.equal(await pending, null);
  assert.equal(aborted, true);
});

test('concurrent primes share one worker request', async () => {
  const [first, second] = await Promise.all([geo.primeGeoContext(), geo.primeGeoContext()]);

  assert.equal(fetchCalls, 1);
  assert.deepEqual(first, EXPECTED_GEO);
  assert.deepEqual(second, EXPECTED_GEO);
});

// ── on-disk cache shapes and faults ─────────────────────────────────────────

test('a recent disk fix is normalised on restore before it can be attached to events', async () => {
  seedDisk({
    geo: {
      ...EXPECTED_GEO,
      geo_country_code: 'usa',
      geo_latitude: 28.2096,
      geo_longitude: 83.9856,
    },
    fetched_at: Date.now() - 60_000,
  });

  assert.deepEqual(geo.getCachedGeoContext(), {
    ...EXPECTED_GEO,
    geo_country_code: null,
  });
  assert.equal(fetchCalls, 0);
});

test('a legacy bare geo row on disk is treated as expired and refreshed on prime', async () => {
  seedDisk({ ...EXPECTED_GEO, geo_city: 'LegacyCity' });

  assert.equal(geo.getCachedGeoContext(), null, 'a legacy row has no fetch time, so it is aged');
  assert.deepEqual(await geo.primeGeoContext(), EXPECTED_GEO);
  assert.equal(fetchCalls, 1);
});

test('an envelope whose fetch time is not a number is treated as expired', async () => {
  seedDisk({ geo: EXPECTED_GEO, fetched_at: 'yesterday' });

  assert.equal(geo.getCachedGeoContext(), null);
});

test('a disk fix stamped in the future (clock moved backwards) is not trusted', async () => {
  seedDisk({ geo: { ...EXPECTED_GEO, geo_city: 'Future' }, fetched_at: Date.now() + HOUR_MS });

  assert.equal(geo.getCachedGeoContext(), null);
  assert.deepEqual(await geo.primeGeoContext(), EXPECTED_GEO);
  assert.equal(fetchCalls, 1);
});

test('a fresh disk fix from a non-worker source is still refreshed from the worker on prime', async () => {
  seedDisk({ geo: { ...EXPECTED_GEO, geo_source: 'ip' }, fetched_at: Date.now() - 60_000 });

  assert.equal(geo.getCachedGeoContext()?.geo_source, 'ip');
  assert.deepEqual(await geo.primeGeoContext(), EXPECTED_GEO);
  assert.equal(fetchCalls, 1);
});

test('a disk value that is not an object restores nothing', async () => {
  for (const raw of ['42', 'null', '"text"']) {
    geo.__resetGeoContextForTests();
    seedDisk(raw);

    assert.equal(geo.getCachedGeoContext(), null, `disk value ${raw}`);
  }
});

test('an unparseable disk value restores nothing and does not throw', () => {
  seedDisk('{ not json');

  assert.equal(geo.getCachedGeoContext(), null);
});

test('a disk that cannot be written still leaves the fresh fix usable in memory', async () => {
  const write = mmkv.mmkvInstance.set;
  mmkv.mmkvInstance.set = () => {
    throw new Error('disk full');
  };
  try {
    assert.deepEqual(await geo.primeGeoContext(), EXPECTED_GEO);
  } finally {
    mmkv.mmkvInstance.set = write;
  }

  assert.deepEqual(geo.getCachedGeoContext(), EXPECTED_GEO);
  assert.equal(mmkv.store.has(GEO_CACHE_KEY), false);
});

test('a resolve with nothing cached returns immediately and refreshes in the background', async () => {
  let release: (() => void) | undefined;
  fetchImpl = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve({ ok: true, json: async () => WORKER_PAYLOAD } as Response);
    });

  assert.equal(await geo.resolveGeoContext(), null);
  assert.equal(fetchCalls, 1);

  release?.();
  assert.deepEqual(await geo.primeGeoContext(), EXPECTED_GEO, 'joins the in-flight refresh');
  assert.equal(fetchCalls, 1);
  assert.deepEqual(await geo.resolveGeoContext(), EXPECTED_GEO);
});
