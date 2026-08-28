import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import type { TranslationCatalogEntry } from '../supabase/types';
import { mergeRuntimeCatalogTranslations } from '../../stores/bibleStoreModel';
import { refreshRuntimeCatalog } from './runtimeCatalogRefresh';
import type { ElBootstrapStep } from './runtimeElCatalog';

function makeCatalogEntry(translationId: string): TranslationCatalogEntry {
  return {
    id: `row-${translationId}`,
    translation_id: translationId,
    name: `Supabase ${translationId}`,
    abbreviation: translationId.toUpperCase(),
    language_code: 'en',
    language_name: 'English',
    license_type: 'Public Domain',
    license_url: null,
    source_url: null,
    has_audio: false,
    has_text: true,
    is_bundled: false,
    is_available: true,
    sort_order: 1,
    catalog: {
      version: '2026.01.01',
      updatedAt: '2026-01-01T00:00:00.000Z',
      text: {
        format: 'sqlite',
        version: '2026.01.01',
        downloadUrl: 'https://cdn.example.com/x.sqlite',
        sha256: 'sha256-x',
      },
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

// Mirrors what mapElCatalogToBibleTranslations produces: a runtime, audio-only, NOT downloaded
// row with an `el-`/`lq` prefixed id. Not-downloaded runtime rows are exactly what
// mergeRuntimeCatalogTranslations prunes, which is why an EL-less apply wipes them.
function makeElRuntime(id: string): BibleTranslation {
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
    catalog: {
      version: 'v1',
      updatedAt: '',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: '/m.json',
        audioVersion: 'v1',
        catalogBaseUrl: 'https://lqd-media.example.com',
        fileExtension: 'mp3',
      },
    },
    activeDownloadJob: null,
  };
}

// Stands in for the zustand store: applyRuntimeCatalog runs the real merge reducer so the
// pruning semantics under test are the production ones.
function makeFakeStore(initialTranslations: BibleTranslation[]) {
  let translations = initialTranslations;
  let applyCount = 0;

  return {
    getStoreTranslations: () => translations,
    applyRuntimeCatalog: (runtimeTranslations: BibleTranslation[]) => {
      applyCount += 1;
      translations = mergeRuntimeCatalogTranslations(translations, runtimeTranslations);
    },
    get translations() {
      return translations;
    },
    get applyCount() {
      return applyCount;
    },
  };
}

test('a Supabase-only apply prunes EL runtime rows (the by-design model behaviour being guarded against)', () => {
  const store = makeFakeStore([makeElRuntime('el-lqdtest')]);

  store.applyRuntimeCatalog([]);

  assert.deepEqual(
    store.translations.map((translation) => translation.id),
    [],
    'mergeRuntimeCatalogTranslations drops runtime rows that are absent from the applied list'
  );
});

test('refreshing the catalog re-applies EL additively so EL survives a Supabase catalog refresh', async () => {
  const el = makeElRuntime('el-lqdtest');
  const store = makeFakeStore([el]);
  let elStepInvoked = false;
  const elStep: ElBootstrapStep = async () => {
    elStepInvoked = true;
    return [el];
  };

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep,
  });

  assert.equal(elStepInvoked, true, 'the EL step must run whenever the EL catalog URL resolves');
  assert.deepEqual(
    store.translations.map((translation) => translation.id).sort(),
    ['bsb', 'el-lqdtest'],
    'both the Supabase catalog rows and the EL runtime rows must remain in the store'
  );
  assert.equal(result.appliedSupabaseCatalog, true);
  assert.equal(result.isElActive, true);
});

test('an empty Supabase catalog never wipes EL runtime rows', async () => {
  const el = makeElRuntime('el-lqdtest');
  const store = makeFakeStore([el]);

  await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => [el],
  });

  assert.deepEqual(
    store.translations.map((translation) => translation.id),
    ['el-lqdtest'],
    'EL must survive a refresh that returns no Supabase catalog rows'
  );
});

test('a failed Supabase catalog fetch never wipes EL runtime rows', async () => {
  const el = makeElRuntime('el-lqdtest');
  const store = makeFakeStore([el]);

  await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: false, error: 'network down' }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => [el],
  });

  assert.deepEqual(
    store.translations.map((translation) => translation.id),
    ['el-lqdtest'],
    'EL must survive a refresh whose Supabase catalog fetch failed'
  );
});

test('flag-off builds do zero EL work and skip the apply entirely when the catalog is empty', async () => {
  const store = makeFakeStore([]);
  let elStepInvoked = false;

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => null,
    elStep: async () => {
      elStepInvoked = true;
      return [];
    },
  });

  assert.equal(elStepInvoked, false, 'the heavy EL step must not run when the resolver is null');
  assert.equal(store.applyCount, 0, 'no apply should happen with no catalog rows and EL inert');
  assert.equal(result.appliedSupabaseCatalog, false);
  assert.equal(result.isElActive, false);
});

test('flag-off builds still apply the Supabase catalog without touching the EL path', async () => {
  const store = makeFakeStore([]);
  let elStepInvoked = false;

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => null,
    elStep: async () => {
      elStepInvoked = true;
      return [];
    },
  });

  assert.equal(elStepInvoked, false);
  assert.equal(store.applyCount, 1, 'the Supabase catalog is applied in exactly one call');
  assert.deepEqual(
    store.translations.map((translation) => translation.id),
    ['bsb']
  );
  assert.equal(result.appliedSupabaseCatalog, true);
});
