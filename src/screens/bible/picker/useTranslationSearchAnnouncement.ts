import { useEffect } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { announceForAccessibility } from '../../../utils';
import type { TranslationPickerRow } from './translationPickerRowsModel';

/** Long enough that a fast typist hears one count for the query, not one per letter. */
export const TRANSLATION_SEARCH_ANNOUNCEMENT_DELAY_MS = 700;

/**
 * Matches redraw under the search field while focus stays in it, so a screen-reader user
 * cannot tell what a query found. Once typing pauses, the picker speaks how many Bibles
 * match, or the no-results message the list shows when nothing does. Keyed on the query
 * and the count, so a download tick that redraws the same rows says nothing.
 */
export function useTranslationSearchAnnouncement(
  rows: readonly TranslationPickerRow[],
  searchQuery: string
): void {
  const { t } = useI18n();
  const query = searchQuery.trim();
  const bibleCount = rows.filter((row) => row.type === 'translation').length;
  const hasNoMatches = rows.length === 0;

  useEffect(() => {
    if (!query) return;
    const handle = setTimeout(() => {
      announceForAccessibility(
        hasNoMatches
          ? t('bible.translationSearchNoResults')
          : t('bible.translationSearchResultCount', { count: bibleCount })
      );
    }, TRANSLATION_SEARCH_ANNOUNCEMENT_DELAY_MS);
    return () => clearTimeout(handle);
  }, [bibleCount, hasNoMatches, query, t]);
}
