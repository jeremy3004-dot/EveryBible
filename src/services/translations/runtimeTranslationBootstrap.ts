import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import { getUserTranslationPreferences } from './translationService';
import { resolveRegionalFallbackTranslation } from './regionalTranslationFallback';
import { refreshRuntimeCatalog, shouldMarkRuntimeCatalogHydrated } from './runtimeCatalogRefresh';

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
  // other. When the refresh did not actually produce the rows this build needs, the launch
  // stays un-hydrated so a later attempt (the next time the translation picker opens) can
  // still populate the catalog — see shouldMarkRuntimeCatalogHydrated for why an EL-active
  // build must not latch on the feature flag alone.
  const result = await refreshRuntimeCatalog();

  if (!shouldMarkRuntimeCatalogHydrated(result)) {
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

  // The refresh reports failure through its result rather than by throwing, and offline it
  // fails at once instead of timing out. Callers (onboarding's "can't reach the Bible library"
  // card and its retry) can only tell the catalog is missing if this rejects.
  if (!hasHydratedRuntimeCatalogThisLaunch) {
    throw new Error('[Translations] The runtime translation catalog could not be loaded');
  }
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
