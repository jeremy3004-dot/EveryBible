import type { BibleTranslation } from '../../types';
import type { TranslationCatalogEntry } from '../supabase/types';
import {
  mapCatalogEntryToBibleTranslation,
  normalizeCatalogTranslationId,
} from './translationCatalogModel';
import { applyElRuntimeCatalog, type ElBootstrapStep } from './runtimeElCatalog';
import { resolveElCatalogUrl } from '../elMedia/elMediaConfig';

interface CatalogListResult {
  success: boolean;
  data?: TranslationCatalogEntry[];
  error?: string;
}

export interface RefreshRuntimeCatalogDeps {
  // Supabase catalog fetch. Defaults to translationService.listAvailableTranslations, resolved
  // through a lazy `import()` so this module stays loadable outside the React Native runtime
  // (and so tests can drive it without the Supabase client graph).
  listTranslations?: () => Promise<CatalogListResult>;
  // Store reader/writer. Defaults to bibleStore, also resolved lazily for the same reason.
  getStoreTranslations?: () => BibleTranslation[];
  applyRuntimeCatalog?: (translations: BibleTranslation[]) => void;
  // Cheap EL feature-flag resolver; null keeps the entire EL path inert.
  resolveUrl?: () => string | null;
  // The heavy EL fetch→verify→map step (injectable so tests never load jose).
  elStep?: ElBootstrapStep;
}

export interface RefreshRuntimeCatalogResult {
  // True when the Supabase catalog returned rows and they were applied to the store.
  appliedSupabaseCatalog: boolean;
  // True when the EL feature flag resolved a catalog URL for this build. This says only that
  // EL was ATTEMPTED — never that it produced rows. Use appliedElCatalog for that.
  isElActive: boolean;
  // True when EL rows were fetched, verified, mapped AND merged into the store by this
  // refresh. False for a flag-off build and for every EL failure (network, verification,
  // empty catalog), which are all swallowed inside applyElRuntimeCatalog.
  appliedElCatalog: boolean;
  // The mapped Supabase runtime rows applied by this refresh (empty when there were none).
  translations: BibleTranslation[];
}

interface RuntimeCatalogStoreBridge {
  getStoreTranslations: () => BibleTranslation[];
  applyRuntimeCatalog: (translations: BibleTranslation[]) => void;
}

// Resolves the store accessors, lazily importing bibleStore only when a caller has not injected
// its own. Keeping the store out of this module's static import chain is what lets the Node test
// runner load it, and keeps flag-off refreshes from pulling the store in before they need it.
async function resolveStoreBridge(
  deps: RefreshRuntimeCatalogDeps
): Promise<RuntimeCatalogStoreBridge> {
  if (deps.getStoreTranslations && deps.applyRuntimeCatalog) {
    return {
      getStoreTranslations: deps.getStoreTranslations,
      applyRuntimeCatalog: deps.applyRuntimeCatalog,
    };
  }

  const { useBibleStore } = await import('../../stores/bibleStore');

  return {
    getStoreTranslations:
      deps.getStoreTranslations ?? (() => useBibleStore.getState().translations),
    applyRuntimeCatalog:
      deps.applyRuntimeCatalog ??
      ((translations) => useBibleStore.getState().applyRuntimeCatalog(translations)),
  };
}

/**
 * Single source of truth for refreshing the runtime translation catalog.
 *
 * Every caller MUST go through this helper. A caller that maps the Supabase catalog and calls
 * applyRuntimeCatalog on its own silently WIPES the additively applied Every Language rows:
 * applyRuntimeCatalog → mergeRuntimeCatalogTranslations prunes any previously applied runtime
 * row that is neither downloaded nor backed by a local text pack, and EL rows are audio-only
 * remote rows. TranslationBrowserScreen used to reproduce exactly that on every visit, leaving
 * EL translations missing until the next cold launch.
 *
 * Ordering matters: the Supabase list is mapped and applied first, then handed to
 * applyElRuntimeCatalog, which re-applies the COMBINED [Supabase, EL] list in a single apply so
 * neither set prunes the other. When the EL flag is off, resolveElCatalogUrl() returns null and
 * the EL path costs nothing — the heavy EL module graph is never loaded.
 */
export async function refreshRuntimeCatalog(
  deps: RefreshRuntimeCatalogDeps = {}
): Promise<RefreshRuntimeCatalogResult> {
  const listTranslations =
    deps.listTranslations ?? (await import('./translationService')).listAvailableTranslations;

  const catalogResult = await listTranslations();
  const hasSupabaseCatalog = Boolean(
    catalogResult.success && catalogResult.data && catalogResult.data.length > 0
  );

  // Cheap, side-effect-free check (feature flag + configured base URL). Null in every flag-off
  // build, which keeps this path byte-equivalent to the original Supabase-only flow.
  const resolveUrl = deps.resolveUrl ?? resolveElCatalogUrl;
  const isElActive = resolveUrl() !== null;

  if (!hasSupabaseCatalog && !isElActive) {
    return {
      appliedSupabaseCatalog: false,
      isElActive: false,
      appliedElCatalog: false,
      translations: [],
    };
  }

  // Map + apply the Supabase runtime catalog (if any) first — the fast, established path.
  let runtimeTranslations: BibleTranslation[] = [];
  if (hasSupabaseCatalog && catalogResult.data) {
    const { getStoreTranslations, applyRuntimeCatalog } = await resolveStoreBridge(deps);

    const currentStoreTranslations = getStoreTranslations();
    runtimeTranslations = catalogResult.data.map((entry) =>
      mapCatalogEntryToBibleTranslation(
        entry,
        currentStoreTranslations.find(
          (translation) => translation.id === normalizeCatalogTranslationId(entry.translation_id)
        )
      )
    );
    applyRuntimeCatalog(runtimeTranslations);
  }

  // Additive EL merge. Re-applies the COMBINED [Supabase, EL] list so both sets survive under
  // either ordering (EL ids are `el-`/`lq`-prefixed and collision-proof); any EL failure is
  // swallowed inside applyElRuntimeCatalog and never affects the Supabase flow above.
  let appliedElCatalog = false;
  if (isElActive) {
    appliedElCatalog = await applyElRuntimeCatalog(runtimeTranslations, {
      resolveUrl,
      elStep: deps.elStep,
      applyRuntimeCatalog: deps.applyRuntimeCatalog,
    });
  }

  return {
    appliedSupabaseCatalog: hasSupabaseCatalog,
    isElActive,
    appliedElCatalog,
    translations: runtimeTranslations,
  };
}

/**
 * Whether a refresh result may latch the caller's per-launch "already hydrated" flag.
 *
 * EL runtime rows exist ONLY in memory: `sanitizeRuntimeTranslation` rejects them when the
 * store rehydrates (their `totalBooks` is 0, and the guard requires > 0), so a launch shows EL
 * translations only if THIS launch's EL step succeeded. Latching on `isElActive` — which just
 * means the feature flag resolved a catalog URL — therefore turned one transient EL failure
 * into "no Every Language rows until the app is force-quit and relaunched", with every retry
 * path (re-opening the translation picker) short-circuiting on the latched flag. Two devices on
 * the same build diverged permanently on nothing but the outcome of a single fetch.
 *
 * So: an EL-active refresh counts as hydrated only once EL rows actually landed. When EL is
 * inert (flag off / unconfigured) the Supabase catalog alone still hydrates the launch, exactly
 * as before.
 */
export function shouldMarkRuntimeCatalogHydrated({
  appliedSupabaseCatalog,
  isElActive,
  appliedElCatalog,
}: RefreshRuntimeCatalogResult): boolean {
  if (isElActive) {
    return appliedElCatalog;
  }

  return appliedSupabaseCatalog;
}
