import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveElCatalogUrl } from './elMediaConfig';

const BASE = 'https://lqd-media.platform-979.workers.dev';

test('returns null when the feature flag is disabled', () => {
  assert.equal(resolveElCatalogUrl({ baseUrl: BASE, isDev: true, isFlagEnabled: false }), null);
});

test('returns null when the base URL is missing, blank, or wrong scheme', () => {
  assert.equal(resolveElCatalogUrl({ baseUrl: undefined, isFlagEnabled: true }), null);
  assert.equal(resolveElCatalogUrl({ baseUrl: null, isFlagEnabled: true }), null);
  assert.equal(resolveElCatalogUrl({ baseUrl: '', isFlagEnabled: true }), null);
  assert.equal(resolveElCatalogUrl({ baseUrl: '   ', isFlagEnabled: true }), null);
  assert.equal(resolveElCatalogUrl({ baseUrl: 'ftp://example.com', isFlagEnabled: true }), null);
  assert.equal(resolveElCatalogUrl({ baseUrl: 'example.com', isFlagEnabled: true }), null);
});

test('plaintext http base URLs are rejected in dev and in production', () => {
  // The catalog bytes are fetched before the signature is verified, so an http origin
  // hands a network attacker the input to the verifier. https only, always.
  for (const isDev of [true, false]) {
    assert.equal(
      resolveElCatalogUrl({ baseUrl: 'http://lqd-media.example.test', isDev, isFlagEnabled: true }),
      null
    );
    assert.equal(
      resolveElCatalogUrl({ baseUrl: 'http://localhost:8787', isDev, isFlagEnabled: true }),
      null
    );
  }
});

test('accepts an uppercase HTTPS scheme', () => {
  assert.equal(
    resolveElCatalogUrl({ baseUrl: 'HTTPS://example.test', isDev: false, isFlagEnabled: true }),
    'HTTPS://example.test/catalog.json'
  );
});

test('appends /catalog.dev.json in dev when flag enabled and base URL valid', () => {
  assert.equal(
    resolveElCatalogUrl({ baseUrl: BASE, isDev: true, isFlagEnabled: true }),
    `${BASE}/catalog.dev.json`
  );
});

test('appends /catalog.json in production when flag enabled and base URL valid', () => {
  assert.equal(
    resolveElCatalogUrl({ baseUrl: BASE, isDev: false, isFlagEnabled: true }),
    `${BASE}/catalog.json`
  );
});

test('strips trailing slashes from the base URL before appending the path', () => {
  assert.equal(
    resolveElCatalogUrl({ baseUrl: `${BASE}///`, isDev: false, isFlagEnabled: true }),
    `${BASE}/catalog.json`
  );
  assert.equal(
    resolveElCatalogUrl({ baseUrl: `${BASE}/`, isDev: true, isFlagEnabled: true }),
    `${BASE}/catalog.dev.json`
  );
});

test('defaults (no deps) resolve to null under test env because the flag is off', () => {
  // Do not assert the __DEV__ default beyond flag-off inertness: node --test has no __DEV__.
  assert.equal(resolveElCatalogUrl(), null);
});
