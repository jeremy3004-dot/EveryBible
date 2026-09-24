import { useCallback, useMemo, type ReactElement, type RefObject } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { FlashList, type ContentStyle, type ListRenderItem } from '@shopify/flash-list';
import type { BibleBrowserRow } from '../../../services/bible/browserRows';
import {
  getBookContentAvailability,
  type TranslationContentSummary,
} from '../../../services/bible/contentAvailability';
import type {
  TranslatorFeedbackAggregateStatus,
  TranslatorFeedbackChapterSummary,
} from '../../../services/feedback/translatorFeedbackReviewModel';
import {
  BIBLE_BROWSER_ROW_ESTIMATED_SIZE,
  bibleBrowserRows,
  browserRowKey,
  browserRowType,
} from './bibleBrowserModel';
import { BibleBookRow } from './BibleBookRow';
import type { BookChapterPanelProps } from './BookChapterPanel';
import { TestamentDivider } from './TestamentDivider';
import type { ChapterTileSizeStyle } from './useChapterTileLayout';

interface BibleBookListProps {
  listRef: RefObject<FlashList<BibleBrowserRow> | null>;
  initialScrollIndex: number;
  contentContainerStyle: ContentStyle;
  header: ReactElement;
  expandedBookId: string | null;
  unavailableChapterKey: string | null;
  availabilityTranslation: TranslationContentSummary | undefined;
  showFeedbackBadges: boolean;
  statusByBook: Map<string, TranslatorFeedbackAggregateStatus>;
  summaryByChapter: Map<string, TranslatorFeedbackChapterSummary>;
  tileSizeStyle: ChapterTileSizeStyle;
  onPanelLayout: (event: LayoutChangeEvent) => void;
  onPressBook: (bookId: string) => void;
  onPressChapter: (bookId: string, chapter: number) => void;
}

/** Every book of the Bible in one list; the expanded book shows its chapters. */
export function BibleBookList({
  listRef,
  initialScrollIndex,
  contentContainerStyle,
  header,
  expandedBookId,
  unavailableChapterKey,
  availabilityTranslation,
  showFeedbackBadges,
  statusByBook,
  summaryByChapter,
  tileSizeStyle,
  onPanelLayout,
  onPressBook,
  onPressChapter,
}: BibleBookListProps) {
  // One object for the open book's grid, rebuilt only when something it shows changes.
  const panel = useMemo<BookChapterPanelProps>(
    () => ({
      tileSizeStyle,
      onPanelLayout,
      availabilityTranslation,
      summaryByChapter: showFeedbackBadges ? summaryByChapter : null,
      unavailableChapterKey,
      onPressChapter,
    }),
    [
      availabilityTranslation,
      onPanelLayout,
      onPressChapter,
      showFeedbackBadges,
      summaryByChapter,
      tileSizeStyle,
      unavailableChapterKey,
    ]
  );

  const renderRow = useCallback<ListRenderItem<BibleBrowserRow>>(
    ({ item }) => {
      if (item.type === 'divider') {
        return <TestamentDivider testament={item.testament} />;
      }

      const book = item.books[0];
      if (!book) return null;
      return (
        <BibleBookRow
          book={book}
          isAvailable={getBookContentAvailability(book, availabilityTranslation).isAvailable}
          feedbackStatus={showFeedbackBadges ? (statusByBook.get(book.id) ?? null) : null}
          onPressBook={onPressBook}
          panel={book.id === expandedBookId ? panel : undefined}
        />
      );
    },
    [availabilityTranslation, expandedBookId, onPressBook, panel, showFeedbackBadges, statusByBook]
  );

  return (
    <FlashList
      ref={listRef}
      data={bibleBrowserRows}
      initialScrollIndex={initialScrollIndex}
      renderItem={renderRow}
      ListHeaderComponent={header}
      keyExtractor={browserRowKey}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      estimatedItemSize={BIBLE_BROWSER_ROW_ESTIMATED_SIZE}
      getItemType={browserRowType}
      // FlashList cells re-render only when extraData changes. renderRow already
      // changes exactly when anything a row shows changes, so it is the marker;
      // the memoised rows then skip every row whose own props are unchanged.
      extraData={renderRow}
    />
  );
}
