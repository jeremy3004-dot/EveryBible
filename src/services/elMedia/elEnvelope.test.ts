import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isElEnvelopeShape, verifyElEnvelope } from './elEnvelope';

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys;
const catalogEnvelope = readJson('catalog.dev.json');
const manifestEnvelope = readJson('manifest-lqdtest.json');

test('accepts well-formed envelope shape and rejects malformed ones', () => {
  assert.equal(isElEnvelopeShape(catalogEnvelope), true);
  assert.equal(isElEnvelopeShape({ keyId: 'x', algorithm: 'RS256', compactJws: 'a.b.c' }), false);
  assert.equal(
    isElEnvelopeShape({ keyId: 'x', algorithm: 'ES256', compactJws: 'not-a-jws' }),
    false
  );
  assert.equal(isElEnvelopeShape(null), false);
});

test('verifies the signed fixture catalog and returns its payload', async () => {
  const payload = (await verifyElEnvelope(catalogEnvelope, jwks)) as Record<string, unknown> | null;
  assert.ok(payload);
  assert.equal(payload.schema_version, 'lqd-catalog/v1');
});

test('verifies the signed fixture manifest through the same code path', async () => {
  const payload = (await verifyElEnvelope(manifestEnvelope, jwks)) as Record<
    string,
    unknown
  > | null;
  assert.ok(payload);
  assert.equal(payload.schema, 'everybible-audio-manifest/v1');
});

test('rejects a tampered compactJws without throwing', async () => {
  const parts = catalogEnvelope.compactJws.split('.');
  const tamperedPayload = parts[1].slice(0, -2) + (parts[1].endsWith('A') ? 'BB' : 'AA');
  const tampered = {
    ...catalogEnvelope,
    compactJws: [parts[0], tamperedPayload, parts[2]].join('.'),
  };
  assert.equal(await verifyElEnvelope(tampered, jwks), null);
});

test('rejects when keyId is not in the key set', async () => {
  assert.equal(await verifyElEnvelope({ ...catalogEnvelope, keyId: 'unknown-kid' }, jwks), null);
});

// Regression: Hermes (React Native) exposes NO globalThis.crypto at all — verified on an
// iOS 26.5 simulator, where `typeof globalThis.crypto` is 'undefined'. Verification previously
// went through `jose`, which requires crypto.subtle, so on-device the EL catalog silently
// resolved to null and no EL translation ever reached the picker. Every existing test passed
// because node:test provides real WebCrypto. This test removes it to model the real runtime.
test('verifies without any globalThis.crypto (Hermes/React Native runtime)', async () => {
  const savedCrypto = globalThis.crypto;
  // @ts-expect-error - deliberately modelling a runtime that has no WebCrypto at all.
  delete globalThis.crypto;
  try {
    assert.equal(globalThis.crypto, undefined);
    const payload = (await verifyElEnvelope(catalogEnvelope, jwks)) as Record<
      string,
      unknown
    > | null;
    assert.ok(payload, 'catalog envelope must verify with no WebCrypto present');
    assert.equal(payload.schema_version, 'lqd-catalog/v1');
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      value: savedCrypto,
      configurable: true,
      writable: true,
    });
  }
});

test('rejects a tampered signature with no globalThis.crypto', async () => {
  const savedCrypto = globalThis.crypto;
  // @ts-expect-error - deliberately modelling a runtime that has no WebCrypto at all.
  delete globalThis.crypto;
  try {
    const parts = catalogEnvelope.compactJws.split('.');
    const tamperedSig = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'BB' : 'AA');
    const tampered = {
      ...catalogEnvelope,
      compactJws: [parts[0], parts[1], tamperedSig].join('.'),
    };
    assert.equal(await verifyElEnvelope(tampered, jwks), null);
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      value: savedCrypto,
      configurable: true,
      writable: true,
    });
  }
});

test('rejects kid/keyId mismatch', async () => {
  // envelope claims the dev kid but we present a key set where that kid maps to a different key
  const wrongKey = {
    ...jwks[0],
    kid: 'lqd-dev-2026-a',
    x: 'FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU',
    y: 'Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM',
  };
  assert.equal(await verifyElEnvelope(catalogEnvelope, [wrongKey]), null);
});

test('rejects non-object values and envelopes with an empty key id', () => {
  assert.equal(isElEnvelopeShape('a.b.c'), false);
  assert.equal(isElEnvelopeShape(42), false);
  assert.equal(isElEnvelopeShape({ keyId: '', algorithm: 'ES256', compactJws: 'a.b.c' }), false);
  assert.equal(isElEnvelopeShape({ keyId: 'x', algorithm: 'ES256', compactJws: 42 }), false);
});

// Signs a compact JWS with a freshly generated P-256 key, so a test can control the
// protected header and payload bytes while still presenting a valid signature.
function signTestEnvelope(options: { headerKid: string; envelopeKid: string; payload: string }) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const encode = (value: string | Buffer) => Buffer.from(value).toString('base64url');
  const signingInput = `${encode(JSON.stringify({ alg: 'ES256', kid: options.headerKid }))}.${encode(options.payload)}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return {
    envelope: {
      keyId: options.envelopeKid,
      algorithm: 'ES256' as const,
      compactJws: `${signingInput}.${encode(signature)}`,
    },
    keys: [
      {
        kty: 'EC',
        crv: 'P-256',
        x: publicJwk.x,
        y: publicJwk.y,
        kid: options.envelopeKid,
      },
    ],
  };
}

test('accepts an envelope signed by a freshly generated key whose header names that key', async () => {
  const { envelope, keys } = signTestEnvelope({
    headerKid: 'test-kid',
    envelopeKid: 'test-kid',
    payload: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await verifyElEnvelope(envelope, keys), { ok: true });
});

test('rejects a validly signed envelope whose protected header names a different key', async () => {
  const { envelope, keys } = signTestEnvelope({
    headerKid: 'someone-else',
    envelopeKid: 'test-kid',
    payload: JSON.stringify({ ok: true }),
  });
  assert.equal(await verifyElEnvelope(envelope, keys), null);
});

test('returns null instead of throwing for a validly signed payload that is not JSON', async () => {
  const { envelope, keys } = signTestEnvelope({
    headerKid: 'test-kid',
    envelopeKid: 'test-kid',
    payload: 'not json {',
  });
  assert.equal(await verifyElEnvelope(envelope, keys), null);
});
