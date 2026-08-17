import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import {
  getUserTranslationPreferences,
  listAvailableTranslations,
  mapCatalogEntryToBibleTranslation,
} from './translationService';
import { normalizeCatalogTranslationId } from './translationCatalogModel';
import { resolveRegionalFallbackTranslation } from './regionalTranslationFallback';
import { applyElRuntimeCatalog } from './runtimeElCatalog';
import { resolveElCatalogUrl } from '../elMedia/elMediaConfig';

let runtimeCatalogHydrationPromise: Promise<void> | null = null;
let hasHydratedRuntimeCatalogThisLaunch = false;

export function hasRuntimeCatalogTranslations(translations: BibleTranslation[]): boolean {
  return translations.some(
    (translation) => translation.source === 'runtime' && Boolean(translation.catalog)
  );
}

function isReadableLocally(translation: {
  isDownloaded: boolean;
  hasText: boolean;
  source?: string;
  textPackLocalPath?: string | null;
}): boolean {
  if (translation.isDownloaded) {
    return true;
  }

  if (!translation.hasText) {
    return false;
  }

  return translation.source !== 'runtime' || Boolean(translation.textPackLocalPath);
}

export async function bootstrapRuntimeTranslations(): Promise<void> {
  const catalogResult = await listAvailableTranslations();
  const hasSupabaseCatalog = Boolean(
    catalogResult.success && catalogResult.data && catalogResult.data.length > 0
  );

  // resolveElCatalogUrl is a cheap, side-effect-free check (feature flag + configured base
  // URL). When it is null — the default in production today and in every flag-off build — the
  // EL path is completely inert and this function's behaviour is byte-identical to before:
  // an empty/failed Supabase catalog returns early without marking hydration, exactly as it
  // used to. The heavy EL/jose module graph is never loaded on this path.
  const isElActive = resolveElCatalogUrl() !== null;

  if (!hasSupabaseCatalog && !isElActive) {
    return;
  }

  // Map + apply the Supabase runtime catalog (if any) first — the fast, established path.
  let runtimeTranslations: BibleTranslation[] = [];
  if (hasSupabaseCatalog && catalogResult.data) {
    const currentStoreTranslations = useBibleStore.getState().translations;
    runtimeTranslations = catalogResult.data.map((entry) =>
      mapCatalogEntryToBibleTranslation(
        entry,
        currentStoreTranslations.find(
          (translation) => translation.id === normalizeCatalogTranslationId(entry.translation_id)
        )
      )
    );
    useBibleStore.getState().applyRuntimeCatalog(runtimeTranslations);
  }

  // Additive EL merge, piggybacking the same once-per-launch hydration. Re-applies the
  // COMBINED [Supabase, EL] list so both sets survive under either ordering (EL ids are
  // `el-`/`lq`-prefixed and collision-proof); any EL failure is swallowed and never affects the
  // Supabase flow above. Only reached when the flag resolves a URL, so it is a no-op with
  // zero startup cost otherwise.
  if (isElActive) {
    await applyElRuntimeCatalog(runtimeTranslations);
  }

  hasHydratedRuntimeCatalogThisLaunch = true;
}

export async function ensureRuntimeCatalogLoaded(): Promise<void> {
  if (hasHydratedRuntimeCatalogThisLaunch) {
    return;
  }

  if (!runtimeCatalogHydrationPromise) {
    runtimeCatalogHydrationPromise = bootstrapRuntimeTranslations().finally(() => {
      runtimeCatalogHydrationPromise = null;
    });
  }

  await runtimeCatalogHydrationPromise;
}

export async function reconcilePrimaryTranslationPreference(): Promise<void> {
  const preferenceResult = await getUserTranslationPreferences();
  if (!preferenceResult.success || !preferenceResult.data?.primary_translation) {
    return;
  }

  const preferredId = preferenceResult.data.primary_translation.trim().toLowerCase();
  const state = useBibleStore.getState();
  const preferredTranslation = state.translations.find(
    (translation) => translation.id === preferredId
  );

  if (!preferredTranslation || !isReadableLocally(preferredTranslation)) {
    if (preferredTranslation?.catalog?.text?.downloadUrl) {
      try {
        await state.downloadTranslation(preferredId);
        useBibleStore.getState().setCurrentTranslation(preferredId);
      } catch (error) {
        const fallbackTranslation = resolveRegionalFallbackTranslation(
          useBibleStore.getState().translations,
          preferredTranslation
        );
        if (fallbackTranslation) {
          useBibleStore.getState().setCurrentTranslation(fallbackTranslation.id);
          return;
        }

        console.warn('[Bible] Failed to install preferred translation:', preferredId, error);
      }
    }
    return;
  }

  if (state.currentTranslation !== preferredId) {
    state.setCurrentTranslation(preferredId);
  }
}

export async function bootstrapRuntimeTranslationsAndPreferences(): Promise<void> {
  await bootstrapRuntimeTranslations();
  await reconcilePrimaryTranslationPreference();
}
