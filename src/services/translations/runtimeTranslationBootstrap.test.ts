/**
 * Behavioural tests for the launch-time runtime translation bootstrap.
 *
 * `bibleStore` and `translationService` are replaced by absolute path, which intercepts both
 * this module's static imports AND the lazy `import()`s inside `runtimeCatalogRefresh`. The
 * refresh helper, the catalog mapper and `regionalTranslationFallback` are the REAL modules, so
 * ordering (Supabase apply before preference reconciliation), the hydration latch and the
 * fallback selection are all proven end to end.
 *
 * The Every Language path is deliberately kept inert: the env vars that drive
 * `resolveElCatalogUrl` are cleared before anything loads, so `refreshRuntimeCatalog` never
 * reaches the heavy EL step (which would load `jose`). EL ordering is covered by
 * `runtimeCatalogRefresh.test.ts`.
 *
 * Module state is shared across tests (`hasHydratedRuntimeCatalogThisLaunch` latches for the
 * life of the module), so the `ensureRuntimeCatalogLoaded` tests run in a deliberate order:
 * every un-latched behaviour is asserted before the test that latches it.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import type { TranslationCatalogEntry, UserTranslationPreferences } from '../supabase/types';
import { mockModule, sourcePath } from '../../testing/mockModules';

// EL must be inert before elMediaConfig is evaluated: keeps every refresh Supabase-only.
delete process.env.EXPO_PUBLIC_EL_MEDIA_SOURCE;
delete process.env.EXPO_PUBLIC_EL_MEDIA_BASE_URL;

// ─── Fake bibleStore ──────────────────────────────────────────────────────────

interface StoreState {
  translations: BibleTranslation[];
  currentTranslation: string;
  applyRuntimeCatalog: (translations: BibleTranslation[]) => void;
  setCurrentTranslation: (translationId: string) => void;
  downloadTranslation: (translationId: string) => Promise<void>;
}

const events: string[] = [];
const appliedCatalogs: BibleTranslation[][] = [];
let downloadOutcome: (translationId: string) => Promise<void> = async () => {};

const storeState: StoreState = {
  translations: [],
  currentTranslation: 'bsb',
  applyRuntimeCatalog: (translations) => {
    events.push(`apply:${translations.map((entry) => entry.id).join(',')}`);
    appliedCatalogs.push(translations);
    storeState.translations = translations;
  },
  setCurrentTranslation: (translationId) => {
    events.push(`current:${translationId}`);
    storeState.currentTranslation = translationId;
  },
  downloadTranslation: async (translationId) => {
    events.push(`download:${translationId}`);
    await downloadOutcome(translationId);
  },
};

mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: { getState: () => storeState },
});

// ─── Fake translationService ──────────────────────────────────────────────────

interface ListResult {
  success: boolean;
  data?: TranslationCatalogEntry[];
  error?: string;
}
interface PreferencesResult {
  success: boolean;
  data?: UserTranslationPreferences;
  error?: string;
}

let listCallCount = 0;
let listResult: () => Promise<ListResult> = async () => ({ success: true, data: [] });
let preferencesResult: () => Promise<PreferencesResult> = async () => ({ success: false });

mockModule(mock, sourcePath('services/translations/translationService.ts'), {
  listAvailableTranslations: async () => {
    listCallCount += 1;
    events.push('list');
    return listResult();
  },
  getUserTranslationPreferences: async () => {
    events.push('preferences');
    return preferencesResult();
  },
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

function makeTranslation(overrides: Partial<BibleTranslation> & { id: string }): BibleTranslation {
  return {
    name: `Translation ${overrides.id}`,
    abbreviation: overrides.id.toUpperCase(),
    language: 'English',
    description: '',
    copyright: 'Public Domain',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 1,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'runtime',
    installState: 'remote-only',
    ...overrides,
  } as BibleTranslation;
}

function makePreferences(primary: string): UserTranslationPreferences {
  return {
    id: 'prefs-1',
    user_id: 'user-1',
    primary_translation: primary,
    secondary_translation: null,
    audio_translation: null,
    synced_at: '2026-01-01T00:00:00.000Z',
  };
}

const downloadableCatalog = {
  version: '2026.01.01',
  updatedAt: '2026-01-01T00:00:00.000Z',
  text: {
    format: 'sqlite' as const,
    version: '2026.01.01',
    downloadUrl: 'https://cdn.example.com/x.sqlite',
    sha256: 'sha256-x',
  },
};

type BootstrapModule = typeof import('./runtimeTranslationBootstrap');
let bootstrapModule: BootstrapModule;
const loadModule = async (): Promise<BootstrapModule> => {
  bootstrapModule ??= await import('./runtimeTranslationBootstrap');
  return bootstrapModule;
};

function reset() {
  events.length = 0;
  appliedCatalogs.length = 0;
  listCallCount = 0;
  storeState.translations = [];
  storeState.currentTranslation = 'bsb';
  downloadOutcome = async () => {};
  listResult = async () => ({ success: true, data: [] });
  preferencesResult = async () => ({ success: false });
}

// ─── hasRuntimeCatalogTranslations ────────────────────────────────────────────

test('hasRuntimeCatalogTranslations only counts runtime rows that carry a catalog', async () => {
  const { hasRuntimeCatalogTranslations } = await loadModule();

  assert.equal(hasRuntimeCatalogTranslations([]), false);
  assert.equal(
    hasRuntimeCatalogTranslations([makeTranslation({ id: 'bsb', source: 'bundled' })]),
    false,
    'a bundled translation is not evidence the runtime catalog loaded'
  );
  assert.equal(
    hasRuntimeCatalogTranslations([makeTranslation({ id: 'web', source: 'runtime' })]),
    false,
    'a runtime row without catalog metadata is a leftover, not a catalog hit'
  );
  assert.equal(
    hasRuntimeCatalogTranslations([
      makeTranslation({ id: 'web', source: 'runtime', catalog: downloadableCatalog }),
    ]),
    true
  );
});

// ─── bootstrapRuntimeTranslations ─────────────────────────────────────────────

test('bootstrapRuntimeTranslations applies nothing when the catalog fetch fails', async () => {
  reset();
  const { bootstrapRuntimeTranslations } = await loadModule();
  listResult = async () => ({ success: false, error: 'offline' });

  await bootstrapRuntimeTranslations();

  assert.deepEqual(appliedCatalogs, [], 'a failed fetch must not wipe the persisted picker rows');
});

test('bootstrapRuntimeTranslations survives a catalog fetch that throws', async () => {
  reset();
  const { bootstrapRuntimeTranslations } = await loadModule();
  listResult = async () => {
    throw new Error('transport exploded');
  };

  await bootstrapRuntimeTranslations();

  assert.deepEqual(appliedCatalogs, []);
});

// ─── ensureRuntimeCatalogLoaded (order-sensitive: latches on success) ─────────

test('ensureRuntimeCatalogLoaded retries after a refresh that produced no rows', async () => {
  reset();
  const { ensureRuntimeCatalogLoaded } = await loadModule();
  listResult = async () => ({ success: true, data: [] });

  await ensureRuntimeCatalogLoaded();
  await ensureRuntimeCatalogLoaded();

  assert.equal(
    listCallCount,
    2,
    'an un-hydrated launch must stay retryable so a later picker visit can populate the catalog'
  );
});

test('a launch with persisted runtime rows still refreshes the catalog once', async () => {
  reset();
  const { ensureRuntimeCatalogLoaded } = await loadModule();
  // A previous launch left catalog-backed rows in the persisted picker. Stopping
  // there would hide translations added to the remote catalog since that launch.
  storeState.translations = [
    makeTranslation({ id: 'web', source: 'runtime', catalog: downloadableCatalog }),
  ];
  listResult = async () => ({ success: true, data: [] });

  await ensureRuntimeCatalogLoaded();

  assert.equal(listCallCount, 1, 'persisted runtime rows must not short-circuit the refresh');
});

test('concurrent ensureRuntimeCatalogLoaded callers share one in-flight refresh', async () => {
  reset();
  const { ensureRuntimeCatalogLoaded } = await loadModule();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  listResult = async () => {
    await gate;
    return { success: true, data: [] };
  };

  const first = ensureRuntimeCatalogLoaded();
  const second = ensureRuntimeCatalogLoaded();
  release();
  await Promise.all([first, second]);

  assert.equal(listCallCount, 1, 'two cold-start callers must not fire two catalog fetches');
});

test('a rejected in-flight refresh still clears the shared promise for the next caller', async () => {
  reset();
  const { ensureRuntimeCatalogLoaded } = await loadModule();
  listResult = async () => {
    throw new Error('transport exploded');
  };

  await ensureRuntimeCatalogLoaded();
  await ensureRuntimeCatalogLoaded();

  assert.equal(listCallCount, 2, 'a failed attempt must not wedge the single-flight gate shut');
});

test('ensureRuntimeCatalogLoaded stops refetching once a launch has hydrated', async () => {
  reset();
  const { ensureRuntimeCatalogLoaded } = await loadModule();
  listResult = async () => ({ success: true, data: [makeCatalogEntry('web')] });

  await ensureRuntimeCatalogLoaded();
  await ensureRuntimeCatalogLoaded();
  await ensureRuntimeCatalogLoaded();

  assert.equal(listCallCount, 1, 'a hydrated launch must not refetch the catalog on every screen');
});

test('bootstrapRuntimeTranslations applies the fetched Supabase catalog to the store', async () => {
  reset();
  const { bootstrapRuntimeTranslations } = await loadModule();
  listResult = async () => ({ success: true, data: [makeCatalogEntry('web')] });

  await bootstrapRuntimeTranslations();

  assert.equal(appliedCatalogs.length, 1, 'a successful catalog fetch is applied exactly once');
  assert.deepEqual(
    appliedCatalogs[0].map((entry) => entry.id),
    ['web']
  );
});

// ─── reconcilePrimaryTranslationPreference ────────────────────────────────────

test('reconcilePrimaryTranslationPreference does nothing when the preference read fails', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  preferencesResult = async () => ({ success: false, error: 'offline' });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences'], 'an unreadable preference must not change the reader');
});

test('reconcilePrimaryTranslationPreference does nothing when no primary is saved', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  preferencesResult = async () => ({
    success: true,
    data: { ...makePreferences(''), primary_translation: '' },
  });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences']);
});

test('a saved primary that is downloaded becomes the current translation', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({ id: 'asv', isDownloaded: true, installState: 'installed' }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('ASV ') });

  await reconcilePrimaryTranslationPreference();

  assert.equal(
    storeState.currentTranslation,
    'asv',
    'the saved id is trimmed and lower-cased before it is matched'
  );
});

test('a saved primary that is already current is not re-selected', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({ id: 'bsb', isDownloaded: true, installState: 'installed' }),
  ];
  storeState.currentTranslation = 'bsb';
  preferencesResult = async () => ({ success: true, data: makePreferences('bsb') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences'], 'no redundant store write for an unchanged preference');
});

test('a runtime primary with a local text pack counts as readable without downloading', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({
      id: 'web',
      source: 'runtime',
      hasText: true,
      textPackLocalPath: '/documents/translations/web.sqlite',
    }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('web') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences', 'current:web']);
});

test('a bundled primary is readable from the app database without any download', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({ id: 'asv', source: 'bundled', hasText: true, isDownloaded: false }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('asv') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(
    events,
    ['preferences', 'current:asv'],
    'bundled text ships inside the app, so an un-downloaded flag is not a reason to fetch it'
  );
});

test('a saved primary that is not installed is downloaded and then selected', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({ id: 'web', source: 'runtime', hasText: true, catalog: downloadableCatalog }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('web') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences', 'download:web', 'current:web']);
});

test('an uninstalled primary with no download URL is left alone', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [makeTranslation({ id: 'web', source: 'runtime', hasText: true })];
  preferencesResult = async () => ({ success: true, data: makePreferences('web') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences'], 'nothing to install, so nothing to select');
});

test('a saved primary the catalog no longer offers is ignored', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({ id: 'bsb', isDownloaded: true, installState: 'installed' }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('retired') });

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences']);
  assert.equal(storeState.currentTranslation, 'bsb');
});

test('a failed install of a Hindi primary falls back to the Indian regional translation', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({
      id: 'hindi-other',
      language: 'Hindi',
      source: 'runtime',
      hasText: true,
      catalog: downloadableCatalog,
    }),
    makeTranslation({ id: 'hincv', language: 'Hindi', isDownloaded: true }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('hindi-other') });
  downloadOutcome = async () => {
    throw new Error('download failed');
  };

  await reconcilePrimaryTranslationPreference();

  assert.deepEqual(events, ['preferences', 'download:hindi-other', 'current:hincv']);
});

test('a failed install with no regional fallback leaves the reader on its current translation', async () => {
  reset();
  const { reconcilePrimaryTranslationPreference } = await loadModule();
  storeState.translations = [
    makeTranslation({
      id: 'web',
      language: 'English',
      source: 'runtime',
      hasText: true,
      catalog: downloadableCatalog,
    }),
  ];
  preferencesResult = async () => ({ success: true, data: makePreferences('web') });
  downloadOutcome = async () => {
    throw new Error('download failed');
  };
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    await reconcilePrimaryTranslationPreference();
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(events, ['preferences', 'download:web']);
  assert.equal(storeState.currentTranslation, 'bsb');
  assert.equal(warnings.length, 1, 'an unrecoverable install failure is reported, not swallowed');
});

// ─── bootstrapRuntimeTranslationsAndPreferences ───────────────────────────────

test('the combined bootstrap applies the catalog before reconciling the preference', async () => {
  reset();
  const { bootstrapRuntimeTranslationsAndPreferences } = await loadModule();
  listResult = async () => ({ success: true, data: [makeCatalogEntry('web')] });
  preferencesResult = async () => ({ success: true, data: makePreferences('web') });

  await bootstrapRuntimeTranslationsAndPreferences();

  assert.deepEqual(
    events,
    ['list', 'apply:web', 'preferences', 'download:web', 'current:web'],
    'the preference can only resolve against rows the catalog refresh already applied'
  );
});
