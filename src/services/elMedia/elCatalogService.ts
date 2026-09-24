import type { ElCatalog } from './elCatalogModel';
import { isElVerificationRuntimeSupported } from './elRuntimeSupport';
import { parseElCatalogPayload } from './elCatalogModel';
import type { ElJwk, ElSignedEnvelope } from './elEnvelope';
import { isElEnvelopeShape, verifyElEnvelope } from './elEnvelope';
import { getElKeys } from './elJwks';

// AsyncStorage-shaped adapter. Mirrors the convention in elJwks.ts so tests can inject an
// in-memory double while production lazily wraps MMKV.
export interface ElCatalogStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ElCatalogServiceDeps {
  fetchFn?: typeof fetch;
  storage?: ElCatalogStorage;
  // Resolves the trust store for a given envelope keyId. The production implementation
  // ignores the keyId and always returns the pinned trust store (there is no runtime key
  // discovery — see elJwks.ts). Injectable so tests can supply the dev fixture keys.
  getKeys?: (keyId: string) => Promise<ElJwk[]>;
  isVerificationSupported?: () => boolean;
  // Network fetch timeout in ms. Injectable so tests can exercise the abort path. Aborting is
  // treated identically to a network error (last-good / null), so warmup can never be pinned
  // by a hung socket.
  timeoutMs?: number;
}

// Ceiling on the catalog network fetch so a stalled socket cannot pin the warmup path forever.
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

// Persisted last-verified catalog record. `payloadJson` is the raw verified catalog payload
// (never the envelope); it is always re-parsed on read so corrupt storage cannot inject data.
//
// `keyId` and `catalogUrl` say which key verified it and which catalog it came from. MMKV
// survives an app update, so a release build installed over a dev build finds the dev
// build's record, verified by the dev key this build no longer trusts and fetched from the
// dev catalog. A record is only used by a build that trusts its key and asks for the same
// catalog; any other record (including one written before these fields existed) is ignored,
// both as a fallback and as the sequence floor for the rollback guard.
interface StoredCatalogRecord {
  sequence: number;
  payloadJson: string;
  verifiedAt: number;
  keyId: string;
  catalogUrl: string;
}

const LAST_CATALOG_KEY = 'el-media:last-catalog';

// Default async storage adapter over the app's MMKV instance, loaded via a guarded require so
// this module has no import-time side effects and stays usable under the Node test runner.
function defaultStorage(): ElCatalogStorage {
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

// Default trust-store resolver: the pinned keys, always. An envelope whose keyId is not
// pinned simply fails verification — no network discovery, no cache (see elJwks.ts).
async function defaultGetKeys(): Promise<ElJwk[]> {
  return getElKeys();
}

async function readStoredRecord(storage: ElCatalogStorage): Promise<StoredCatalogRecord | null> {
  try {
    const raw = await storage.getItem(LAST_CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCatalogRecord>;
    if (
      !parsed ||
      typeof parsed.sequence !== 'number' ||
      typeof parsed.payloadJson !== 'string' ||
      typeof parsed.verifiedAt !== 'number' ||
      typeof parsed.keyId !== 'string' ||
      typeof parsed.catalogUrl !== 'string'
    ) {
      return null;
    }
    return {
      sequence: parsed.sequence,
      payloadJson: parsed.payloadJson,
      verifiedAt: parsed.verifiedAt,
      keyId: parsed.keyId,
      catalogUrl: parsed.catalogUrl,
    };
  } catch {
    return null;
  }
}

// The stored record, only when it came from `catalogUrl` and this build still trusts the key
// that verified it (see StoredCatalogRecord).
async function readTrustedRecord(
  storage: ElCatalogStorage,
  catalogUrl: string,
  getKeys: (keyId: string) => Promise<ElJwk[]>
): Promise<StoredCatalogRecord | null> {
  const record = await readStoredRecord(storage);
  if (!record || record.catalogUrl !== catalogUrl) return null;
  try {
    const keys = await getKeys(record.keyId);
    return keys.some((key) => key.kid === record.keyId) ? record : null;
  } catch {
    return null;
  }
}

// Re-parses a stored record's payload through the tolerant catalog parser. Corrupt storage or
// a payload that no longer satisfies the schema yields null rather than trusting raw bytes.
function parseStoredRecord(record: StoredCatalogRecord | null): ElCatalog | null {
  if (!record) return null;
  try {
    return parseElCatalogPayload(JSON.parse(record.payloadJson));
  } catch {
    return null;
  }
}

// Returns the last catalog verified from `catalogUrl` by a key this build trusts, always
// re-parsed from storage (never trust raw storage).
export async function getLastVerifiedElCatalog(
  catalogUrl: string,
  deps: ElCatalogServiceDeps = {}
): Promise<ElCatalog | null> {
  const storage = deps.storage ?? defaultStorage();
  const getKeys = deps.getKeys ?? defaultGetKeys;
  return parseStoredRecord(await readTrustedRecord(storage, catalogUrl, getKeys));
}

// Fetches, verifies and parses the signed catalog. On any failure (network, non-2xx, malformed
// body, shape/verification/parse failure) the last verified catalog is returned instead — this
// function never throws. A verified catalog whose sequence is lower than the stored one is
// rejected as a rollback/replay; an equal-or-higher sequence is accepted and persisted.
export async function refreshElCatalog(
  catalogUrl: string,
  deps: ElCatalogServiceDeps = {}
): Promise<ElCatalog | null> {
  const storage = deps.storage ?? defaultStorage();
  const isSupported = deps.isVerificationSupported ?? isElVerificationRuntimeSupported;

  // Verification is a hard requirement: we must not spend a network request we cannot validate.
  // Verification is pure JS now, so this is satisfied on Hermes as well as Node — previously it
  // gated on crypto.subtle and therefore returned null on every real device.
  if (!isSupported()) return null;

  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const getKeys = deps.getKeys ?? defaultGetKeys;

  // Read-snapshot the stored record ONCE up front; last-write-wins under concurrent refresh.
  // Today there is a single warmup caller, so overlapping refreshes cannot race here.
  const storedRecord = await readTrustedRecord(storage, catalogUrl, getKeys);
  const lastGood = () => parseStoredRecord(storedRecord);

  // AbortController + setTimeout(abort) mirrors the repo's existing fetch-timeout pattern
  // (see verseTimestamps.ts / audioRemote.ts). We deliberately do NOT use AbortSignal.timeout,
  // which is not guaranteed on the Hermes runtime. An abort surfaces as a fetch rejection and
  // therefore lands on the same last-good failure path as any network error.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let envelope: unknown;
  try {
    const response = await fetchFn(catalogUrl, { signal: controller.signal });
    if (!response.ok) return lastGood();
    envelope = await response.json();
  } catch {
    return lastGood();
  } finally {
    clearTimeout(timeoutId);
  }

  if (!isElEnvelopeShape(envelope)) return lastGood();

  const { keyId } = envelope as ElSignedEnvelope;
  let payload: unknown;
  try {
    const keys = await getKeys(keyId);
    payload = await verifyElEnvelope(envelope as ElSignedEnvelope, keys);
  } catch {
    return lastGood();
  }
  if (payload === null) return lastGood();

  const catalog = parseElCatalogPayload(payload);
  if (!catalog) return lastGood();

  // Rollback guard: a strictly older sequence is a replay of a stale catalog — keep last-good.
  if (storedRecord && catalog.sequence < storedRecord.sequence) return lastGood();

  const record: StoredCatalogRecord = {
    sequence: catalog.sequence,
    payloadJson: JSON.stringify(payload),
    verifiedAt: Date.now(),
    keyId,
    catalogUrl,
  };
  try {
    await storage.setItem(LAST_CATALOG_KEY, JSON.stringify(record));
  } catch {
    // Persist is best-effort; still return the freshly verified catalog for this launch.
  }
  return catalog;
}
