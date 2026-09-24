import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { ElJwk } from './elEnvelope';

// No `storage` dep is injected anywhere in this file: these tests cover the production MMKV
// adapter, which the service reaches through a guarded require of stores/mmkvStorage.
const mmkv = new Map<string, string>();
const mmkvState = { broken: false };
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance: {
    getString: (key: string) => {
      if (mmkvState.broken) throw new Error('MMKV unavailable');
      return mmkv.get(key);
    },
    set: (key: string, value: string) => {
      if (mmkvState.broken) throw new Error('MMKV unavailable');
      mmkv.set(key, value);
    },
  },
});

const LAST_CATALOG_KEY = 'el-media:last-catalog';
const CATALOG_URL = 'https://example.test/catalog.dev.json';
const fixturesDir = new URL('./fixtures/', import.meta.url);
const readJson = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, fixturesDir).href), 'utf8'));
const jwks = readJson('dev.jwks.json').keys as ElJwk[];
const catalogEnvelope = readJson('catalog.dev.json');

let fetches = 0;
const fetchFn = (async () => {
  fetches += 1;
  return { ok: true, json: async () => catalogEnvelope } as unknown as Response;
}) as unknown as typeof fetch;
const deps = { fetchFn, getKeys: async () => jwks };

const loadService = () => import('./elCatalogService');

beforeEach(() => {
  mmkv.clear();
  mmkvState.broken = false;
  fetches = 0;
});

test('a verified catalog is persisted to MMKV and readable as the last verified catalog', async () => {
  const { refreshElCatalog, getLastVerifiedElCatalog } = await loadService();

  const refreshed = await refreshElCatalog(CATALOG_URL, deps);

  assert.equal(refreshed?.sequence, 1);
  assert.equal(JSON.parse(mmkv.get(LAST_CATALOG_KEY) as string).sequence, 1);
  assert.deepEqual(await getLastVerifiedElCatalog(), refreshed);
});

test('with nothing in MMKV there is no last verified catalog', async () => {
  const { getLastVerifiedElCatalog } = await loadService();

  assert.equal(await getLastVerifiedElCatalog(), null);
});

test('an unusable MMKV still returns the freshly verified catalog for this launch', async () => {
  const { refreshElCatalog, getLastVerifiedElCatalog } = await loadService();
  mmkvState.broken = true;

  const refreshed = await refreshElCatalog(CATALOG_URL, deps);

  assert.equal(refreshed?.translations[0]?.translationId, 'lqdtest');
  assert.equal(fetches, 1);
  assert.equal(await getLastVerifiedElCatalog(), null);
});
