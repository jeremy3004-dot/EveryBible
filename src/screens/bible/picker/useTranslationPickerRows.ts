import { useEffect, useMemo } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { useBibleStore } from '../../../stores/bibleStore';
import { useTranslationPreferenceStore } from '../../../stores/translationPreferenceStore';
import type { BibleTranslation } from '../../../types';
import {
  buildTranslationLanguageFilters,
  buildTranslationLanguageOptions,
  buildTranslationLanguageSearchIndex,
  buildTranslationPickerSections,
  buildTranslationSearchIndex,
  getTranslationLanguageDisplayLabel,
  resolvePreferredTranslationLanguage,
  searchTranslationIndex,
} from '../bibleTranslationModel';
import { buildTranslationPickerRows } from './translationPickerRowsModel';

/**
 * The picker list's rows for a query: matching languages while searching (or the language
 * pill), then My Translations, then Available in the reader's language. Keeps the stored
 * language preference pointed at a language the catalog still has.
 */
export function useTranslationPickerRows(
  visibleTranslations: BibleTranslation[],
  searchQuery: string
) {
  const { t } = useI18n();
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const preferredTranslationLanguage = useBibleStore((state) => state.preferredTranslationLanguage);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const pinnedIds = useTranslationPreferenceStore((state) => state.pinnedIds);
  const hiddenIds = useTranslationPreferenceStore((state) => state.hiddenIds);
  const hasActiveSearchQuery = searchQuery.trim().length > 0;

  const languageFilters = useMemo(
    () => buildTranslationLanguageFilters(visibleTranslations),
    [visibleTranslations]
  );
  const searchIndex = useMemo(
    () => buildTranslationSearchIndex(visibleTranslations),
    [visibleTranslations]
  );
  // Indexed equivalent of filterTranslationsBySearchQuery: catalog normalization is reused.
  const filteredTranslations = useMemo(
    () => searchTranslationIndex(searchIndex, searchQuery),
    [searchQuery, searchIndex]
  );
  const resolvedPreferredLanguage = useMemo(
    () =>
      resolvePreferredTranslationLanguage(
        visibleTranslations,
        preferredTranslationLanguage,
        currentTranslation
      ),
    [currentTranslation, preferredTranslationLanguage, visibleTranslations]
  );
  const sections = useMemo(
    () =>
      buildTranslationPickerSections(filteredTranslations, resolvedPreferredLanguage, {
        includeAllAvailableTranslations: hasActiveSearchQuery,
        pinnedIds,
        hiddenIds,
        currentTranslationId: currentTranslation,
      }),
    [
      filteredTranslations,
      hasActiveSearchQuery,
      resolvedPreferredLanguage,
      pinnedIds,
      hiddenIds,
      currentTranslation,
    ]
  );
  const languageSearchIndex = useMemo(
    () => buildTranslationLanguageSearchIndex(visibleTranslations),
    [visibleTranslations]
  );
  const languageSearchResults = useMemo(
    () => (searchQuery.trim() ? searchTranslationIndex(languageSearchIndex, searchQuery) : []),
    [searchQuery, languageSearchIndex]
  );
  const languageOptions = useMemo(
    () => buildTranslationLanguageOptions(visibleTranslations, languageFilters),
    [languageFilters, visibleTranslations]
  );

  useEffect(() => {
    if (resolvedPreferredLanguage && preferredTranslationLanguage !== resolvedPreferredLanguage) {
      setPreferredTranslationLanguage(resolvedPreferredLanguage);
    }
  }, [preferredTranslationLanguage, resolvedPreferredLanguage, setPreferredTranslationLanguage]);

  const rows = useMemo(
    () =>
      buildTranslationPickerRows({
        hasActiveSearchQuery,
        languageSearchResults,
        languageOptionCount: languageOptions.length,
        sections,
        availableLanguageLabel: getTranslationLanguageDisplayLabel(resolvedPreferredLanguage),
        labels: {
          myTranslations: t('translations.myTranslations'),
          available: t('translations.available'),
        },
      }),
    [
      hasActiveSearchQuery,
      languageOptions.length,
      languageSearchResults,
      resolvedPreferredLanguage,
      sections,
      t,
    ]
  );

  return { rows, languageOptions, resolvedPreferredLanguage, currentTranslation };
}
