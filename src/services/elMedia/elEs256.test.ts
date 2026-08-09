import { test } from 'node:test';
import assert from 'node:assert/strict';

import { base64UrlToBytes, sha256HexSync, verifyEs256CompactJws } from './elEs256';

const toB64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

test('base64UrlToBytes matches Node for every length remainder', () => {
  // Lengths 0..64 cover all four length-mod-4 cases plus the empty input.
  for (let length = 0; length <= 64; length += 1) {
    const original = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) original[i] = (i * 37 + length) & 0xff;

    const decoded = base64UrlToBytes(toB64Url(original));
    assert.ok(decoded, `length ${length} must decode`);
    assert.deepEqual(Array.from(decoded), Array.from(original), `round-trip failed at ${length}`);
  }
});

test('base64UrlToBytes covers the full byte range and both URL-safe characters', () => {
  const allBytes = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) allBytes[i] = i;
  const encoded = toB64Url(allBytes);
  // 0xFB/0xFF-style bytes force '-' and '_' into the encoding; assert we actually exercise them.
  assert.ok(encoded.includes('-') && encoded.includes('_'), 'fixture must exercise - and _');
  assert.deepEqual(Array.from(base64UrlToBytes(encoded) ?? []), Array.from(allBytes));
});

test('base64UrlToBytes tolerates padding and rejects invalid input', () => {
  assert.deepEqual(Array.from(base64UrlToBytes('YWJj') ?? []), [97, 98, 99]);
  assert.deepEqual(Array.from(base64UrlToBytes('YWJjZA==') ?? []), [97, 98, 99, 100]);
  // Standard-base64 characters are NOT valid base64url.
  assert.equal(base64UrlToBytes('YW+j'), null);
  assert.equal(base64UrlToBytes('YW/j'), null);
  assert.equal(base64UrlToBytes('not valid!'), null);
  // A remainder of 1 cannot be produced by any byte sequence.
  assert.equal(base64UrlToBytes('YWJjZ'), null);
  assert.deepEqual(Array.from(base64UrlToBytes('') ?? []), []);
});

test('sha256HexSync matches known SHA-256 vectors', () => {
  const encoder = new TextEncoder();
  assert.equal(
    sha256HexSync(encoder.encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    sha256HexSync(encoder.encode('')),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('verifyEs256CompactJws rejects malformed keys, signatures, and headers', () => {
  const jwk = { kty: 'EC', crv: 'P-256', kid: 'k', x: toB64Url(new Uint8Array(32)), y: toB64Url(new Uint8Array(32)) };
  const sig = toB64Url(new Uint8Array(64));
  const header = toB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: 'k' })));
  const payload = toB64Url(new TextEncoder().encode('{}'));

  // Wrong number of segments.
  assert.equal(verifyEs256CompactJws('a.b', jwk), null);
  // Non-EC / wrong curve keys.
  assert.equal(verifyEs256CompactJws(`${header}.${payload}.${sig}`, { ...jwk, kty: 'RSA' }), null);
  assert.equal(verifyEs256CompactJws(`${header}.${payload}.${sig}`, { ...jwk, crv: 'P-384' }), null);
  // Coordinates that are not exactly 32 bytes.
  assert.equal(
    verifyEs256CompactJws(`${header}.${payload}.${sig}`, { ...jwk, x: toB64Url(new Uint8Array(31)) }),
    null
  );
  // Signature that is not exactly 64 bytes (e.g. a DER-encoded one).
  assert.equal(
    verifyEs256CompactJws(`${header}.${payload}.${toB64Url(new Uint8Array(70))}`, jwk),
    null
  );
  // alg must be ES256 in the SIGNED header, not merely claimed by the envelope.
  const noneHeader = toB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'none', kid: 'k' })));
  assert.equal(verifyEs256CompactJws(`${noneHeader}.${payload}.${sig}`, jwk), null);
  // Header that is not JSON at all.
  assert.equal(verifyEs256CompactJws(`${payload}.${payload}.${sig}`, jwk), null);
});
