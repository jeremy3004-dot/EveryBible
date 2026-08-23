import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';

import { refreshElCatalog, getLastVerifiedElCatalog } from './elCatalogService';
import type { ElJwk } from './elEnvelope';
import { __resetElJwksRuntimeForTests } from './elJwks';
import { sha256Bytes } from './elEs256';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys as ElJwk[];
const catalogEnvelope = readJson('catalog.dev.json');

const CATALOG_URL = 'https://example.test/catalog.dev.json';
const LAST_CATALOG_KEY = 'el-media:last-catalog';

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

function makeFetch(body: unknown, ok = true, isJsonThrow = false) {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return {
      ok,
      json: async () => {
        if (isJsonThrow) throw new Error('malformed body');
        return body;
      },
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
const supported = () => true;

const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

function createRotatedCatalogFixture(keyId: string): { envelope: unknown; key: ElJwk } {
  const privateKey = new Uint8Array(32).fill(7);
  const publicKey = p256.getPublicKey(privateKey, false);
  const key: ElJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33)),
    kid: keyId,
    alg: 'ES256',
    use: 'sig',
  };
  const payloadSegment = catalogEnvelope.compactJws.split('.')[1] as string;
  const headerSegment = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: keyId }))
  );
  const signingInput = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = p256
    .sign(sha256Bytes(signingInput), privateKey, { format: 'compact', lowS: false })
    .toCompactRawBytes();

  return {
    key,
    envelope: {
      ...catalogEnvelope,
      keyId,
      compactJws: `${headerSegment}.${payloadSegment}.${toBase64Url(signature)}`,
    },
  };
}

// A synthetic stored catalog state at a given sequence. The stored payloadJson must be a
// valid lqd-catalog/v1 payload so getLastVerifiedElCatalog can re-parse it.
function storedCatalogState(sequence: number): string {
  const payload = {
    schema_version: 'lqd-catalog/v1',
    sequence,
    generated_at: '2026-07-18T12:00:00.000Z',
    base_url: 'http://localhost:8787',
    translations: [],
  };
  return JSON.stringify({
    sequence,
    payloadJson: JSON.stringify(payload),
    verifiedAt: 1_000_000,
  });
}

test('happy path fetches, verifies, parses, persists and returns the catalog', async () => {
  const storage = createMemoryStorage();
  const fetcher = makeFetch(catalogEnvelope);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(catalog);
  assert.equal(catalog.schemaVersion, 'lqd-catalog/v1');
  assert.equal(catalog.sequence, 1);
  assert.equal(catalog.translations.length, 1);
  assert.equal(catalog.translations[0].translationId, 'lqdtest');

  const persisted = storage.raw.get(LAST_CATALOG_KEY);
  assert.ok(persisted);
  const parsedRecord = JSON.parse(persisted) as {
    sequence: number;
    payloadJson: string;
    verifiedAt: number;
  };
  assert.equal(parsedRecord.sequence, 1);
  assert.equal(typeof parsedRecord.payloadJson, 'string');
  assert.equal(typeof parsedRecord.verifiedAt, 'number');
});

test('network failure returns last-good and never throws', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(3) });
  const throwingFetch = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: throwingFetch,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 3);
});

test('non-2xx response returns last-good (or null when absent)', async () => {
  const storage = createMemoryStorage();
  const fetcher = makeFetch(catalogEnvelope, false);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.equal(catalog, null);
});

test('malformed body returns last-good', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(2) });
  const fetcher = makeFetch(null, true, true);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 2);
});

test('verification failure returns last-good', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(4) });
  const tampered = { ...catalogEnvelope, keyId: 'unknown-kid' };
  const fetcher = makeFetch(tampered);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 4);
  // Stored state must not have been overwritten by the failed fetch.
  const persisted = JSON.parse(storage.raw.get(LAST_CATALOG_KEY) as string) as { sequence: number };
  assert.equal(persisted.sequence, 4);
});

test('sequence regression is rejected and the stored catalog is kept', async () => {
  // Incoming fixture is sequence 1; stored is 5 → reject, keep stored.
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(5) });
  const fetcher = makeFetch(catalogEnvelope);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 5);
  const persisted = JSON.parse(storage.raw.get(LAST_CATALOG_KEY) as string) as { sequence: number };
  assert.equal(persisted.sequence, 5);
});

test('equal sequence is accepted (same document re-fetched)', async () => {
  // Fixture is sequence 1; stored is also 1 → accept and re-persist.
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(1) });
  const fetcher = makeFetch(catalogEnvelope);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 1);
  // The freshly verified doc has a translation; the synthetic stored one did not.
  assert.equal(catalog.translations.length, 1);
});

test('a fetch that hangs until aborted resolves to last-good (timeout path)', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(8) });
  // fetch never resolves on its own — it only rejects when the injected timeout aborts the
  // signal, exercising the AbortController wiring. If the timeout were missing this would hang.
  const hangingFetch = ((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // No signal wired → test would hang, surfacing the regression.
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: hangingFetch,
    storage,
    getKeys,
    isVerificationSupported: supported,
    timeoutMs: 5,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 8);
});

test('verification unsupported returns null WITHOUT fetching', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(7) });
  const fetcher = makeFetch(catalogEnvelope);
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: () => false,
  });
  assert.equal(catalog, null);
  assert.equal(fetcher.calls, 0);
});

test('getLastVerifiedElCatalog re-parses persisted payload through the parser', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(9) });
  const catalog = await getLastVerifiedElCatalog({ storage });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 9);
  assert.equal(catalog.schemaVersion, 'lqd-catalog/v1');
});

test('getLastVerifiedElCatalog returns null for corrupt storage', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: 'not-json' });
  assert.equal(await getLastVerifiedElCatalog({ storage }), null);
});

test('getLastVerifiedElCatalog returns null when stored payload is not a valid catalog', async () => {
  const storage = createMemoryStorage({
    [LAST_CATALOG_KEY]: JSON.stringify({
      sequence: 2,
      payloadJson: JSON.stringify({ schema_version: 'lqd-catalog/v99', sequence: 2 }),
      verifiedAt: 1,
    }),
  });
  assert.equal(await getLastVerifiedElCatalog({ storage }), null);
});

test('getLastVerifiedElCatalog returns null when nothing is stored', async () => {
  const storage = createMemoryStorage();
  assert.equal(await getLastVerifiedElCatalog({ storage }), null);
});

test('shape rejection (non-envelope body) returns last-good', async () => {
  const storage = createMemoryStorage({ [LAST_CATALOG_KEY]: storedCatalogState(6) });
  const fetcher = makeFetch({ not: 'an envelope' });
  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn: fetcher.fetchFn,
    storage,
    getKeys,
    isVerificationSupported: supported,
  });
  assert.ok(catalog);
  assert.equal(catalog.sequence, 6);
});

test('default getKeys (un-injected) verifies the pinned-kid catalog with ZERO JWKS fetches', async () => {
  // Exercises the DEFAULT trust-store composition: no `getKeys` override, so refreshElCatalog
  // falls through to defaultGetKeys -> getElKeys() -> pinned JWKS. The dev fixture envelope is
  // signed with the pinned `lqd-dev-2026-a` kid, so the pinned path must satisfy verification
  // WITHOUT ever hitting the /.well-known/keys.json discovery endpoint.
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();

  const jwksUrl = 'https://media.example.test/.well-known/keys.json';
  let catalogFetches = 0;
  let jwksFetches = 0;
  const fetchFn = (async (url: string) => {
    if (url.includes('/.well-known/keys.json')) {
      jwksFetches += 1;
      return {
        ok: true,
        json: async () => ({ keys: jwks }),
      } as unknown as Response;
    }
    catalogFetches += 1;
    return {
      ok: true,
      json: async () => catalogEnvelope,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const catalog = await refreshElCatalog(CATALOG_URL, {
    fetchFn,
    storage,
    // getKeys intentionally NOT injected — prove defaultGetKeys pinned-first wiring works.
    isVerificationSupported: supported,
  });

  assert.ok(catalog, 'catalog should verify and parse via the pinned trust store');
  assert.equal(catalog.schemaVersion, 'lqd-catalog/v1');
  assert.equal(catalog.sequence, 1);
  assert.equal(catalog.translations[0].translationId, 'lqdtest');
  assert.equal(catalogFetches, 1);
  // The whole point: pinned kid means the JWKS discovery URL is never fetched.
  assert.equal(jwksFetches, 0, `expected zero JWKS fetches, got ${jwksFetches} (${jwksUrl})`);

  __resetElJwksRuntimeForTests();
});

test('default getKeys discovers an unknown catalog kid from the catalog origin using injected deps', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const unknownKid = 'lqd-rotated-2027-a';
  const catalogUrl = 'https://example.test/media/catalog.dev.json';
  const jwksUrl = 'https://example.test/.well-known/keys.json';
  const rotatedFixture = createRotatedCatalogFixture(unknownKid);
  let jwksFetches = 0;

  const fetchFn = (async (url: string) => {
    if (url === jwksUrl) {
      jwksFetches += 1;
      return {
        ok: true,
        json: async () => ({ keys: [rotatedFixture.key] }),
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => rotatedFixture.envelope,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const catalog = await refreshElCatalog(catalogUrl, {
    fetchFn,
    storage,
    isVerificationSupported: supported,
  });
  assert.ok(catalog, 'a discovered rotated key must verify a signed catalog');
  assert.equal(catalog.sequence, 1);
  assert.equal(jwksFetches, 1, 'unknown catalog kids must trigger origin-scoped JWKS discovery');
  assert.ok(storage.raw.has('el-media:jwks-cache'), 'JWKS discovery must use the service storage');

  __resetElJwksRuntimeForTests();
});

test('default catalog key discovery is bounded after the catalog fetch succeeds', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const unknownKid = 'lqd-rotated-hanging-a';
  const catalogUrl = 'https://example.test/media/catalog.dev.json';
  const jwksUrl = 'https://example.test/.well-known/keys.json';
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
      json: async () => ({ ...catalogEnvelope, keyId: unknownKid }),
    } as unknown as Response;
  }) as typeof fetch;

  const deadline = Symbol('deadline');
  const result = await Promise.race([
    refreshElCatalog(catalogUrl, {
      fetchFn,
      storage,
      isVerificationSupported: supported,
      timeoutMs: 5,
    }),
    new Promise<typeof deadline>((resolve) => setTimeout(() => resolve(deadline), 500)),
  ]);

  assert.notEqual(result, deadline, 'catalog key discovery must not hang');
  assert.equal(result, null);
  assert.ok(observedSignal, 'catalog key discovery should receive an abort signal');
  __resetElJwksRuntimeForTests();
});
