import type { BibleTranslation } from '../../types';
import { useBibleStore } from '../../stores/bibleStore';
import {
  getUserTranslationPreferences,
  listAvailableTranslations,
  mapCatalogEntryToBibleTranslation,
} from './translationService';

let runtimeCatalogHydrationPromise: Promise<void> | null = null;
let hasHydratedRuntimeCatalogThisLaunch = false;

export function hasRuntimeCatalogTranslations(translations: BibleTranslation[]): boolean {
  return translations.some((translation) => translation.source === 'runtime');
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
  if (!catalogResult.success || !catalogResult.data || catalogResult.data.length === 0) {
    return;
  }

  const currentStoreTranslations = useBibleStore.getState().translations;
  const runtimeTranslations = catalogResult.data.map((entry) =>
    mapCatalogEntryToBibleTranslation(
      entry,
      currentStoreTranslations.find((translation) => translation.id === entry.translation_id)
    )
  );

  useBibleStore.getState().applyRuntimeCatalog(runtimeTranslations);
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
  const preferredTranslation = state.translations.find((translation) => translation.id === preferredId);

  if (!preferredTranslation || !isReadableLocally(preferredTranslation)) {
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
