import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import { getUserTranslationPreferences, setUserTranslationPreferences } from './translationService';
import { isStampLater } from './translationPreferenceStamps';
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

/**
 * Last write wins between this device's Bible choice and the one saved to the account.
 * A switch made offline never reached the server, so at the next launch the saved value
 * is older than it; the local choice is kept and uploaded. A newer saved value (the
 * reader switched on another device since) replaces the local one.
 */
export async function reconcilePrimaryTranslationPreference(): Promise<void> {
  const preferenceResult = await getUserTranslationPreferences();
  if (!preferenceResult.success) {
    return;
  }

  const remote = preferenceResult.data ?? null;
  const savedPrimary = remote?.primary_translation?.trim().toLowerCase() ?? '';
  const state = useBibleStore.getState();
  const localChosenAt = state.currentTranslationChosenAt;
  if (localChosenAt && (!savedPrimary || isStampLater(localChosenAt, remote?.synced_at))) {
    if (savedPrimary !== state.currentTranslation) {
      await setUserTranslationPreferences({
        primary: state.currentTranslation,
        chosenAt: localChosenAt,
      });
    }
    return;
  }

  if (!savedPrimary) {
    return;
  }

  const preferredId = savedPrimary;
  // Adopted with the saved stamp and not uploaded back: it is already the saved value.
  const adopted = { chosenAt: remote?.synced_at ?? null };
  const preferredTranslation = state.translations.find(
    (translation) => translation.id === preferredId
  );

  if (!preferredTranslation || !isReadableLocally(preferredTranslation)) {
    if (preferredTranslation?.catalog?.text?.downloadUrl) {
      // The download can take a while. A Bible the reader picks meanwhile is their
      // choice, so the result only applies while the reader is still on this one.
      const currentAtStart = state.currentTranslation;
      const readerChoseMeanwhile = () =>
        useBibleStore.getState().currentTranslation !== currentAtStart;
      try {
        const downloadResult = await state.downloadTranslation(preferredId);
        if (downloadResult === 'cancelled' || readerChoseMeanwhile()) {
          return;
        }
        useBibleStore.getState().setCurrentTranslation(preferredId, adopted);
      } catch (error) {
        const fallbackTranslation = readerChoseMeanwhile()
          ? null
          : resolveRegionalFallbackTranslation(
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
    state.setCurrentTranslation(preferredId, adopted);
  }
}

export async function bootstrapRuntimeTranslationsAndPreferences(): Promise<void> {
  await bootstrapRuntimeTranslations();
  await reconcilePrimaryTranslationPreference();
}
