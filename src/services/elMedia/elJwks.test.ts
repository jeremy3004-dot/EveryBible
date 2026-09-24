import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { mockMmkvStorage } from '../../testing/mockModules';
import { EL_PINNED_JWKS, getElKeys, __resetElJwksRuntimeForTests } from './elJwks';

// elJwks requires mmkvStorage lazily (at call time), so this module-scope mock is in place
// before the first getElKeys() call even though the import above is static.
const mmkv = mockMmkvStorage(mock);
const LEGACY_JWKS_CACHE_KEY = 'el-media:jwks-cache';

const PINNED_DEV_KID = 'lqd-dev-2026-a';
const PINNED_PROD_KID = 'lqd-prod-2026-a';

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

test('getElKeys returns the pinned trust set and nothing else', async () => {
  __resetElJwksRuntimeForTests();
  const keys = await getElKeys();
  assert.deepEqual(keys.map((k) => k.kid).sort(), [PINNED_DEV_KID, PINNED_PROD_KID]);
});

test('getElKeys hands back a copy — callers cannot mutate the pinned trust set', async () => {
  __resetElJwksRuntimeForTests();
  const keys = await getElKeys();
  keys.push({
    kty: 'EC',
    crv: 'P-256',
    x: 'ZZZZ',
    y: 'YYYY',
    kid: 'attacker-key',
    alg: 'ES256',
    use: 'sig',
  });

  const fresh = await getElKeys();
  assert.ok(!fresh.some((k) => k.kid === 'attacker-key'));
  assert.equal(EL_PINNED_JWKS.length, 2);
});

test('the module exposes no remote JWKS discovery surface', async () => {
  const mod: Record<string, unknown> = await import('./elJwks');
  assert.equal(
    mod.refreshElJwksForUnknownKeyId,
    undefined,
    'remote JWKS discovery must not exist — rotation requires an app update'
  );
});

test('getElKeys performs no network call for an unknown kid', async () => {
  __resetElJwksRuntimeForTests();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    throw new Error('no network expected');
  }) as typeof fetch;

  try {
    const keys = await getElKeys();
    assert.ok(!keys.some((k) => k.kid === 'lqd-prod-2027-a'));
    assert.equal(fetches, 0, 'an unknown kid must never trigger a JWKS fetch');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a key cached by the old discovery path is purged and never trusted', async () => {
  __resetElJwksRuntimeForTests();
  const poisoned = {
    kty: 'EC',
    crv: 'P-256',
    x: 'ZZZZ',
    y: 'YYYY',
    kid: 'attacker-key',
    alg: 'ES256',
    use: 'sig',
  };
  mmkv.store.set(
    LEGACY_JWKS_CACHE_KEY,
    JSON.stringify({ keys: [poisoned], fetchedAt: Date.now() })
  );
  const writes = mock.method(mmkv.mmkvInstance, 'set');

  const keys = await getElKeys();

  assert.equal(mmkv.store.has(LEGACY_JWKS_CACHE_KEY), false, 'the legacy cache is deleted');
  assert.ok(!keys.some((key) => key.kid === 'attacker-key'), 'a cached key is never read back');
  assert.equal(writes.mock.callCount(), 0, 'no key material is persisted');
  writes.mock.restore();
});

test('the legacy cache purge runs once per launch', async () => {
  __resetElJwksRuntimeForTests();
  await getElKeys();
  mmkv.store.set(LEGACY_JWKS_CACHE_KEY, 'written-after-launch');

  await getElKeys();

  assert.equal(mmkv.store.get(LEGACY_JWKS_CACHE_KEY), 'written-after-launch');
});
