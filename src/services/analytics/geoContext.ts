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

// ---------------------------------------------------------------------------
// Client geo resolution (P1 S5)
//
// Geo is resolved EAGERLY at app-foreground/session-start (primeGeoContext),
// fire-and-forget with a short timeout, and cached in memory AND persisted to
// MMKV as a stale-but-usable fallback. resolveGeoContext() — called at flush,
// which happens on app-background when iOS may already be tearing down the
// network — NEVER waits on the network: it returns the cached value or null and
// kicks off a background prime. This is why the self-owned Cloudflare worker
// (which also returns city/region/region_code) can serve the vast majority of
// rows instead of losing the race to server-side IP fallback.
// ---------------------------------------------------------------------------

const GEO_CACHE_KEY = 'analytics-geo-cache-v1';
const GEO_FETCH_TIMEOUT_MS = 3000;
// How long a disk-restored fix is treated as "fresh enough" to skip a refetch.
// Beyond this, restored geo stays usable (it still enriches flushes) but the
// next foreground prime is allowed to refetch so a moved/travelling/VPN user
// stops reporting a stale first-launch location indefinitely.
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
// True only when the current cache was fetched in THIS process. Disk-restored
// geo is usable but not "fresh in-process", so it permits exactly one refetch.
let cachedFetchedThisProcess = false;
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
  if (countryCode === 'XX' || countryCode === 'T1' || countryCode.length === 0) {
    return null;
  }
  return countryCode;
}

function normalizeCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
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
        fetched_at:
          typeof candidate.fetched_at === 'number' ? candidate.fetched_at : 0,
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

// Seeds the in-memory cache from the last-known persisted geo exactly once, so
// the very first flush after a cold start can still attach a (stale) location.
function ensurePersistedLoaded(): void {
  if (persistedLoaded) return;
  persistedLoaded = true;
  const persisted = loadPersistedGeo();
  if (persisted && !cachedGeoContext) {
    cachedGeoContext = persisted.geo;
    cachedFetchedAt = persisted.fetched_at;
    // Restored from disk — usable, but NOT fetched in this process, so the next
    // foreground prime is allowed to refetch (subject to the freshness TTL).
    cachedFetchedThisProcess = false;
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

    const payload = (await response.json().catch(() => null)) as
      | {
          country_code?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          timezone?: unknown;
          city?: unknown;
          region?: unknown;
          region_code?: unknown;
        }
      | null;

    if (!payload) {
      return null;
    }

    const geo: GeoContext = {
      geo_accuracy_km: null,
      geo_country_code: normalizeCountryCode(payload.country_code),
      geo_latitude: normalizeCoordinate(payload.latitude),
      geo_longitude: normalizeCoordinate(payload.longitude),
      geo_source: 'cf-worker',
      geo_timezone: getText(payload.timezone),
      geo_city: getText(payload.city),
      geo_region_code: getText(payload.region_code)?.toUpperCase() ?? null,
      geo_region_name: getText(payload.region),
    };

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

  // Short-circuit only when the cached worker fix is genuinely fresh: either it
  // was fetched in THIS process, or it was restored from disk within the TTL.
  // Disk-restored geo older than the TTL stays usable for flushes but falls
  // through here so a moved/travelling/VPN user gets exactly one refetch per
  // foreground (the single in-flight promise below prevents a refetch storm).
  if (cachedGeoContext?.geo_source === 'cf-worker') {
    const isFresh =
      cachedFetchedThisProcess ||
      (cachedFetchedAt != null && Date.now() - cachedFetchedAt < GEO_FRESH_TTL_MS);
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
        cachedFetchedThisProcess = true;
        persistGeo(geo, fetchedAt);
      }
      return geo ?? cachedGeoContext;
    } finally {
      primePromise = null;
    }
  })();

  return primePromise;
}

/**
 * Returns the cached geo WITHOUT ever waiting on the network — safe to call at
 * flush time. If nothing is cached yet, it kicks off a background prime (so the
 * next flush is enriched) and returns null; the server then enriches by IP.
 */
export async function resolveGeoContext(): Promise<GeoContext | null> {
  ensurePersistedLoaded();

  if (cachedGeoContext) {
    return cachedGeoContext;
  }

  // Nothing cached — warm it for next time, but never block this flush on it.
  void primeGeoContext();
  return null;
}

// Test-only: clears the in-memory cache + prime state so each unit test starts
// from a cold module. Not used by app code.
export function __resetGeoContextForTests(): void {
  cachedGeoContext = null;
  cachedFetchedAt = null;
  cachedFetchedThisProcess = false;
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
