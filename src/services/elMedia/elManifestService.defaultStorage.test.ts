import { beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { ElCatalogTranslation } from './elCatalogModel';
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

const fixturesDir = new URL('./fixtures/', import.meta.url);
const readFixture = (name: string) => readFileSync(fileURLToPath(new URL(name, fixturesDir).href));
const jwks = JSON.parse(readFixture('dev.jwks.json').toString('utf8')).keys as ElJwk[];
const manifestBytes = new Uint8Array(readFixture('manifest-lqdtest.json'));

const entry: ElCatalogTranslation = {
  translationId: 'lqdtest',
  languageIso6393: 'eng',
  languageName: 'English (EL test)',
  translationName: 'EL Test Translation',
  abbreviation: 'LQTEST',
  source: 'langquest',
  copyright: 'CC0-1.0',
  deliveryMode: 'chapter',
  hasAudio: true,
  currentAudioVersion: 'v2026-07-20-1',
  manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
  manifestSha256: 'adbb4675d4afa29e851f4a9055a9fcfb61f13ae4a0da6c982694dd11c9a03fac',
};
const CATALOG_BASE_URL = 'https://media.example.test';

let fetches = 0;
const fetchFn = (async () => {
  fetches += 1;
  return {
    ok: true,
    arrayBuffer: async () =>
      manifestBytes.buffer.slice(
        manifestBytes.byteOffset,
        manifestBytes.byteOffset + manifestBytes.byteLength
      ),
  } as unknown as Response;
}) as unknown as typeof fetch;
const deps = { fetchFn, getKeys: async () => jwks };

const loadService = () => import('./elManifestService');

beforeEach(async () => {
  (await loadService()).__resetElManifestRuntimeForTests();
  mmkv.clear();
  mmkvState.broken = false;
  fetches = 0;
});

test('a verified manifest is persisted to MMKV and served from it after a relaunch', async () => {
  const { getElManifest, __resetElManifestRuntimeForTests } = await loadService();

  const first = await getElManifest(entry, CATALOG_BASE_URL, deps);
  assert.equal(first?.translationId, 'lqdtest');
  const keys = [...mmkv.keys()];
  assert.equal(keys.length, 1);
  assert.match(keys[0] as string, /^el-media:manifest:[0-9a-f]{64}$/);

  __resetElManifestRuntimeForTests();
  const afterRelaunch = await getElManifest(entry, CATALOG_BASE_URL, deps);

  assert.deepEqual(afterRelaunch, first);
  assert.equal(fetches, 1);
});

test('an unusable MMKV neither blocks nor breaks manifest resolution', async () => {
  const { getElManifest } = await loadService();
  mmkvState.broken = true;

  const manifest = await getElManifest(entry, CATALOG_BASE_URL, deps);

  assert.equal(manifest?.audioVersion, 'v2026-07-20-1');
  assert.equal(fetches, 1);
  assert.equal(mmkv.size, 0);
});
