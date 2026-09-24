import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { bibleBooks, getTranslatedBookName } from '../../../constants/books';
import {
  parsePassageReferenceLocale,
  warmReferenceParser,
  type LocalizedBookName,
} from '../../../services/bible/referenceParser';
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
  /** For the search field's focus: readies the reference parser before the first keystroke. */
  prepareSearch: () => void;
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

  // The book names the interface shows, so a reference typed with them opens the passage in
  // languages the reference grammar does not cover. `t` changes with the interface language.
  const bookNames = useMemo<LocalizedBookName[]>(
    () => bibleBooks.map((book) => ({ bookId: book.id, name: getTranslatedBookName(book.id, t) })),
    [t]
  );
  const parseRef = useCallback(
    (q: string) => parsePassageReferenceLocale(q, language, bookNames),
    [bookNames, language]
  );
  // Memoised on the trimmed query: the reference parser otherwise runs again on every unrelated
  // re-render, and a new intent for the same words (the space typed before the next word)
  // would run the same search again and re-announce its result count.
  const trimmedDeferredQuery = deferredSearchQuery.trim();
  const searchIntent = useMemo(
    () => resolveBibleSearchIntent(trimmedDeferredQuery, parseRef),
    [trimmedDeferredQuery, parseRef]
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
  // The reference parser's first parse costs tens of milliseconds and every keystroke runs it.
  // Pay that when the field gains focus, after the focus handling, while the keyboard animates
  // in, rather than on the first keystroke; users who never search never pay it.
  const prepareSearch = useCallback(() => {
    setTimeout(() => warmReferenceParser(language), 0);
  }, [language]);
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
    prepareSearch,
  };
}

function toSearchKey(translationId: string, query: string): string {
  return `${translationId}\u0000${query}`;
}
