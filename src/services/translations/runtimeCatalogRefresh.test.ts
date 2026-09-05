import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import type { TranslationCatalogEntry } from '../supabase/types';
import { mergeRuntimeCatalogTranslations } from '../../stores/bibleStoreModel';
import { refreshRuntimeCatalog, shouldMarkRuntimeCatalogHydrated } from './runtimeCatalogRefresh';
import type { ElBootstrapStep } from './runtimeElCatalog';
import { mapCatalogEntryToBibleTranslation } from './translationCatalogModel';

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
      updatedAt: '2026-09-05T00:00:00.000Z',
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

test('refreshing a large catalog preserves download state with linear existing-row lookups', async (t) => {
  const rowCount = 1000;
  const entries = Array.from({ length: rowCount }, (_, index) =>
    makeCatalogEntry(`runtime-${index}`)
  );
  let idReads = 0;
  const initial = entries.map((entry) => {
    const translation = mapCatalogEntryToBibleTranslation(entry);
    translation.downloadedAudioBooks = ['JHN'];
    Object.defineProperty(translation, 'id', {
      enumerable: true,
      get: () => {
        idReads += 1;
        return entry.translation_id;
      },
    });
    return translation;
  });
  const store = makeFakeStore(initial);
  await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: entries }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => null,
  });
  assert.equal(store.translations.length, rowCount);
  assert.ok(store.translations.every((row) => row.downloadedAudioBooks.includes('JHN')));
  assert.ok(
    idReads <= rowCount * 4,
    `Catalog lookup performed ${idReads} ID reads for ${rowCount} rows`
  );
  t.diagnostic(`Catalog lookup: ${idReads} ID reads for ${rowCount} rows`);
});

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

test('a transient EL refresh error does not remove the previously loaded EL catalog', async () => {
  const existingEl = makeElRuntime('el-lqdtest');
  const store = makeFakeStore([existingEl]);

  await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => {
      throw new Error('temporary EL outage');
    },
  });

  assert.deepEqual(store.translations.map((translation) => translation.id).sort(), [
    'bsb',
    'el-lqdtest',
  ]);
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

// ── Regression: a failed EL fetch must not be mistaken for a hydrated launch ──────────────
//
// A transient failure must leave retry enabled even when persisted rows are available.
// A configured source is not evidence that this launch loaded its current catalog.

test('an EL failure is reported so the launch is not treated as hydrated', async () => {
  const store = makeFakeStore([]);

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => {
      throw new Error('network down');
    },
  });

  assert.equal(result.isElActive, true, 'the EL flag resolved a catalog URL for this build');
  assert.equal(
    result.appliedElCatalog,
    false,
    'a failed EL step must report that no EL rows were applied'
  );
  assert.equal(
    shouldMarkRuntimeCatalogHydrated(result),
    false,
    'an active-but-failed EL refresh must leave the launch un-hydrated so the next picker open retries'
  );
});

test('a successful EL refresh marks the launch hydrated', async () => {
  const el = makeElRuntime('el-lqdtest');
  const store = makeFakeStore([]);

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => [el],
  });

  assert.equal(result.appliedElCatalog, true);
  assert.equal(shouldMarkRuntimeCatalogHydrated(result), true);
});

test('a flag-off build stays hydrated on the Supabase catalog alone', async () => {
  const store = makeFakeStore([]);

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: true, data: [makeCatalogEntry('bsb')] }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => null,
    elStep: async () => [],
  });

  assert.equal(result.appliedElCatalog, false);
  assert.equal(
    shouldMarkRuntimeCatalogHydrated(result),
    true,
    'EL being inert must not stop the Supabase-only flow from counting as hydrated'
  );
});

test('a refresh that applied nothing at all is never hydrated', async () => {
  const store = makeFakeStore([]);

  const result = await refreshRuntimeCatalog({
    listTranslations: async () => ({ success: false, error: 'offline' }),
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => null,
    elStep: async () => [],
  });

  assert.equal(shouldMarkRuntimeCatalogHydrated(result), false);
});

for (const outcome of ['failure', 'empty', 'throw'] as const) {
  test(`a ${outcome} Supabase response preserves its last-good rows and permits recovery`, async () => {
    const previous = mapCatalogEntryToBibleTranslation(makeCatalogEntry('previous'));
    const oldEl = makeElRuntime('el-old');
    const newEl = makeElRuntime('el-new');
    const store = makeFakeStore([previous, oldEl]);
    const deps = {
      getStoreTranslations: store.getStoreTranslations,
      applyRuntimeCatalog: store.applyRuntimeCatalog,
      resolveUrl: () => 'https://lqd-media.example.com/catalog.json',
      elStep: async () => [newEl],
    };
    const result = await refreshRuntimeCatalog({
      ...deps,
      listTranslations: async () => {
        if (outcome === 'throw') throw new Error('network down');
        return outcome === 'empty'
          ? { success: true, data: [] }
          : { success: false, error: 'network down' };
      },
    });

    assert.deepEqual(store.translations.map(({ id }) => id).sort(), ['el-new', 'previous']);
    assert.equal(result.appliedSupabaseCatalog, false);
    assert.equal(result.appliedElCatalog, true);
    assert.equal(shouldMarkRuntimeCatalogHydrated(result), false);

    const recovered = await refreshRuntimeCatalog({
      ...deps,
      listTranslations: async () => ({ success: true, data: [makeCatalogEntry('replacement')] }),
    });
    assert.deepEqual(store.translations.map(({ id }) => id).sort(), ['el-new', 'replacement']);
    assert.equal(shouldMarkRuntimeCatalogHydrated(recovered), true);
  });
}

test('both failed sources retain all last-good rows without marking hydration complete', async () => {
  const previous = mapCatalogEntryToBibleTranslation(makeCatalogEntry('previous'));
  const oldEl = makeElRuntime('el-old');
  const store = makeFakeStore([previous, oldEl]);
  const result = await refreshRuntimeCatalog({
    listTranslations: async () => {
      throw new Error('Supabase offline');
    },
    getStoreTranslations: store.getStoreTranslations,
    applyRuntimeCatalog: store.applyRuntimeCatalog,
    resolveUrl: () => 'https://lqd-media.example.com/catalog.json',
    elStep: async () => {
      throw new Error('EL offline');
    },
  });
  assert.deepEqual(store.translations, [previous, oldEl]);
  assert.equal(shouldMarkRuntimeCatalogHydrated(result), false);
});
