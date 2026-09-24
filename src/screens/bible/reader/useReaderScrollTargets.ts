import type Animated from 'react-native-reanimated';
import type { RefObject } from 'react';
import { useCallback } from 'react';
import { FlatList } from 'react-native';
import { spacing } from '../../../design/system';
import { getReaderAutoScrollTarget, getReaderVerseContentOffset } from '../bibleReaderModel';
import type { ReaderParagraph } from '../bibleReaderModel';

export interface UseReaderScrollTargetsInput {
  isCurrentAudioChapter: boolean;
  paragraphHeightsRef: RefObject<Record<string, number>>;
  pendingReaderAutoScrollVerseRef: RefObject<number | null>;
  premiumReaderListRef: RefObject<FlatList<ReaderParagraph> | null>;
  premiumReaderParagraphs: ReaderParagraph[];
  readerContentTopPadding: number;
  readerFocusScrollRef: RefObject<{
    readonly pendingVerse: number | null;
    request(verse: number | null): void;
    flush(getOffset: (verse: number) => number | null, scroll: (offset: number) => void): boolean;
  }>;
  readerInlineActiveVerse: number | null;
  readerLastScrollOffsetYRef: RefObject<number>;
  readerListHeaderHeightRef: RefObject<number>;
  readerScrollViewportHeightRef: RefObject<number>;
  scrollViewRef: RefObject<Animated.ScrollView | null>;
  sharedTopChromeTop: number;
  showPremiumReadMode: boolean;
  verseOffsetsRef: RefObject<Record<number, number>>;
}

/** Scrolling the reader to a verse or offset: measured verse offsets when the paragraphs above are laid out, FlatList index scrolling until then, and the pending focus and follow-along targets retried from onLayout. */
export function useReaderScrollTargets({
  isCurrentAudioChapter,
  paragraphHeightsRef,
  pendingReaderAutoScrollVerseRef,
  premiumReaderListRef,
  premiumReaderParagraphs,
  readerContentTopPadding,
  readerFocusScrollRef,
  readerInlineActiveVerse,
  readerLastScrollOffsetYRef,
  readerListHeaderHeightRef,
  readerScrollViewportHeightRef,
  scrollViewRef,
  sharedTopChromeTop,
  showPremiumReadMode,
  verseOffsetsRef,
}: UseReaderScrollTargetsInput) {
  const scrollReaderToOffset = useCallback(
    (offsetY: number, animated: boolean) => {
      const y = Math.max(offsetY, 0);
      if (showPremiumReadMode) {
        premiumReaderListRef.current?.scrollToOffset({ offset: y, animated });
        return;
      }

      scrollViewRef.current?.scrollTo({
        y,
        animated,
      });
    },
    [showPremiumReadMode, premiumReaderListRef, scrollViewRef]
  );
  const scrollReaderToVerseParagraph = useCallback(
    (verseNumber: number, animated: boolean) => {
      if (!showPremiumReadMode) {
        return false;
      }

      const paragraphIndex = premiumReaderParagraphs.findIndex((paragraph) =>
        paragraph.verses.some((verse) => verse.verse === verseNumber)
      );
      if (paragraphIndex < 0) {
        return false;
      }

      try {
        premiumReaderListRef.current?.scrollToIndex({
          index: paragraphIndex,
          animated,
          viewPosition: 0,
          viewOffset: sharedTopChromeTop + spacing.md,
        });
        return true;
      } catch {
        return false;
      }
    },
    [premiumReaderParagraphs, sharedTopChromeTop, showPremiumReadMode, premiumReaderListRef]
  );
  // Scroll-content position of a verse. The premium reader is a virtualized
  // FlatList, so a paragraph's own onLayout `y` is cell-relative and unusable as
  // a scroll offset; offsets are accumulated from measured paragraph heights
  // instead. Only the legacy ScrollView reader lays paragraphs out directly in
  // content space, so only it can read verseOffsetsRef.
  const getReaderVerseOffset = useCallback(
    (verseNumber: number) => {
      if (showPremiumReadMode) {
        return getReaderVerseContentOffset({
          paragraphs: premiumReaderParagraphs,
          paragraphHeights: paragraphHeightsRef.current,
          contentTopOffset: readerContentTopPadding + readerListHeaderHeightRef.current,
          verseNumber,
        });
      }

      return verseOffsetsRef.current[verseNumber] ?? null;
    },
    [
      premiumReaderParagraphs,
      readerContentTopPadding,
      showPremiumReadMode,
      paragraphHeightsRef,
      readerListHeaderHeightRef,
      verseOffsetsRef,
    ]
  );
  const scrollReaderToMeasuredVerse = useCallback(
    (verseNumber: number, animated: boolean) => {
      const verseOffset = getReaderVerseOffset(verseNumber);
      if (verseOffset == null) {
        return false;
      }

      const targetOffset = getReaderAutoScrollTarget({
        currentScrollOffsetY: readerLastScrollOffsetYRef.current,
        viewportHeight: readerScrollViewportHeightRef.current,
        verseOffsetY: verseOffset,
        triggerViewportFraction: 0.48,
        targetTopOffset: readerContentTopPadding,
      });

      pendingReaderAutoScrollVerseRef.current = null;
      if (targetOffset == null) {
        return true;
      }

      scrollReaderToOffset(targetOffset, animated);
      return true;
    },
    [
      getReaderVerseOffset,
      readerContentTopPadding,
      scrollReaderToOffset,
      pendingReaderAutoScrollVerseRef,
      readerLastScrollOffsetYRef,
      readerScrollViewportHeightRef,
    ]
  );
  const flushPendingReaderFocus = useCallback(
    () =>
      readerFocusScrollRef.current.flush(getReaderVerseOffset, (offset) =>
        scrollReaderToOffset(offset - readerContentTopPadding, false)
      ),
    [getReaderVerseOffset, readerContentTopPadding, scrollReaderToOffset, readerFocusScrollRef]
  );
  const flushPendingReaderAutoScroll = useCallback(
    (animated: boolean) => {
      if (flushPendingReaderFocus()) return;
      const pendingVerse = pendingReaderAutoScrollVerseRef.current;
      if (
        pendingVerse == null ||
        !showPremiumReadMode ||
        !isCurrentAudioChapter ||
        pendingVerse !== readerInlineActiveVerse
      ) {
        return;
      }

      scrollReaderToMeasuredVerse(pendingVerse, animated);
    },
    [
      flushPendingReaderFocus,
      isCurrentAudioChapter,
      readerInlineActiveVerse,
      scrollReaderToMeasuredVerse,
      showPremiumReadMode,
      pendingReaderAutoScrollVerseRef,
    ]
  );

  return {
    flushPendingReaderAutoScroll,
    flushPendingReaderFocus,
    scrollReaderToMeasuredVerse,
    scrollReaderToOffset,
    scrollReaderToVerseParagraph,
  };
}
