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
  assert.equal(
    resolveElCatalogUrl({ baseUrl: 'ftp://example.com', isFlagEnabled: true }),
    null
  );
  assert.equal(
    resolveElCatalogUrl({ baseUrl: 'example.com', isFlagEnabled: true }),
    null
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
