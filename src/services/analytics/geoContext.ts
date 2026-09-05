import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

interface GeoContext {
  geo_accuracy_km: number | null;
  geo_country_code: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_source: string | null;
  geo_timezone: string | null;
  geo_city: string | null;
  geo_region_code: string | null;
  geo_region_name: string | null;
}

type GeoAttachableEvent = {
  geo_accuracy_km?: number | null;
  geo_country_code?: string | null;
  geo_latitude?: number | null;
  geo_longitude?: number | null;
  geo_source?: string | null;
  geo_timezone?: string | null;
  geo_city?: string | null;
  geo_region_code?: string | null;
  geo_region_name?: string | null;
};

// Resolve approximate network location at foreground time without delaying app
// activity. Only a fresh (under three hours) fix may enrich a new event. Offline
// events retain their captured fix; uncaptured events use the upload network.

const GEO_CACHE_KEY = 'analytics-geo-cache-v1';
const GEO_FETCH_TIMEOUT_MS = 3000;
const GEO_FRESH_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Persisted shape wraps the server-facing GeoContext with a fetch timestamp so
// restored geo can be aged out. The wrapped `geo` keeps the exact payload shape
// (incl. geo_source 'cf-worker') emitted to the server — only the envelope is new.
interface PersistedGeo {
  geo: GeoContext;
  fetched_at: number;
}

let cachedGeoContext: GeoContext | null = null;
// Wall-clock time the current in-memory geo was fetched (from the worker in this
// process) or last fetched (when restored from disk). null when nothing cached.
let cachedFetchedAt: number | null = null;

let persistedLoaded = false;
let primePromise: Promise<GeoContext | null> | null = null;

function getText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const countryCode = value.trim().toUpperCase();
  if (countryCode === 'XX' || countryCode === 'T1' || !/^[A-Z]{2}$/.test(countryCode)) {
    return null;
  }
  return countryCode;
}

function normalizeCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? Math.round(parsed * 10) / 10 : null;
}

function normalizeGeo(geo: GeoContext): GeoContext {
  const latitude = normalizeCoordinate(geo.geo_latitude, 90);
  const longitude = normalizeCoordinate(geo.geo_longitude, 180);
  return {
    ...geo,
    geo_country_code: normalizeCountryCode(geo.geo_country_code),
    geo_latitude: longitude == null ? null : latitude,
    geo_longitude: latitude == null ? null : longitude,
  };
}

// MMKV persistence is loaded lazily via require() so this module stays free of
// react-native imports and remains directly unit-testable under node --test.
// The require is a no-op (caught) in any environment without the native module.
function loadPersistedGeo(): PersistedGeo | null {
  try {
    const { mmkvInstance } = require('../../stores/mmkvStorage');
    const raw = mmkvInstance.getString(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    // New envelope: { geo, fetched_at }. Legacy rows persisted the bare
    // GeoContext — treat those as already-aged (fetched_at 0) so they stay
    // usable but always permit a refetch on the next prime.
    const candidate = parsed as Partial<PersistedGeo> & Partial<GeoContext>;
    if (candidate.geo && typeof candidate.geo === 'object') {
      return {
        geo: candidate.geo as GeoContext,
        fetched_at: typeof candidate.fetched_at === 'number' ? candidate.fetched_at : 0,
      };
    }
    return { geo: parsed as GeoContext, fetched_at: 0 };
  } catch {
    return null;
  }
}

function persistGeo(geo: GeoContext, fetchedAt: number): void {
  try {
    const { mmkvInstance } = require('../../stores/mmkvStorage');
    const envelope: PersistedGeo = { geo, fetched_at: fetchedAt };
    mmkvInstance.set(GEO_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // Best-effort — persistence is a stale fallback, never required for delivery.
  }
}

// Restore the cache once; its timestamp still controls whether it can be used.
function ensurePersistedLoaded(): void {
  if (persistedLoaded) return;
  persistedLoaded = true;
  const persisted = loadPersistedGeo();
  if (persisted && !cachedGeoContext) {
    cachedGeoContext = normalizeGeo(persisted.geo);
    cachedFetchedAt = persisted.fetched_at;
  }
}

async function fetchWorkerGeo(): Promise<GeoContext | null> {
  const workerUrl = publicRuntimeConfig.EXPO_PUBLIC_GEO_WORKER_URL;
  if (!workerUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(workerUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EveryBible/mobile-analytics',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      country_code?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      timezone?: unknown;
      city?: unknown;
      region?: unknown;
      region_code?: unknown;
    } | null;

    if (!payload) {
      return null;
    }

    const geo: GeoContext = normalizeGeo({
      geo_accuracy_km: null,
      geo_country_code: normalizeCountryCode(payload.country_code),
      geo_latitude: normalizeCoordinate(payload.latitude, 90),
      geo_longitude: normalizeCoordinate(payload.longitude, 180),
      geo_source: 'cf-worker',
      geo_timezone: getText(payload.timezone),
      geo_city: getText(payload.city),
      geo_region_code: getText(payload.region_code)?.toUpperCase() ?? null,
      geo_region_name: getText(payload.region),
    });

    // Reject an all-empty payload so we don't cache a useless "cf-worker" source
    // that would suppress the server-side IP fallback.
    if (
      !geo.geo_country_code &&
      geo.geo_latitude == null &&
      geo.geo_longitude == null &&
      !geo.geo_city
    ) {
      return null;
    }

    return geo;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves geo ONCE and caches it (memory + MMKV). Fire-and-forget: callers use
 * `void primeGeoContext()` at foreground/session-start. Returns the resolving
 * promise so tests (and callers who care) can await it. Safe to call repeatedly
 * — concurrent calls share one in-flight fetch, and a warm cache short-circuits.
 */
export function primeGeoContext(): Promise<GeoContext | null> {
  ensurePersistedLoaded();

  // The TTL applies to both live and restored caches, including long-running apps.
  if (cachedGeoContext?.geo_source === 'cf-worker') {
    const isFresh =
      cachedFetchedAt != null &&
      Date.now() >= cachedFetchedAt &&
      Date.now() - cachedFetchedAt < GEO_FRESH_TTL_MS;
    if (isFresh) {
      return Promise.resolve(cachedGeoContext);
    }
  }

  if (primePromise) {
    return primePromise;
  }

  primePromise = (async () => {
    try {
      const geo = await fetchWorkerGeo();
      if (geo) {
        const fetchedAt = Date.now();
        cachedGeoContext = geo;
        cachedFetchedAt = fetchedAt;

        persistGeo(geo, fetchedAt);
      }
      return geo ?? getCachedGeoContext();
    } finally {
      primePromise = null;
    }
  })();

  return primePromise;
}

/**
 * Returns fresh cached geo without a network wait. Expired locations never
 * override a later upload from another network.
 */
export function getCachedGeoContext(): GeoContext | null {
  ensurePersistedLoaded();
  return cachedFetchedAt != null &&
    Date.now() >= cachedFetchedAt &&
    Date.now() - cachedFetchedAt < GEO_FRESH_TTL_MS
    ? cachedGeoContext
    : null;
}

export async function resolveGeoContext(): Promise<GeoContext | null> {
  const geo = getCachedGeoContext();
  if (!geo) void primeGeoContext();
  return geo;
}

// Test-only: clears the in-memory cache + prime state so each unit test starts
// from a cold module. Not used by app code.
export function __resetGeoContextForTests(): void {
  cachedGeoContext = null;
  cachedFetchedAt = null;

  persistedLoaded = false;
  primePromise = null;
}

export function attachGeoContext<T extends GeoAttachableEvent>(
  event: T,
  geo: GeoContext | null
): T {
  if (!geo) {
    return event;
  }

  return {
    ...event,
    geo_accuracy_km: geo.geo_accuracy_km,
    geo_country_code: geo.geo_country_code,
    geo_latitude: geo.geo_latitude,
    geo_longitude: geo.geo_longitude,
    geo_source: geo.geo_source,
    geo_timezone: geo.geo_timezone,
    geo_city: geo.geo_city,
    geo_region_code: geo.geo_region_code,
    geo_region_name: geo.geo_region_name,
  };
}
