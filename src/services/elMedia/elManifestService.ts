import type { ElCatalogTranslation } from './elCatalogModel';
import type { ElJwk, ElSignedEnvelope } from './elEnvelope';
import { isElEnvelopeShape, verifyElEnvelope } from './elEnvelope';
import { getElKeys, refreshElJwksForUnknownKeyId } from './elJwks';
import type { ElAudioManifest } from './elManifestModel';
import { parseElManifestPayload } from './elManifestModel';

// AsyncStorage-shaped adapter. Mirrors the convention in elJwks.ts / elCatalogService.ts.
export interface ElManifestStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ElManifestServiceDeps {
  fetchFn?: typeof fetch;
  storage?: ElManifestStorage;
  getKeys?: (keyId: string) => Promise<ElJwk[]>;
}

const DISK_KEY_PREFIX = 'el-media:manifest:';
const HTTP_URL_RE = /^https?:\/\//;

// Manifests are immutable by URL: a new current_audio_version yields a new URL, so caching
// forever keyed by the absolute URL is safe. Memory cache survives a single launch; the disk
// cache survives restarts. Both hold the VERIFIED payload (never the envelope).
const memoryCache = new Map<string, ElAudioManifest>();

// Default async storage adapter over the app's MMKV instance, loaded via a guarded require so
// this module has no import-time side effects and stays usable under the Node test runner.
function defaultStorage(): ElManifestStorage {
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
        // Best-effort — a failed persist just means the next launch refetches.
      }
    },
  };
}

// Default trust-store resolver: pinned keys + cached JWKS, refetching once for an unknown kid.
async function defaultGetKeys(keyId: string): Promise<ElJwk[]> {
  const keys = await getElKeys();
  if (keys.some((key) => key.kid === keyId)) return keys;
  return refreshElJwksForUnknownKeyId(keyId);
}

function resolveManifestUrl(manifestUrl: string, catalogBaseUrl: string): string {
  if (HTTP_URL_RE.test(manifestUrl)) return manifestUrl;
  const base = catalogBaseUrl.replace(/\/+$/, '');
  return `${base}${manifestUrl}`;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

// SHA-256 the manifest bytes when crypto.subtle is present; returns null when unavailable so
// the caller skips the integrity pre-check silently (contract B12).
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    // Copy into a fresh Uint8Array so the digest input is a plain ArrayBuffer (never a
    // SharedArrayBuffer view), which crypto.subtle.digest requires.
    const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes));
    return toHex(new Uint8Array(digest));
  } catch {
    return null;
  }
}

// Disk cache key derived from the absolute manifest URL: sha256 when crypto is available,
// else a URL-encoded fallback (both are stable per URL).
async function diskKeyForUrl(url: string): Promise<string> {
  const hashed = await sha256Hex(new globalThis.TextEncoder().encode(url));
  return `${DISK_KEY_PREFIX}${hashed ?? encodeURIComponent(url)}`;
}

async function readDiskCache(
  storage: ElManifestStorage,
  diskKey: string
): Promise<ElAudioManifest | null> {
  try {
    const raw = await storage.getItem(diskKey);
    if (!raw) return null;
    // Re-parse through the tolerant parser; never trust raw storage bytes.
    return parseElManifestPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Resolves the verified, immutable audio manifest for a catalog entry. Cache order is
// memory → disk → network; a cache hit performs zero fetches. On fetch the raw bytes are
// integrity-checked (when crypto.subtle is available) against the catalog's manifest_sha256,
// then the envelope is verified and the payload is required to match the entry's
// translation_id and audio_version (anti-document-swap). Any failure falls back to a cached
// verified copy if present, else null. Never throws, never returns unverified data.
export async function getElManifest(
  entry: ElCatalogTranslation,
  catalogBaseUrl: string,
  deps: ElManifestServiceDeps = {}
): Promise<ElAudioManifest | null> {
  const storage = deps.storage ?? defaultStorage();
  const fetchFn = deps.fetchFn ?? fetch;
  const getKeys = deps.getKeys ?? defaultGetKeys;

  const url = resolveManifestUrl(entry.manifestUrl, catalogBaseUrl);

  const cachedInMemory = memoryCache.get(url);
  if (cachedInMemory) return cachedInMemory;

  const diskKey = await diskKeyForUrl(url);
  const cachedOnDisk = await readDiskCache(storage, diskKey);
  if (cachedOnDisk) {
    memoryCache.set(url, cachedOnDisk);
    return cachedOnDisk;
  }

  // Falls back to any cached verified copy on failure; here there is none (checked above).
  const fail = (): null => null;

  let bytes: Uint8Array;
  try {
    const response = await fetchFn(url);
    if (!response.ok) return fail();
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return fail();
  }

  // Integrity pre-check against the catalog's file digest (skipped silently if subtle absent).
  const actualDigest = await sha256Hex(bytes);
  if (actualDigest !== null && actualDigest !== entry.manifestSha256) return fail();

  let envelope: unknown;
  try {
    envelope = JSON.parse(new globalThis.TextDecoder().decode(bytes));
  } catch {
    return fail();
  }
  if (!isElEnvelopeShape(envelope)) return fail();

  let payload: unknown;
  try {
    const keys = await getKeys((envelope as ElSignedEnvelope).keyId);
    payload = await verifyElEnvelope(envelope as ElSignedEnvelope, keys);
  } catch {
    return fail();
  }
  if (payload === null) return fail();

  const manifest = parseElManifestPayload(payload);
  if (!manifest) return fail();

  // Anti-document-swap: the verified manifest must be the exact one this entry advertises.
  if (
    manifest.translationId !== entry.translationId ||
    manifest.audioVersion !== entry.currentAudioVersion
  ) {
    return fail();
  }

  memoryCache.set(url, manifest);
  try {
    await storage.setItem(diskKey, JSON.stringify(payload));
  } catch {
    // Persist is best-effort; the memory cache still serves this launch.
  }
  return manifest;
}

// Test-only: clears the per-launch in-memory manifest cache so each test starts cold.
export function __resetElManifestRuntimeForTests(): void {
  memoryCache.clear();
}
