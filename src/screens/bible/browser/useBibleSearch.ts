import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { parsePassageReferenceLocale } from '../../../services/bible/referenceParser';
import type { Verse } from '../../../types';
import { announceForAccessibility, announceLiveRegionText } from '../../../utils/a11y';
import {
  BIBLE_SEARCH_DEBOUNCE_MS,
  resolveBibleSearchIntent,
  type BibleSearchIntent,
} from '../bibleSearchModel';
import { isBibleSearchUnavailableError } from './bibleBrowserModel';

export interface BibleSearchState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  /** What the (deferred) query means: idle, a passage reference, or a full-text search. */
  searchIntent: BibleSearchIntent;
  searchResults: Verse[];
  isSearching: boolean;
  searchError: string | null;
  /** The current full-text query finished and matched nothing. */
  hasNoResults: boolean;
  /** Resolves the live (not deferred) query, for a keyboard submit. */
  resolveSubmitIntent: () => BibleSearchIntent;
}

/**
 * The browser's search field: a typed passage reference resolves locally, and
 * anything else runs a debounced full-text search. The SQLite-backed search
 * service is imported only once a full-text query is due, so it stays out of
 * the browser's first render. Stale responses are dropped by request id.
 */
export function useBibleSearch(
  translationId: string,
  language: string,
  t: TFunction
): BibleSearchState {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Verse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Which translation + query the current results answer, so "no results" is shown only
  // for a search that actually finished, not while a new query waits for its debounce.
  const [completedSearchKey, setCompletedSearchKey] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const parseRef = useCallback((q: string) => parsePassageReferenceLocale(q, language), [language]);
  // Memoised: the reference parser otherwise runs again on every unrelated re-render.
  const searchIntent = useMemo(
    () => resolveBibleSearchIntent(deferredSearchQuery, parseRef),
    [deferredSearchQuery, parseRef]
  );
  const failedToLoadMessage = t('bible.failedToLoad');
  const searchUnavailableMessage = t('bible.searchUnavailable');

  useEffect(() => {
    let isCancelled = false;

    if (searchIntent.kind !== 'full-text') {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setCompletedSearchKey(null);
      setSearchError(null);
      setIsSearching(false);

      return () => {
        isCancelled = true;
      };
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setIsSearching(true);
    setSearchError(null);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const { searchBible } = await import('../../../services/bible/bibleService');
          const results = await searchBible(translationId, searchIntent.query);

          if (!isCancelled && requestId === searchRequestIdRef.current) {
            setSearchResults(results);
            setCompletedSearchKey(toSearchKey(translationId, searchIntent.query));
            // Results land under the search field while focus stays in it; without
            // this a screen-reader user cannot tell a finished search (or an empty
            // one) from a search still running.
            announceForAccessibility(t('interface.searchResultCount', { count: results.length }));
          }
        } catch (error) {
          if (!isCancelled && requestId === searchRequestIdRef.current) {
            console.error('Error searching Bible:', error);
            setSearchResults([]);
            const message = isBibleSearchUnavailableError(error)
              ? searchUnavailableMessage
              : failedToLoadMessage;
            setSearchError(message);
            // The error text's live region speaks on Android; VoiceOver needs the announcement.
            announceLiveRegionText(message);
          }
        } finally {
          if (!isCancelled && requestId === searchRequestIdRef.current) {
            setIsSearching(false);
          }
        }
      })();
    }, BIBLE_SEARCH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [translationId, searchIntent, failedToLoadMessage, searchUnavailableMessage, t]);

  const hasNoResults =
    searchIntent.kind === 'full-text' &&
    completedSearchKey === toSearchKey(translationId, searchIntent.query) &&
    !isSearching &&
    searchError === null &&
    searchResults.length === 0;

  const clearSearch = useCallback(() => setSearchQuery(''), []);
  const resolveSubmitIntent = useCallback(
    () => resolveBibleSearchIntent(searchQuery, parseRef),
    [parseRef, searchQuery]
  );

  return {
    searchQuery,
    setSearchQuery,
    clearSearch,
    searchIntent,
    searchResults,
    isSearching,
    searchError,
    hasNoResults,
    resolveSubmitIntent,
  };
}

function toSearchKey(translationId: string, query: string): string {
  return `${translationId}\u0000${query}`;
}
