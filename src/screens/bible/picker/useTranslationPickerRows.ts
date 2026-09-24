import { useEffect, useMemo, useState } from 'react';
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
import { buildTranslationPickerRows, hasSameIndexedCatalog } from './translationPickerRowsModel';

/**
 * The catalog snapshot the indexes were built from, kept while only download or install state
 * changes. The store hands the picker a new array on every audio progress tick; rebuilding the
 * search and language indexes over every Bible for that is wasted work while audio plays.
 */
function useIndexedCatalog(visibleTranslations: BibleTranslation[]): BibleTranslation[] {
  const [indexedCatalog, setIndexedCatalog] = useState(visibleTranslations);
  const isCurrent = hasSameIndexedCatalog(indexedCatalog, visibleTranslations);
  // Adjusted during render (not in an effect) so a changed catalog is never drawn stale.
  if (!isCurrent) {
    setIndexedCatalog(visibleTranslations);
  }
  return isCurrent ? indexedCatalog : visibleTranslations;
}

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

  // Everything built over the whole catalog reads this snapshot; the rows below still carry the
  // store's newest copy of each Bible so progress and install state stay live.
  const indexedCatalog = useIndexedCatalog(visibleTranslations);
  const languageFilters = useMemo(
    () => buildTranslationLanguageFilters(indexedCatalog),
    [indexedCatalog]
  );
  const searchIndex = useMemo(() => buildTranslationSearchIndex(indexedCatalog), [indexedCatalog]);
  // Indexed equivalent of filterTranslationsBySearchQuery: catalog normalization is reused.
  const matchingIds = useMemo(
    () =>
      hasActiveSearchQuery
        ? new Set(searchTranslationIndex(searchIndex, searchQuery).map(({ id }) => id))
        : null,
    [hasActiveSearchQuery, searchQuery, searchIndex]
  );
  const filteredTranslations = useMemo(
    () =>
      matchingIds
        ? visibleTranslations.filter((translation) => matchingIds.has(translation.id))
        : visibleTranslations,
    [matchingIds, visibleTranslations]
  );
  const resolvedPreferredLanguage = useMemo(
    () =>
      resolvePreferredTranslationLanguage(
        indexedCatalog,
        preferredTranslationLanguage,
        currentTranslation
      ),
    [currentTranslation, preferredTranslationLanguage, indexedCatalog]
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
    () => buildTranslationLanguageSearchIndex(indexedCatalog),
    [indexedCatalog]
  );
  const languageSearchResults = useMemo(
    () => (hasActiveSearchQuery ? searchTranslationIndex(languageSearchIndex, searchQuery) : []),
    [hasActiveSearchQuery, searchQuery, languageSearchIndex]
  );
  const languageOptions = useMemo(
    () => buildTranslationLanguageOptions(indexedCatalog, languageFilters),
    [indexedCatalog, languageFilters]
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
