import type { BibleTranslation } from '../../types';
import { resolveElCatalogUrl } from '../elMedia/elMediaConfig';

// Produces the mapped EL runtime translations for a resolved catalog URL. This is the ONLY
// place the heavy EL modules (elCatalogService / elTranslationMapping, which pull in `jose`
// via elEnvelope + the JWKS trust store) are loaded, and it is loaded via lazy dynamic
// `import()` so a flag-off launch never touches that graph. Injectable so tests can supply a
// double without loading jose. Returns [] on any failure or when no EL translations resolve.
export type ElBootstrapStep = (catalogUrl: string) => Promise<BibleTranslation[]>;

export interface ApplyElRuntimeCatalogDeps {
  // Cheap resolver: null unless the feature flag is on AND a base URL is configured.
  // Defaults to resolveElCatalogUrl (a light import — flag + runtime config only).
  resolveUrl?: () => string | null;
  // The heavy fetch→verify→map step. Defaults to the lazy-loading implementation below.
  elStep?: ElBootstrapStep;
  // The store apply action. Defaults to bibleStore.applyRuntimeCatalog.
  applyRuntimeCatalog?: (translations: BibleTranslation[]) => void;
}

// Default heavy step. Lazy dynamic imports target the SPECIFIC modules (not the barrel) so the
// loaded graph stays minimal. refreshElCatalog falls back to the last verified catalog; on a
// null catalog there is nothing to add.
const defaultElStep: ElBootstrapStep = async (catalogUrl) => {
  const [{ refreshElCatalog, getLastVerifiedElCatalog }, { mapElCatalogToBibleTranslations }] =
    await Promise.all([
      import('../elMedia/elCatalogService'),
      import('../elMedia/elTranslationMapping'),
    ]);

  const catalog = (await refreshElCatalog(catalogUrl)) ?? (await getLastVerifiedElCatalog());
  if (!catalog) {
    return [];
  }
  return mapElCatalogToBibleTranslations(catalog);
};

/**
 * Additive EL merge step, run AFTER the Supabase runtime catalog has been applied.
 *
 * `baseTranslations` is the already-mapped Supabase runtime list from this same launch. When
 * EL translations resolve we re-apply the COMBINED list `[...base, ...el]` in a single
 * applyRuntimeCatalog call rather than a second standalone EL apply. This is deliberate:
 * applyRuntimeCatalog → mergeRuntimeCatalogTranslations only preserves prior runtime rows that
 * are downloaded/installed, so a second, EL-only apply would WIPE the freshly-applied but
 * not-yet-downloaded Supabase entries. Re-applying the combined list keeps BOTH sets under
 * either ordering (EL ids are `el-`/`lq`-prefixed and collision-proof with Supabase ids).
 *
 * The whole EL path is guarded: a null resolver (flag off / unconfigured) short-circuits
 * BEFORE the heavy step loads, and any EL failure is swallowed so the existing (Supabase)
 * flow is never affected.
 *
 * Returns true only when EL rows were actually merged into the store. A failure stays
 * non-fatal (it is still swallowed here), but callers MUST be able to tell "EL produced
 * rows" from "EL was configured": EL rows are not restored from persistence
 * (`sanitizeRuntimeTranslation` rejects their `totalBooks: 0`), so every launch depends on
 * this step succeeding, and a caller that treats "configured" as "done" strands the device
 * without EL translations for the rest of the launch.
 */
export async function applyElRuntimeCatalog(
  baseTranslations: BibleTranslation[],
  deps: ApplyElRuntimeCatalogDeps = {}
): Promise<boolean> {
  const resolveUrl = deps.resolveUrl ?? resolveElCatalogUrl;
  const catalogUrl = resolveUrl();
  if (!catalogUrl) {
    // Flag off or unconfigured: zero EL work, zero startup cost. The heavy step never loads.
    return false;
  }

  const elStep = deps.elStep ?? defaultElStep;

  try {
    const elTranslations = await elStep(catalogUrl);
    if (elTranslations.length === 0) {
      return false;
    }
    // Resolve the store apply lazily so this module has no import-time dependency on the
    // React Native store graph (keeps it loadable under the Node test runner, and keeps the
    // store out of any static import chain reached before the flag guard).
    const applyRuntimeCatalog =
      deps.applyRuntimeCatalog ??
      (await import('../../stores/bibleStore')).useBibleStore.getState().applyRuntimeCatalog;
    applyRuntimeCatalog([...baseTranslations, ...elTranslations]);
    return true;
  } catch (error) {
    // EL is strictly additive and best-effort: any failure must never disturb the existing
    // (Supabase) runtime catalog that was already applied.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Bible] EL runtime catalog merge failed (ignored):', error);
    }
    return false;
  }
}
