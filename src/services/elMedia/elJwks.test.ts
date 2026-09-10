import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EL_PINNED_JWKS, getElKeys, __resetElJwksRuntimeForTests } from './elJwks';

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
  assert.deepEqual(
    keys.map((k) => k.kid).sort(),
    [PINNED_DEV_KID, PINNED_PROD_KID]
  );
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

test('the source no longer reads the legacy JWKS discovery cache', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const source = readFileSync(fileURLToPath(new URL('./elJwks.ts', import.meta.url).href), 'utf8');

  assert.ok(!/getItem\(/.test(source), 'elJwks must not read any cached key material');
  assert.ok(!/setItem\(/.test(source), 'elJwks must not persist any key material');
  assert.ok(
    /mmkvInstance\.delete\(/.test(source),
    'elJwks must purge the legacy discovery cache so a poisoned key cannot linger'
  );
});
