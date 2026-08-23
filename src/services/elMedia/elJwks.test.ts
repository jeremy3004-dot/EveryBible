import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EL_PINNED_JWKS,
  getElKeys,
  refreshElJwksForUnknownKeyId,
  __resetElJwksRuntimeForTests,
} from './elJwks';
import type { ElJwk } from './elEnvelope';

const PINNED_DEV_KID = 'lqd-dev-2026-a';
const PINNED_PROD_KID = 'lqd-prod-2026-a';

const remoteKey: ElJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
  y: 'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
  kid: 'lqd-prod-2027-a',
  alg: 'ES256',
  use: 'sig',
};

interface MemoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

function makeFetch(body: unknown, ok = true) {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return {
      ok,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return {
    fetchFn,
    get calls() {
      return calls;
    },
  };
}

test('EL_PINNED_JWKS pins exactly the prod + dev keys from the contract', () => {
  const kids = EL_PINNED_JWKS.map((k) => k.kid).sort();
  assert.deepEqual(kids, [PINNED_DEV_KID, PINNED_PROD_KID]);
  for (const key of EL_PINNED_JWKS) {
    assert.equal(key.kty, 'EC');
    assert.equal(key.crv, 'P-256');
    assert.equal(key.alg, 'ES256');
    assert.ok(key.x && key.y);
  }
});

test('getElKeys returns pinned keys first, deduped by kid', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const keys = await getElKeys({ storage });
  const kids = keys.map((k) => k.kid);
  assert.deepEqual(kids.sort(), [PINNED_DEV_KID, PINNED_PROD_KID]);
});

test('unknown keyId triggers exactly one fetch and caches the discovered key', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch({ keys: [remoteKey] });
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(keys.some((k) => k.kid === 'lqd-prod-2027-a'));
  assert.ok(keys.some((k) => k.kid === PINNED_PROD_KID));
});

test('passes an abort signal and falls back when JWKS discovery hangs', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  let observedSignal: AbortSignal | undefined;

  const hangingFetch = ((_url: string, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  }) as typeof fetch;

  const startedAt = Date.now();
  const keys = await refreshElJwksForUnknownKeyId('unknown-key', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: hangingFetch,
    timeoutMs: 5,
  });

  assert.ok(observedSignal, 'JWKS discovery should receive an abort signal');
  assert.ok(Date.now() - startedAt < 1_000, 'JWKS discovery should be bounded');
  assert.deepEqual(keys.map((key) => key.kid).sort(), [PINNED_DEV_KID, PINNED_PROD_KID].sort());
});

test('known (pinned) keyId triggers no fetch', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch({ keys: [remoteKey] });
  await refreshElJwksForUnknownKeyId(PINNED_PROD_KID, {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
  });
  assert.equal(fetcher.calls, 0);
});

test('a second unknown-kid refresh for the same kid does not refetch in one launch', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch({ keys: [remoteKey] });
  const deps = {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
  };
  await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', deps);
  await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', deps);
  assert.equal(fetcher.calls, 1);
});

test('malformed JWKS response leaves the pinned set intact and never throws', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const fetcher = makeFetch({ keys: [{ kty: 'oct' }, { kid: 'no-kty' }, 'garbage'] });
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
  });
  const kids = keys.map((k) => k.kid).sort();
  assert.deepEqual(kids, [PINNED_DEV_KID, PINNED_PROD_KID]);
});

test('a remote EC key on a non-P-256 curve is filtered out of the trust set', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const p384Key = {
    kty: 'EC',
    crv: 'P-384',
    x: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    y: 'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
    kid: 'lqd-prod-2028-a',
    alg: 'ES384',
    use: 'sig',
  };
  const fetcher = makeFetch({ keys: [p384Key] });
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2028-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(!keys.some((k) => k.kid === 'lqd-prod-2028-a'));
  assert.deepEqual(keys.map((k) => k.kid).sort(), [PINNED_DEV_KID, PINNED_PROD_KID]);
});

test('a fetch that rejects returns the keys we had without throwing', async () => {
  __resetElJwksRuntimeForTests();
  const storage = createMemoryStorage();
  const throwingFetch = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: throwingFetch,
  });
  assert.deepEqual(keys.map((k) => k.kid).sort(), [PINNED_DEV_KID, PINNED_PROD_KID]);
});

test('a fresh cache in storage is honored without a new fetch (TTL respected)', async () => {
  __resetElJwksRuntimeForTests();
  const now = 1_000_000_000_000;
  const storage = createMemoryStorage({
    'el-media:jwks-cache': JSON.stringify({ keys: [remoteKey], fetchedAt: now - 1000 }),
  });
  const fetcher = makeFetch({ keys: [remoteKey] });
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
    now: () => now,
  });
  assert.equal(fetcher.calls, 0);
  assert.ok(keys.some((k) => k.kid === 'lqd-prod-2027-a'));
});

test('an expired cache in storage is refetched (TTL respected)', async () => {
  __resetElJwksRuntimeForTests();
  const now = 1_000_000_000_000;
  const dayMs = 24 * 60 * 60 * 1000;
  const storage = createMemoryStorage({
    'el-media:jwks-cache': JSON.stringify({ keys: [], fetchedAt: now - dayMs - 1 }),
  });
  const fetcher = makeFetch({ keys: [remoteKey] });
  const keys = await refreshElJwksForUnknownKeyId('lqd-prod-2027-a', {
    baseUrl: 'https://example.test',
    storage,
    fetchFn: fetcher.fetchFn,
    now: () => now,
  });
  assert.equal(fetcher.calls, 1);
  assert.ok(keys.some((k) => k.kid === 'lqd-prod-2027-a'));
});

test('getElKeys merges a cached remote key from storage after pinned keys', async () => {
  __resetElJwksRuntimeForTests();
  const now = 1_000_000_000_000;
  const storage = createMemoryStorage({
    'el-media:jwks-cache': JSON.stringify({ keys: [remoteKey], fetchedAt: now }),
  });
  const keys = await getElKeys({ storage, now: () => now });
  assert.equal(keys[0].kid, PINNED_PROD_KID);
  assert.ok(keys.some((k) => k.kid === 'lqd-prod-2027-a'));
});
