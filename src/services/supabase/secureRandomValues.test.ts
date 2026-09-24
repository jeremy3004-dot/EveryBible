import test from 'node:test';
import assert from 'node:assert/strict';
import { installSecureRandomValues, type RandomFiller } from './secureRandomValues';

const fillWith =
  (byte: number): RandomFiller =>
  (array) => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(byte);
    return array;
  };

test('a runtime without crypto (Hermes) gets getRandomValues from the native provider', () => {
  const target: { crypto?: unknown } = {};
  let providerLoads = 0;

  const installed = installSecureRandomValues(target, () => {
    providerLoads += 1;
    return fillWith(0xab);
  });

  assert.equal(installed, true);
  assert.equal(providerLoads, 1);
  const crypto = target.crypto as { getRandomValues: RandomFiller; subtle?: unknown };
  const words = crypto.getRandomValues(new Uint32Array(2));
  assert.deepEqual(Array.from(words), [0xabababab, 0xabababab]);
  // No `subtle`: auth-js getClaims() and other WebCrypto users must keep
  // seeing "no WebCrypto" rather than a half-implemented one.
  assert.equal('subtle' in crypto, false);
});

test('an existing crypto object keeps its own getRandomValues and the provider is never loaded', () => {
  const original = fillWith(1);
  const target = { crypto: { getRandomValues: original } };

  const installed = installSecureRandomValues(target, () => {
    throw new Error('must not load the native module');
  });

  assert.equal(installed, false);
  assert.equal(target.crypto.getRandomValues, original);
});

test('a crypto object without getRandomValues gains one without losing its other members', () => {
  const randomUUID = () => 'uuid';
  const target: { crypto: { randomUUID: () => string; getRandomValues?: RandomFiller } } = {
    crypto: { randomUUID },
  };

  assert.equal(
    installSecureRandomValues(target, () => fillWith(2)),
    true
  );
  assert.equal(target.crypto.randomUUID, randomUUID);
  assert.equal(typeof target.crypto.getRandomValues, 'function');
});

test('a provider that cannot load leaves the runtime untouched instead of crashing', () => {
  const target: { crypto?: unknown } = {};

  assert.equal(
    installSecureRandomValues(target, () => {
      throw new Error('native module missing');
    }),
    false
  );
  assert.equal(target.crypto, undefined);
});
