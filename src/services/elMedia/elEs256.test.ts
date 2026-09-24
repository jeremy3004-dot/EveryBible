import { test } from 'node:test';
import assert from 'node:assert/strict';
import { p256 } from '@noble/curves/nist.js';

import { createHash } from 'node:crypto';

import {
  base64UrlToBytes,
  sha256HexOfBase64Chunks,
  sha256HexSync,
  verifyEs256CompactJws,
} from './elEs256';

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
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    kid: 'k',
    x: toB64Url(new Uint8Array(32)),
    y: toB64Url(new Uint8Array(32)),
  };
  const sig = toB64Url(new Uint8Array(64));
  const header = toB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: 'k' })));
  const payload = toB64Url(new TextEncoder().encode('{}'));

  // Wrong number of segments.
  assert.equal(verifyEs256CompactJws('a.b', jwk), null);
  // Non-EC / wrong curve keys.
  assert.equal(verifyEs256CompactJws(`${header}.${payload}.${sig}`, { ...jwk, kty: 'RSA' }), null);
  assert.equal(
    verifyEs256CompactJws(`${header}.${payload}.${sig}`, { ...jwk, crv: 'P-384' }),
    null
  );
  // Coordinates that are not exactly 32 bytes.
  assert.equal(
    verifyEs256CompactJws(`${header}.${payload}.${sig}`, {
      ...jwk,
      x: toB64Url(new Uint8Array(31)),
    }),
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

test('verifyEs256CompactJws forces noble to parse the fixed-width compact format', () => {
  // This valid fixture deliberately starts with a DER-looking 0x30, 0x3e prefix. Without an
  // explicit format, noble attempts DER parsing first, which is not the JWS signature format.
  const jwk = {
    kty: 'EC' as const,
    crv: 'P-256' as const,
    kid: 'k',
    x: 'axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY',
    y: 'T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU',
  };
  const compactJws =
    'eyJhbGciOiJFUzI1NiIsImtpZCI6ImsifQ.eyJmaXh0dXJlIjo4ODAyN30.MD4rxQ2f3DDvP4VguR1KIWap4CBz9rsIeYiMx0Q0x7-P2bKp1xwArS-lkyHnZCJRNuxMWBuwSlP3S_dUpP_0GQ';
  const signature = base64UrlToBytes(compactJws.split('.')[2]);
  assert.ok(signature);
  assert.deepEqual(Array.from(signature.slice(0, 2)), [0x30, 0x3e]);

  const originalVerify = p256.verify;
  let options: Parameters<typeof p256.verify>[3] | undefined;
  p256.verify = ((sig, message, publicKey, verifyOptions) => {
    options = verifyOptions;
    return originalVerify(sig, message, publicKey, verifyOptions);
  }) as typeof originalVerify;
  try {
    assert.ok(verifyEs256CompactJws(compactJws, jwk));
  } finally {
    p256.verify = originalVerify;
  }

  assert.deepEqual(options, { format: 'compact', lowS: false });
});

const fileOf = (size: number) => {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 131 + 7) & 0xff;
  return bytes;
};

const chunkReader = (bytes: Uint8Array, reads: { position: number; length: number }[]) => {
  return async (position: number, length: number) => {
    reads.push({ position, length });
    return Buffer.from(bytes.subarray(position, position + length)).toString('base64');
  };
};

test('sha256HexOfBase64Chunks hashes a file in bounded reads and matches Node', async () => {
  for (const size of [0, 1, 5, 6, 7, 1000, 4096, 10_001]) {
    const bytes = fileOf(size);
    const reads: { position: number; length: number }[] = [];
    let yields = 0;

    const digest = await sha256HexOfBase64Chunks({
      size,
      chunkBytes: 6,
      readChunk: chunkReader(bytes, reads),
      yieldToRuntime: async () => {
        yields += 1;
      },
    });

    assert.equal(digest, createHash('sha256').update(bytes).digest('hex'), `size ${size}`);
    assert.ok(
      reads.every(({ length }) => length > 0 && length <= 6),
      'never asks for more than one chunk'
    );
    assert.equal(
      reads.reduce((total, { length }) => total + length, 0),
      size,
      'reads cover the file exactly once and never past the end'
    );
    assert.equal(yields, reads.length, 'yields to the UI thread after every chunk');
  }
});

test('sha256HexOfBase64Chunks returns null for undecodable or short chunks', async () => {
  assert.equal(
    await sha256HexOfBase64Chunks({ size: 10, readChunk: async () => 'not base64!%' }),
    null
  );
  assert.equal(
    await sha256HexOfBase64Chunks({
      size: 10,
      chunkBytes: 6,
      readChunk: async () => Buffer.from([1, 2]).toString('base64'),
    }),
    null,
    'a truncated read must not hash as if the file were complete'
  );
});

test('sha256HexOfBase64Chunks stops as soon as the caller cancels', async () => {
  const reads: { position: number; length: number }[] = [];
  let cancelled = false;
  await assert.rejects(
    sha256HexOfBase64Chunks({
      size: 30,
      chunkBytes: 6,
      readChunk: async (position, length) => {
        const chunk = await chunkReader(fileOf(30), reads)(position, length);
        cancelled = reads.length === 2;
        return chunk;
      },
      throwIfCancelled: () => {
        if (cancelled) throw new Error('cancelled');
      },
    }),
    /cancelled/
  );
  assert.equal(reads.length, 2);
});

test('the default chunk size is a whole number of base64 groups', async () => {
  const bytes = fileOf(1_000_000);
  const reads: { position: number; length: number }[] = [];
  const digest = await sha256HexOfBase64Chunks({
    size: bytes.length,
    readChunk: chunkReader(bytes, reads),
    yieldToRuntime: async () => {},
  });
  assert.equal(digest, createHash('sha256').update(bytes).digest('hex'));
  assert.ok(reads.length > 1, 'a 1MB file is not read in one piece');
  assert.equal(reads[0].length % 3, 0);
});
