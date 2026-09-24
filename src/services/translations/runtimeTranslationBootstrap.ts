import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import { getUserTranslationPreferences } from './translationService';
import { resolveRegionalFallbackTranslation } from './regionalTranslationFallback';
import { refreshRuntimeCatalog, shouldMarkRuntimeCatalogHydrated } from './runtimeCatalogRefresh';

let runtimeCatalogHydrationPromise: Promise<boolean> | null = null;
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

/** Resolves true when this launch's catalog refresh produced the rows this build needs. */
export async function bootstrapRuntimeTranslations(): Promise<boolean> {
  // Shared refresh path (also used by TranslationBrowserScreen): it applies the Supabase
  // catalog and then re-applies the combined [Supabase, EL] list, so neither set prunes the
  // other. When the refresh did not actually produce the rows this build needs, the launch
  // stays un-hydrated so a later attempt (the next time the translation picker opens) can
  // still populate the catalog — see shouldMarkRuntimeCatalogHydrated for why an EL-active
  // build must not latch on the feature flag alone.
  const result = await refreshRuntimeCatalog();

  if (!shouldMarkRuntimeCatalogHydrated(result)) {
    return false;
  }

  hasHydratedRuntimeCatalogThisLaunch = true;
  return true;
}

/**
 * Resolves false when the catalog could not be loaded (unreachable, an error result or an empty
 * catalog) rather than throwing: refreshRuntimeCatalog swallows transport errors, so a caller
 * that must tell the person (onboarding's "can't reach" card) has to check the result.
 */
export async function ensureRuntimeCatalogLoaded(): Promise<boolean> {
  if (hasHydratedRuntimeCatalogThisLaunch) {
    return true;
  }

  if (!runtimeCatalogHydrationPromise) {
    runtimeCatalogHydrationPromise = bootstrapRuntimeTranslations().finally(() => {
      runtimeCatalogHydrationPromise = null;
    });
  }

  return runtimeCatalogHydrationPromise;
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
        const downloadResult = await state.downloadTranslation(preferredId);
        if (downloadResult === 'cancelled') {
          return;
        }
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
