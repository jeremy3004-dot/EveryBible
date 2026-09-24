import { useEffect, useMemo, useState } from 'react';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../../services/translations';
import { useBibleStore } from '../../../stores/bibleStore';
import {
  getVisibleTranslationsForPicker,
  startRuntimeCatalogHydration,
} from '../bibleTranslationModel';

/**
 * The translations the picker can show, and the runtime catalog load it starts on open.
 * While that load runs and no runtime rows are cached yet, runtime placeholders the reader
 * cannot open are left out and rows are disabled.
 */
export function useTranslationPickerCatalog() {
  const translations = useBibleStore((state) => state.translations);
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(false);
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

  const visibleTranslations = useMemo(
    () =>
      getVisibleTranslationsForPicker(translations, {
        isHydratingRuntimeCatalog,
        hasHydratedRuntimeCatalog,
      }),
    [translations, hasHydratedRuntimeCatalog, isHydratingRuntimeCatalog]
  );

  // Cached rows can belong to only one source. Let the shared per-launch gate decide
  // whether a refresh is needed so reopening the picker retries partial failures.
  useEffect(
    () => startRuntimeCatalogHydration(ensureRuntimeCatalogLoaded, setIsHydratingRuntimeCatalog),
    []
  );

  return {
    translations,
    visibleTranslations,
    hasHydratedRuntimeCatalog,
    setIsHydratingRuntimeCatalog,
    /** The catalog is loading and nothing from it is cached: show the note, disable rows. */
    isCatalogLoading: isHydratingRuntimeCatalog && !hasHydratedRuntimeCatalog,
  };
}
