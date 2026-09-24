import { memo, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getTranslatedBookName, type BibleBook } from '../../../constants/books';
import { useTheme } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import {
  getChapterContentAvailability,
  type TranslationContentSummary,
} from '../../../services/bible/contentAvailability';
import {
  getTranslatorFeedbackChapterSummaryStatus,
  type TranslatorFeedbackAggregateStatus,
  type TranslatorFeedbackChapterSummary,
} from '../../../services/feedback/translatorFeedbackReviewModel';
import { CHAPTER_TILE_GAP, CHAPTER_TILE_MAX_FONT_SCALE } from '../chapterTileLayout';
import { chapterKey, getChapterNumbers, isUnavailableChapterInBook } from './bibleBrowserModel';
import { browserStyles } from './browserStyles';
import { TranslatorFeedbackBadge } from './TranslatorFeedbackBadge';
import { announceLiveRegionText } from '../../../utils/a11y';
import { CHAPTER_GRID_HORIZONTAL_INSET, type ChapterTileSizeStyle } from './useChapterTileLayout';

export interface BookChapterPanelProps {
  tileSizeStyle: ChapterTileSizeStyle;
  onPanelLayout: (event: LayoutChangeEvent) => void;
  availabilityTranslation: TranslationContentSummary | undefined;
  /** Null when translator review is off, so no chapter shows a badge. */
  summaryByChapter: Map<string, TranslatorFeedbackChapterSummary> | null;
  unavailableChapterKey: string | null;
  onPressChapter: (bookId: string, chapter: number) => void;
}

/** Small enough to sit in a 48pt tile's corner clear of a three-digit number. */
const CHAPTER_TILE_LOCK_SIZE = 10;

interface ChapterTileProps {
  bookId: string;
  chapter: number;
  isAvailable: boolean;
  feedbackStatus: TranslatorFeedbackAggregateStatus | null;
  tileSizeStyle: ChapterTileSizeStyle;
  onPress: (bookId: string, chapter: number) => void;
}

const ChapterTile = memo(function ChapterTile({
  bookId,
  chapter,
  isAvailable,
  feedbackStatus,
  tileSizeStyle,
  onPress,
}: ChapterTileProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[
        styles.chapterButton,
        tileSizeStyle,
        { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
        !isAvailable && browserStyles.unavailable,
      ]}
      onPress={() => onPress(bookId, chapter)}
      activeOpacity={0.7}
      accessibilityRole="button"
      // A value, not a hint: hints can be switched off, and the dimmed tile is
      // otherwise the only sign the chapter will not open.
      accessibilityValue={isAvailable ? undefined : { text: t('bible.notAvailableYet') }}
    >
      <Text
        maxFontSizeMultiplier={CHAPTER_TILE_MAX_FONT_SCALE}
        style={[
          styles.chapterNumber,
          { color: isAvailable ? colors.biblePrimaryText : colors.bibleSecondaryText },
        ]}
      >
        {chapter}
      </Text>
      {/* The dimming alone left "not available" to colour; the lock matches the
          unavailable book row's. The tile's value already says it aloud. */}
      {isAvailable ? null : (
        <Ionicons
          name="lock-closed"
          size={CHAPTER_TILE_LOCK_SIZE}
          color={colors.bibleSecondaryText}
          style={styles.lockIcon}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <TranslatorFeedbackBadge status={feedbackStatus} />
    </TouchableOpacity>
  );
});

/** The expanded book's chapter grid, with the "not available yet" note for a tapped chapter. */
export function BookChapterPanel({
  book,
  tileSizeStyle,
  onPanelLayout,
  availabilityTranslation,
  summaryByChapter,
  unavailableChapterKey,
  onPressChapter,
}: BookChapterPanelProps & { book: BibleBook }) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.panel, { backgroundColor: colors.bibleElevatedSurface }]}
      onLayout={onPanelLayout}
    >
      <View style={styles.grid}>
        {getChapterNumbers(book.chapters).map((chapter) => {
          const summary = summaryByChapter?.get(chapterKey(book.id, chapter));
          return (
            <ChapterTile
              key={chapter}
              bookId={book.id}
              chapter={chapter}
              isAvailable={
                getChapterContentAvailability(book, chapter, availabilityTranslation).isAvailable
              }
              feedbackStatus={summary ? getTranslatorFeedbackChapterSummaryStatus(summary) : null}
              tileSizeStyle={tileSizeStyle}
              onPress={onPressChapter}
            />
          );
        })}
      </View>
      {isUnavailableChapterInBook(unavailableChapterKey, book.id) && (
        <ComingSoonNote chapterKey={unavailableChapterKey} />
      )}
    </View>
  );
}

/**
 * Why a tapped chapter did not open. It appears below the grid while focus stays
 * on the tile, so it is spoken each time another unavailable chapter is tapped.
 */
function ComingSoonNote({ chapterKey: tappedChapterKey }: { chapterKey: string | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const message = t('bible.fullBibleComingSoon');

  useEffect(() => {
    announceLiveRegionText(message);
  }, [message, tappedChapterKey]);

  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.noticeBody, { color: colors.bibleSecondaryText }]}
    >
      {message}
    </Text>
  );
}

/** What an expanded book with no content shows in place of its chapter grid. */
export function UnavailableBookNotice({ bookId }: { bookId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.panel, { backgroundColor: colors.bibleElevatedSurface }]}>
      <Text style={[styles.noticeTitle, { color: colors.biblePrimaryText }]}>
        {t('bible.notAvailableYet')}
      </Text>
      <Text style={[styles.noticeBody, { color: colors.bibleSecondaryText }]}>
        {t('bible.bookComingSoon', { book: getTranslatedBookName(bookId, t) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingVertical: spacing.md,
    paddingHorizontal: CHAPTER_GRID_HORIZONTAL_INSET,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CHAPTER_TILE_GAP,
  },
  // Width and height come from getChapterTileLayout so the tiles fill the row.
  chapterButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-right: the translator feedback badge owns the top-right corner.
  lockIcon: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
  },
  chapterNumber: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  noticeTitle: {
    ...typography.captionStrong,
    paddingHorizontal: spacing.sm,
  },
  noticeBody: {
    ...typography.caption,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
});
