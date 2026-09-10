/**
 * Covers the DEFAULTS of `applyElRuntimeCatalog` — the paths `runtimeElCatalog.test.ts` bypasses
 * by injecting every dependency.
 *
 * The three lazily imported modules are replaced by absolute path, so `defaultElStep` runs for
 * real (both dynamic imports, the `refreshElCatalog → getLastVerifiedElCatalog` fallback and the
 * null-catalog short circuit) without loading `jose`, and the default store apply resolves
 * through the mocked `bibleStore`.
 *
 * `resolveElCatalogUrl` is the REAL resolver: the EL env vars are cleared before the module
 * graph loads, so the un-injected resolver returns null exactly as it does in a flag-off build.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import { mockModule, sourcePath } from '../../testing/mockModules';

delete process.env.EXPO_PUBLIC_EL_MEDIA_SOURCE;
delete process.env.EXPO_PUBLIC_EL_MEDIA_BASE_URL;

// ─── Lazily imported collaborators ────────────────────────────────────────────

interface FakeCatalog {
  id: string;
}

const catalogCalls: string[] = [];
let refreshResult: (url: string) => Promise<FakeCatalog | null> = async () => null;
let lastVerifiedResult: () => Promise<FakeCatalog | null> = async () => null;
let mappedTranslations: BibleTranslation[] = [];

mockModule(mock, sourcePath('services/elMedia/elCatalogService.ts'), {
  refreshElCatalog: async (url: string) => {
    catalogCalls.push(`refresh:${url}`);
    return refreshResult(url);
  },
  getLastVerifiedElCatalog: async () => {
    catalogCalls.push('lastVerified');
    return lastVerifiedResult();
  },
});

mockModule(mock, sourcePath('services/elMedia/elTranslationMapping.ts'), {
  mapElCatalogToBibleTranslations: (catalog: FakeCatalog) => {
    catalogCalls.push(`map:${catalog.id}`);
    return mappedTranslations;
  },
});

const storeApplies: BibleTranslation[][] = [];
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: {
    getState: () => ({
      applyRuntimeCatalog: (translations: BibleTranslation[]) => {
        storeApplies.push(translations);
      },
    }),
  },
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CATALOG_URL = 'https://lqd-media.example.com/catalog.dev.json';

function makeTranslation(id: string): BibleTranslation {
  return {
    id,
    name: `EL ${id}`,
    abbreviation: id.toUpperCase(),
    language: 'Test Language',
    description: 'autonym',
    copyright: 'Public Domain audio (CC0 1.0)',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 0,
    sizeInMB: 0,
    hasText: false,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'remote-only',
  } as BibleTranslation;
}

type ElCatalogModule = typeof import('./runtimeElCatalog');
let elCatalogModule: ElCatalogModule;
const loadModule = async (): Promise<ElCatalogModule> => {
  elCatalogModule ??= await import('./runtimeElCatalog');
  return elCatalogModule;
};

function reset() {
  catalogCalls.length = 0;
  storeApplies.length = 0;
  refreshResult = async () => null;
  lastVerifiedResult = async () => null;
  mappedTranslations = [];
}

// ─── Default resolver ─────────────────────────────────────────────────────────

test('the default resolver keeps EL inert in a flag-off build', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();

  const merged = await applyElRuntimeCatalog([makeTranslation('bsb')]);

  assert.equal(merged, false);
  assert.deepEqual(catalogCalls, [], 'the heavy catalog modules must never load without the flag');
  assert.deepEqual(storeApplies, []);
});

// ─── Default EL step ──────────────────────────────────────────────────────────

test('the default step fetches, maps and merges a freshly verified catalog', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();
  refreshResult = async () => ({ id: 'fresh' });
  mappedTranslations = [makeTranslation('el-lqdtest')];

  const merged = await applyElRuntimeCatalog([makeTranslation('bsb')], {
    resolveUrl: () => CATALOG_URL,
    applyRuntimeCatalog: (list) => storeApplies.push(list),
  });

  assert.equal(merged, true);
  assert.deepEqual(catalogCalls, [`refresh:${CATALOG_URL}`, 'map:fresh']);
  assert.deepEqual(
    storeApplies.at(-1)?.map((entry) => entry.id),
    ['bsb', 'el-lqdtest'],
    'the combined list is applied so the Supabase rows are not pruned'
  );
});

test('the default step falls back to the last verified catalog when the refresh yields nothing', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();
  refreshResult = async () => null;
  lastVerifiedResult = async () => ({ id: 'cached' });
  mappedTranslations = [makeTranslation('el-lqdtest')];

  const merged = await applyElRuntimeCatalog([], {
    resolveUrl: () => CATALOG_URL,
    applyRuntimeCatalog: (list) => storeApplies.push(list),
  });

  assert.equal(merged, true, 'a cached catalog keeps previously loaded audio available offline');
  assert.deepEqual(catalogCalls, [`refresh:${CATALOG_URL}`, 'lastVerified', 'map:cached']);
});

test('the default step maps nothing when neither a fresh nor a cached catalog exists', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();

  const merged = await applyElRuntimeCatalog([], {
    resolveUrl: () => CATALOG_URL,
    applyRuntimeCatalog: (list) => storeApplies.push(list),
  });

  assert.equal(merged, false);
  assert.deepEqual(catalogCalls, [`refresh:${CATALOG_URL}`, 'lastVerified']);
  assert.deepEqual(storeApplies, [], 'no catalog means no apply, so nothing can be pruned');
});

test('a throwing default step is swallowed and reported as an unmerged refresh', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();
  refreshResult = async () => {
    throw new Error('signature verification failed');
  };

  const merged = await applyElRuntimeCatalog([makeTranslation('bsb')], {
    resolveUrl: () => CATALOG_URL,
    applyRuntimeCatalog: (list) => storeApplies.push(list),
  });

  assert.equal(merged, false);
  assert.deepEqual(storeApplies, []);
});

// ─── Default store apply ──────────────────────────────────────────────────────

test('with no apply injected the merge is written straight to the bible store', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();
  refreshResult = async () => ({ id: 'fresh' });
  mappedTranslations = [makeTranslation('el-lqdtest')];

  const merged = await applyElRuntimeCatalog([makeTranslation('bsb')], {
    resolveUrl: () => CATALOG_URL,
  });

  assert.equal(merged, true);
  assert.equal(storeApplies.length, 1, 'the store is resolved lazily, only once rows exist');
  assert.deepEqual(
    storeApplies[0].map((entry) => entry.id),
    ['bsb', 'el-lqdtest']
  );
});

// ─── Dev diagnostics ──────────────────────────────────────────────────────────

test('a merge failure is logged in a development build', async () => {
  reset();
  const { applyElRuntimeCatalog } = await loadModule();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;

  try {
    await applyElRuntimeCatalog([], {
      resolveUrl: () => CATALOG_URL,
      elStep: async () => {
        throw new Error('network down');
      },
      applyRuntimeCatalog: () => {},
    });
  } finally {
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /EL runtime catalog merge failed/);
});
