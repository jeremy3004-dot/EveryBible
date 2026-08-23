import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  getElManifest,
  getElManifestForAudioCatalog,
  __resetElManifestRuntimeForTests,
} from './elManifestService';
import type { ElCatalogTranslation } from './elCatalogModel';
import type { ElJwk } from './elEnvelope';
import { __resetElJwksRuntimeForTests } from './elJwks';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readFixtureBytes = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, fixturesDir).href));
const readJson = (name: string) => JSON.parse(readFixtureBytes(name).toString('utf8'));

const jwks = readJson('dev.jwks.json').keys as ElJwk[];
// The fixture catalog's manifest_sha256 is the sha256 of these exact manifest FILE bytes.
const manifestBytes = readFixtureBytes('manifest-lqdtest.json');

// Fixture manifest facts (see A5 / fixture pack): lqdtest, v2026-07-20-1, JHN 1-2.
const MANIFEST_SHA256 = 'adbb4675d4afa29e851f4a9055a9fcfb61f13ae4a0da6c982694dd11c9a03fac';
const CATALOG_BASE_URL = 'https://media.example.test';

function baseEntry(overrides: Partial<ElCatalogTranslation> = {}): ElCatalogTranslation {
  return {
    translationId: 'lqdtest',
    languageIso6393: 'eng',
    languageName: 'English (EL test)',
    translationName: 'EL Test Translation',
    abbreviation: 'LQTEST',
    source: 'langquest',
    copyright: 'CC0-1.0',
    deliveryMode: 'chapter',
    hasAudio: true,
    currentAudioVersion: 'v2026-07-20-1',
    manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
    manifestSha256: MANIFEST_SHA256,
    ...overrides,
  };
}

interface MemoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  raw: Map<string, string>;
}

function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    raw: map,
  };
}

// Fetch double returning the given bytes as an arrayBuffer-capable Response.
function makeFetch(bytes: Uint8Array, ok = true, isThrow = false) {
  let calls = 0;
  const fetchFn = (async (url: string) => {
    calls += 1;
    if (isThrow) throw new Error(`network down for ${url}`);
    return {
      ok,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return {
    fetchFn,
    get calls() {
      return calls;
    },
  };
}

const getKeys = async () => jwks;

test('fetches, integrity-checks, verifies, parses and returns the manifest', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(manifest);
  assert.equal(manifest.schema, 'everybible-audio-manifest/v1');
  assert.equal(manifest.translationId, 'lqdtest');
  assert.equal(manifest.audioVersion, 'v2026-07-20-1');
  assert.ok(manifest.books.JHN);
  assert.equal(manifest.books.JHN.length, 2);
});

test('a memory cache hit performs zero fetches', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(fetcher.calls, 1);
  const again = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(again);
});

test('a disk cache hit (cold memory) performs zero fetches', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  // Warm the disk cache.
  await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(fetcher.calls, 1);
  // Cold-start memory but keep disk contents.
  __resetElManifestRuntimeForTests();
  const again = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(again);
  assert.equal(again.translationId, 'lqdtest');
});

test('memory and disk cache hits enforce translation and audio-version identity guards', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });

  // Same URL, but a different translation: a memory hit must not return the cached document.
  const memorySwap = await getElManifest(
    baseEntry({ translationId: 'lqother' }),
    CATALOG_BASE_URL,
    { fetchFn: fetcher.fetchFn, storage, getKeys }
  );
  assert.equal(memorySwap, null);

  // Cold memory, same URL on disk, but a different audio version: a disk hit must also be
  // checked against the requested entry before it can be returned.
  __resetElManifestRuntimeForTests();
  const diskSwap = await getElManifest(
    baseEntry({ currentAudioVersion: 'v9999' }),
    CATALOG_BASE_URL,
    { fetchFn: fetcher.fetchFn, storage, getKeys }
  );
  assert.equal(diskSwap, null);
});

test('cached payload is the verified manifest JSON (not the envelope)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  const diskEntries = [...storage.raw.entries()].filter(([k]) =>
    k.startsWith('el-media:manifest:')
  );
  assert.equal(diskEntries.length, 1);
  const cached = JSON.parse(diskEntries[0][1]) as Record<string, unknown>;
  // Verified payload has `schema`; an envelope would have `compactJws`.
  assert.equal(cached.schema, 'everybible-audio-manifest/v1');
  assert.equal(cached.compactJws, undefined);
});

test('integrity mismatch (sha256 differs) returns null and does not cache', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(
    baseEntry({ manifestSha256: 'f'.repeat(64) }),
    CATALOG_BASE_URL,
    {
      fetchFn: fetcher.fetchFn,
      storage,
      getKeys,
    }
  );
  assert.equal(manifest, null);
  const diskEntries = [...storage.raw.keys()].filter((k) => k.startsWith('el-media:manifest:'));
  assert.equal(diskEntries.length, 0);
});

test('translation_id mismatch (document swap) returns null', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(baseEntry({ translationId: 'lqother' }), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(manifest, null);
});

test('audio_version mismatch (document swap) returns null', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(
    baseEntry({ currentAudioVersion: 'v9999' }),
    CATALOG_BASE_URL,
    {
      fetchFn: fetcher.fetchFn,
      storage,
      getKeys,
    }
  );
  assert.equal(manifest, null);
});

test('verification failure returns null (unknown key)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys: async () => [],
  });
  assert.equal(manifest, null);
});

test('network failure with a cached verified copy returns the cache', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const okFetch = makeFetch(manifestBytes);
  await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: okFetch.fetchFn,
    storage,
    getKeys,
  });
  __resetElManifestRuntimeForTests();
  const throwing = makeFetch(manifestBytes, true, true);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: throwing.fetchFn,
    storage,
    getKeys,
  });
  assert.ok(manifest);
  assert.equal(manifest.translationId, 'lqdtest');
});

test('network failure without any cache returns null and never throws', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const throwing = makeFetch(manifestBytes, true, true);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: throwing.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(manifest, null);
});

test('non-2xx response returns null when no cache exists', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes, false);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
  });
  assert.equal(manifest, null);
});

test('a different currentAudioVersion resolves a different cache entry', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  // Two entries whose manifest URLs differ by version → two distinct fetches + cache keys.
  const v1 = baseEntry({
    currentAudioVersion: 'v2026-07-20-1',
    manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
  });
  await getElManifest(v1, CATALOG_BASE_URL, { fetchFn: fetcher.fetchFn, storage, getKeys });
  assert.equal(fetcher.calls, 1);
  // Second version points at a different URL; the version-guard will reject the fixture bytes,
  // but the important assertion is that it did not reuse v1's cache entry (it fetched again).
  const v2 = baseEntry({
    currentAudioVersion: 'v2026-07-20-2',
    manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-2.json',
  });
  await getElManifest(v2, CATALOG_BASE_URL, { fetchFn: fetcher.fetchFn, storage, getKeys });
  assert.equal(fetcher.calls, 2);
});

test('absolute manifest URL is used as-is', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  let seenUrl = '';
  const fetchFn = (async (url: string) => {
    seenUrl = url;
    return {
      ok: true,
      arrayBuffer: async () =>
        manifestBytes.buffer.slice(
          manifestBytes.byteOffset,
          manifestBytes.byteOffset + manifestBytes.byteLength
        ),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  const absolute = 'https://cdn.example.test/manifests/audio/lqdtest/v2026-07-20-1.json';
  await getElManifest(baseEntry({ manifestUrl: absolute }), CATALOG_BASE_URL, {
    fetchFn,
    storage,
    getKeys,
  });
  assert.equal(seenUrl, absolute);
});

test('digest unavailable skips the integrity pre-check (wrong sha256 still returns manifest)', async () => {
  // Contract B12: when no SHA-256 primitive is available the integrity pre-check is skipped
  // silently — envelope verification alone gates trust. We simulate the digest-unavailable
  // runtime by injecting a computeSha256Hex seam that returns null (rather than tearing out
  // globalThis.crypto, which jose itself needs to verify the ES256 signature). The entry
  // carries a deliberately WRONG manifestSha256; because the digest is unavailable the
  // mismatch is never detected, so the manifest still verifies and is returned.
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);

  const savedCrypto = globalThis.crypto;
  try {
    const manifest = await getElManifest(
      baseEntry({ manifestSha256: 'f'.repeat(64) }),
      CATALOG_BASE_URL,
      {
        fetchFn: fetcher.fetchFn,
        storage,
        getKeys,
        // Simulate a runtime with no digest primitive: integrity check must be skipped.
        computeSha256Hex: async () => null,
      }
    );
    assert.ok(manifest, 'manifest should still verify when the integrity check is skipped');
    assert.equal(manifest.translationId, 'lqdtest');
    assert.equal(manifest.audioVersion, 'v2026-07-20-1');
    // Sanity: the same wrong sha256 WOULD have been rejected with a working digest (see the
    // "integrity mismatch" test above), proving this path genuinely took the skip branch.
  } finally {
    // Restore in case any prior assertion touched global crypto state.
    if (globalThis.crypto !== savedCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        value: savedCrypto,
        configurable: true,
      });
    }
  }
});

test('verification unsupported returns null WITHOUT fetching', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: () => false,
  });
  assert.equal(manifest, null);
  assert.equal(fetcher.calls, 0);
});

test('a fetch that hangs until aborted returns null (timeout path, no cache)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  // fetch never resolves on its own — it only rejects when the injected timeout aborts the
  // signal, exercising the AbortController wiring. If the timeout were missing this would hang.
  const hangingFetch = ((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // No signal wired → test would hang, surfacing the regression.
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
  const manifest = await getElManifest(baseEntry(), CATALOG_BASE_URL, {
    fetchFn: hangingFetch,
    storage,
    getKeys,
    timeoutMs: 5,
  });
  assert.equal(manifest, null);
});

test('getElManifestForAudioCatalog verifies a manifest without a manifestSha256 (integrity check skipped, signature gates)', async () => {
  // audioRemote only has catalog.audio fields — manifestUrl/audioVersion/catalogBaseUrl —
  // and never persisted manifest_sha256. The adapter must build the minimal entry and skip
  // the integrity pre-check when the digest is absent; envelope verification remains the gate.
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifestForAudioCatalog(
    {
      translationId: 'lqdtest',
      manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
      audioVersion: 'v2026-07-20-1',
      catalogBaseUrl: CATALOG_BASE_URL,
    },
    { fetchFn: fetcher.fetchFn, storage, getKeys }
  );
  assert.ok(manifest);
  assert.equal(manifest.translationId, 'lqdtest');
  assert.equal(manifest.audioVersion, 'v2026-07-20-1');
  assert.equal(fetcher.calls, 1);
});

test('getElManifestForAudioCatalog still rejects a tampered/unverifiable manifest (signature is the gate)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifestForAudioCatalog(
    {
      translationId: 'lqdtest',
      manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
      audioVersion: 'v2026-07-20-1',
      catalogBaseUrl: CATALOG_BASE_URL,
    },
    { fetchFn: fetcher.fetchFn, storage, getKeys: async () => [] }
  );
  assert.equal(manifest, null);
});

test('getElManifestForAudioCatalog enforces the audio_version guard (document swap)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch(manifestBytes);
  const manifest = await getElManifestForAudioCatalog(
    {
      translationId: 'lqdtest',
      manifestUrl: '/manifests/audio/lqdtest/v9999.json',
      audioVersion: 'v9999',
      catalogBaseUrl: CATALOG_BASE_URL,
    },
    { fetchFn: fetcher.fetchFn, storage, getKeys }
  );
  assert.equal(manifest, null);
});

test('relative manifest URL resolves against catalogBaseUrl (trailing slash stripped)', async () => {
  __resetElManifestRuntimeForTests();
  const storage = createMemoryStorage();
  let seenUrl = '';
  const fetchFn = (async (url: string) => {
    seenUrl = url;
    return {
      ok: true,
      arrayBuffer: async () =>
        manifestBytes.buffer.slice(
          manifestBytes.byteOffset,
          manifestBytes.byteOffset + manifestBytes.byteLength
        ),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  await getElManifest(baseEntry(), 'https://media.example.test/', { fetchFn, storage, getKeys });
  assert.equal(seenUrl, 'https://media.example.test/manifests/audio/lqdtest/v2026-07-20-1.json');
});

test('default getKeys discovers an unknown manifest kid from catalogBaseUrl using injected deps', async () => {
  __resetElManifestRuntimeForTests();
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const unknownKid = 'lqd-rotated-2027-a';
  const jwksUrl = `${CATALOG_BASE_URL}/.well-known/keys.json`;
  const rotatedManifestBytes = new TextEncoder().encode(
    JSON.stringify({ ...readJson('manifest-lqdtest.json'), keyId: unknownKid })
  );
  let jwksFetches = 0;

  const fetchFn = (async (url: string) => {
    if (url === jwksUrl) {
      jwksFetches += 1;
      return {
        ok: true,
        json: async () => ({ keys: [{ ...jwks[0], kid: unknownKid }] }),
      } as unknown as Response;
    }
    return {
      ok: true,
      arrayBuffer: async () =>
        rotatedManifestBytes.buffer.slice(
          rotatedManifestBytes.byteOffset,
          rotatedManifestBytes.byteOffset + rotatedManifestBytes.byteLength
        ),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  // The fixture's signed header still has the pinned kid, so verification is expected to fail;
  // this regression is specifically about reaching JWKS discovery with the right URL and deps.
  assert.equal(
    await getElManifest(baseEntry({ manifestSha256: '' }), CATALOG_BASE_URL, {
      fetchFn,
      storage,
      computeSha256Hex: async () => null,
    }),
    null
  );
  assert.equal(jwksFetches, 1, 'unknown manifest kids must trigger base-URL JWKS discovery');
  assert.ok(storage.raw.has('el-media:jwks-cache'), 'JWKS discovery must use the service storage');

  __resetElJwksRuntimeForTests();
});

test('default manifest key discovery is bounded after the manifest fetch succeeds', async () => {
  __resetElManifestRuntimeForTests();
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const unknownKid = 'lqd-rotated-hanging-a';
  const jwksUrl = `${CATALOG_BASE_URL}/.well-known/keys.json`;
  const rotatedManifestBytes = new TextEncoder().encode(
    JSON.stringify({ ...readJson('manifest-lqdtest.json'), keyId: unknownKid })
  );
  let observedSignal: AbortSignal | undefined;

  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url === jwksUrl) {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return {
      ok: true,
      arrayBuffer: async () =>
        rotatedManifestBytes.buffer.slice(
          rotatedManifestBytes.byteOffset,
          rotatedManifestBytes.byteOffset + rotatedManifestBytes.byteLength
        ),
    } as unknown as Response;
  }) as typeof fetch;

  const deadline = Symbol('deadline');
  const result = await Promise.race([
    getElManifest(baseEntry({ manifestSha256: '' }), CATALOG_BASE_URL, {
      fetchFn,
      storage,
      computeSha256Hex: async () => null,
      timeoutMs: 5,
    }),
    new Promise<typeof deadline>((resolve) => setTimeout(() => resolve(deadline), 500)),
  ]);

  assert.notEqual(result, deadline, 'manifest key discovery must not hang');
  assert.equal(result, null);
  assert.ok(observedSignal, 'manifest key discovery should receive an abort signal');
  __resetElJwksRuntimeForTests();
});
