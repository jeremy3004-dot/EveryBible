/**
 * The text-pack journal recovery that runs after every launch loads
 * cloudTranslationService, which imports this module for SHA-256 only. Importing it
 * and hashing must not load the P-256 implementation; a signature check does.
 *
 * Separate file: each test file runs in its own process, so the module cache starts
 * empty here.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const requireFromTest = createRequire(import.meta.url);
const isCurveLoaded = () =>
  Object.keys(requireFromTest.cache).some((file) => file.includes('/@noble/curves/'));

test('hashing with the ES256 module loads no elliptic-curve code', async () => {
  const { sha256HexSync } = await import('./elEs256.js');

  assert.equal(
    sha256HexSync(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(isCurveLoaded(), false);
});

test('verifying a signature loads the curve and still fails closed on a bad signature', async () => {
  const { verifyEs256CompactJws } = await import('./elEs256.js');
  const encode = (value: string) =>
    Buffer.from(value)
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const coordinate = Buffer.alloc(32, 1).toString('base64url');
  const signature = Buffer.alloc(64, 2).toString('base64url');

  const result = verifyEs256CompactJws(
    `${encode('{"alg":"ES256"}')}.${encode('{}')}.${signature}`,
    { kty: 'EC', crv: 'P-256', x: coordinate, y: coordinate, kid: 'test-key' }
  );

  assert.equal(result, null);
  assert.equal(isCurveLoaded(), true);
});
