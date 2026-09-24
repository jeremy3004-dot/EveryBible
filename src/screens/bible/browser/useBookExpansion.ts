import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import type { FlashList } from '@shopify/flash-list';
import { getBookById } from '../../../constants/books';
import type { BibleBrowserRow } from '../../../services/bible/browserRows';
import { chapterKey, getBibleBrowserRowIndex } from './bibleBrowserModel';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface BookExpansionState {
  expandedBookId: string | null;
  /** `bookId:chapter` of the tapped chapter that has no content, shown as a note under the grid. */
  unavailableChapterKey: string | null;
  listRef: RefObject<FlashList<BibleBrowserRow> | null>;
  initialScrollIndex: number;
  toggleBook: (bookId: string) => void;
  showUnavailableChapter: (bookId: string, chapter: number) => void;
  clearUnavailableChapter: () => void;
}

/**
 * Which book is open in the browser. A valid route book (`initialBookId`) wins
 * and opens without an imperative scroll; otherwise the list follows the saved
 * reading position, re-expanding and scrolling to it whenever it changes.
 */
export function useBookExpansion(
  currentBook: string,
  initialBookId: string | null,
  translationId: string
): BookExpansionState {
  const hasExplicitInitialBook = initialBookId != null && Boolean(getBookById(initialBookId));
  const resolvedInitialBookId = hasExplicitInitialBook ? initialBookId : currentBook;
  const [expandedBookId, setExpandedBookId] = useState<string | null>(resolvedInitialBookId);
  const [unavailableChapterKey, setUnavailableChapterKey] = useState<string | null>(null);
  const listRef = useRef<FlashList<BibleBrowserRow> | null>(null);
  const initialScrollIndex = Math.max(0, getBibleBrowserRowIndex(resolvedInitialBookId));

  useEffect(() => {
    // A "not available" note describes the translation it was shown for. Kept as an
    // effect (moved unchanged from the screen) so the note clears after the switch commits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnavailableChapterKey(null);
  }, [translationId]);

  useEffect(() => {
    if (hasExplicitInitialBook) {
      return;
    }

    // Follows the saved reading position, which the reader changes in the store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedBookId(currentBook);

    const rowIndex = getBibleBrowserRowIndex(currentBook);
    if (rowIndex < 0) {
      return;
    }

    const animationFrameId = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: rowIndex,
        animated: false,
        viewPosition: 0.15,
      });
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentBook, hasExplicitInitialBook]);

  const toggleBook = useCallback((bookId: string) => {
    // An unavailable book still expands: the row opens onto the "not available yet"
    // note instead of a chapter grid, which keeps the explanation where the reader
    // tapped. A system alert cannot be used here — this screen is often presented
    // modally, and UIAlertController never surfaces above that modal.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setUnavailableChapterKey(null);
    setExpandedBookId((prev) => (prev === bookId ? null : bookId));
  }, []);

  const showUnavailableChapter = useCallback((bookId: string, chapter: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setUnavailableChapterKey(chapterKey(bookId, chapter));
  }, []);

  const clearUnavailableChapter = useCallback(() => setUnavailableChapterKey(null), []);

  return {
    expandedBookId,
    unavailableChapterKey,
    listRef,
    initialScrollIndex,
    toggleBook,
    showUnavailableChapter,
    clearUnavailableChapter,
  };
}
