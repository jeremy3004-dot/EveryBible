import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import { getUserTranslationPreferences } from './translationService';
import { resolveRegionalFallbackTranslation } from './regionalTranslationFallback';
import { refreshRuntimeCatalog } from './runtimeCatalogRefresh';

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
  // Shared refresh path (also used by TranslationBrowserScreen): it applies the Supabase
  // catalog and then re-applies the combined [Supabase, EL] list, so neither set prunes the
  // other. When neither source produced anything the launch stays un-hydrated so a later
  // attempt can still populate the catalog.
  const { appliedSupabaseCatalog, isElActive } = await refreshRuntimeCatalog();

  if (!appliedSupabaseCatalog && !isElActive) {
    return;
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
