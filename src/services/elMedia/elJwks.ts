import type { ElJwk } from './elEnvelope';

// Pinned trust store. These two EC P-256 (ES256) public keys are compiled into the
// app build and are the default trust anchor for every EL envelope (contract A2/B3):
// `lqd-prod-2026-a` signs all live catalogs/manifests; `lqd-dev-2026-a` signs the
// offline fixture pack. The `/.well-known/keys.json` JWKS endpoint is treated as
// rotation discovery only, never as the primary trust source. Re-verified against
// the live JWKS on 2026-08-03.
export const EL_PINNED_JWKS: ElJwk[] = [
  {
    kty: 'EC',
    crv: 'P-256',
    x: 'FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU',
    y: 'Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM',
    kid: 'lqd-prod-2026-a',
    alg: 'ES256',
    use: 'sig',
  },
  {
    kty: 'EC',
    crv: 'P-256',
    x: 'a6Wa5f9HTdnDALAfWytZJUfoI0ZORwyoiOANmdtqYaU',
    y: 'QakRiI46mgqVpTaAl3_H66FOE3szL0Xs58PLDbrxibQ',
    kid: 'lqd-dev-2026-a',
    alg: 'ES256',
    use: 'sig',
  },
];

const JWKS_PATH = '/.well-known/keys.json';
const JWKS_CACHE_KEY = 'el-media:jwks-cache';
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ElJwksStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ElJwksDeps {
  baseUrl?: string | null;
  storage?: ElJwksStorage;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface CachedJwks {
  keys: ElJwk[];
  fetchedAt: number;
}

// Per-launch guards. Cleared only by process restart or the test reset hook, so a
// missing kid triggers at most one network refetch per app launch (contract B3).
let memoryCache: CachedJwks | null = null;
const attemptedKeyIds = new Set<string>();

// Default async storage adapter over the app's MMKV instance, loaded via a guarded
// require so this module has no import-time side effects and stays usable under the
// Node test runner (where the native MMKV module is absent). Tests inject an
// in-memory double instead.
function defaultStorage(): ElJwksStorage {
  return {
    getItem: async (key) => {
      try {
        const { mmkvInstance } = require('../../stores/mmkvStorage') as {
          mmkvInstance: { getString(key: string): string | undefined };
        };
        return mmkvInstance.getString(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        const { mmkvInstance } = require('../../stores/mmkvStorage') as {
          mmkvInstance: { set(key: string, value: string): void };
        };
        mmkvInstance.set(key, value);
      } catch {
        // Best-effort — JWKS cache is a discovery optimization, never required.
      }
    },
  };
}

function isElJwk(value: unknown): value is ElJwk {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.kty === 'EC' &&
    typeof v.kid === 'string' &&
    v.kid.length > 0 &&
    typeof v.x === 'string' &&
    typeof v.y === 'string'
  );
}

function parseJwksBody(body: unknown): ElJwk[] {
  if (!body || typeof body !== 'object') return [];
  const keys = (body as Record<string, unknown>).keys;
  if (!Array.isArray(keys)) return [];
  return keys.filter(isElJwk);
}

// Pinned keys first, then any remote keys, deduped by kid (pinned wins).
function mergeKeys(remote: ElJwk[]): ElJwk[] {
  const seen = new Set(EL_PINNED_JWKS.map((k) => k.kid));
  const merged = [...EL_PINNED_JWKS];
  for (const key of remote) {
    if (seen.has(key.kid)) continue;
    seen.add(key.kid);
    merged.push(key);
  }
  return merged;
}

async function loadCache(deps: ElJwksDeps): Promise<CachedJwks | null> {
  if (memoryCache) return memoryCache;
  const storage = deps.storage ?? defaultStorage();
  try {
    const raw = await storage.getItem(JWKS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedJwks>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.keys)) {
      return null;
    }
    memoryCache = { keys: parsed.keys.filter(isElJwk), fetchedAt: parsed.fetchedAt };
    return memoryCache;
  } catch {
    return null;
  }
}

async function saveCache(cache: CachedJwks, deps: ElJwksDeps): Promise<void> {
  memoryCache = cache;
  const storage = deps.storage ?? defaultStorage();
  try {
    await storage.setItem(JWKS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort.
  }
}

function isFresh(cache: CachedJwks | null, now: number): cache is CachedJwks {
  return Boolean(cache) && now - (cache as CachedJwks).fetchedAt < JWKS_CACHE_TTL_MS;
}

// Returns the pinned trust store merged with any fresh cached remote JWKS.
export async function getElKeys(deps: ElJwksDeps = {}): Promise<ElJwk[]> {
  const now = (deps.now ?? Date.now)();
  const cache = await loadCache(deps);
  if (isFresh(cache, now)) {
    return mergeKeys(cache.keys);
  }
  return mergeKeys([]);
}

// If `keyId` is already known (pinned or freshly cached) no network happens. Otherwise
// fetch the JWKS at most once per launch per keyId, tolerantly parse it, and cache it in
// memory + storage (24h TTL). Any failure returns whatever keys we already had.
export async function refreshElJwksForUnknownKeyId(
  keyId: string,
  deps: ElJwksDeps = {}
): Promise<ElJwk[]> {
  const now = (deps.now ?? Date.now)();
  const cache = await loadCache(deps);
  const known = new Set([
    ...EL_PINNED_JWKS.map((k) => k.kid),
    ...(isFresh(cache, now) ? cache.keys.map((k) => k.kid) : []),
  ]);

  if (known.has(keyId)) {
    return isFresh(cache, now) ? mergeKeys(cache.keys) : mergeKeys([]);
  }
  if (attemptedKeyIds.has(keyId)) {
    return isFresh(cache, now) ? mergeKeys(cache.keys) : mergeKeys([]);
  }
  attemptedKeyIds.add(keyId);

  const baseUrl = deps.baseUrl?.replace(/\/+$/, '');
  if (!baseUrl) {
    return isFresh(cache, now) ? mergeKeys(cache.keys) : mergeKeys([]);
  }

  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const response = await fetchFn(`${baseUrl}${JWKS_PATH}`);
    if (!response.ok) {
      return isFresh(cache, now) ? mergeKeys(cache.keys) : mergeKeys([]);
    }
    const body = await response.json();
    const remoteKeys = parseJwksBody(body);
    await saveCache({ keys: remoteKeys, fetchedAt: now }, deps);
    return mergeKeys(remoteKeys);
  } catch {
    return isFresh(cache, now) ? mergeKeys(cache.keys) : mergeKeys([]);
  }
}

// Test-only: clears per-launch in-memory state so each test starts cold.
export function __resetElJwksRuntimeForTests(): void {
  memoryCache = null;
  attemptedKeyIds.clear();
}
