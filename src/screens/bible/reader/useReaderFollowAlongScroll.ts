import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import type { Verse } from '../../../types';

// Type-only, spelled as an import type so the large timestamp map stays off the reader's open path.
type VerseTimestamps = import('../../../services/bible/verseTimestamps').VerseTimestamps;

export interface UseReaderFollowAlongScrollInput {
  activeFollowAlongVerse: number | null;
  bookId: string;
  chapter: number;
  currentTranslation: string;
  didRestartFollowAlongPlayback: boolean;
  flushPendingReaderFocus: () => boolean;
  focusVerse: number | undefined;
  followAlongOffsetsRef: RefObject<Record<number, number>>;
  followAlongScrollViewRef: RefObject<ScrollView | null>;
  isCurrentAudioChapter: boolean;
  isLoading: boolean;
  pendingReaderAutoScrollVerseRef: RefObject<number | null>;
  readerFocusScrollRef: RefObject<{
    readonly pendingVerse: number | null;
    request(verse: number | null): void;
    flush(getOffset: (verse: number) => number | null, scroll: (offset: number) => void): boolean;
  }>;
  readerInlineActiveVerse: number | null;
  scrollReaderToMeasuredVerse: (verseNumber: number, animated: boolean) => boolean;
  scrollReaderToOffset: (offsetY: number, animated: boolean) => void;
  scrollReaderToVerseParagraph: (verseNumber: number, animated: boolean) => boolean;
  setChapterTimestamps: Dispatch<SetStateAction<VerseTimestamps | null>>;
  showFollowAlongText: boolean;
  showPremiumReadMode: boolean;
  verses: Verse[];
}

/** Keeps the verse being read or listened to in view: the plan focus verse, the follow-along sheet and the read-mode band, plus the verse timestamps they need. */
export function useReaderFollowAlongScroll({
  activeFollowAlongVerse,
  bookId,
  chapter,
  currentTranslation,
  didRestartFollowAlongPlayback,
  flushPendingReaderFocus,
  focusVerse,
  followAlongOffsetsRef,
  followAlongScrollViewRef,
  isCurrentAudioChapter,
  isLoading,
  pendingReaderAutoScrollVerseRef,
  readerFocusScrollRef,
  readerInlineActiveVerse,
  scrollReaderToMeasuredVerse,
  scrollReaderToOffset,
  scrollReaderToVerseParagraph,
  setChapterTimestamps,
  showFollowAlongText,
  showPremiumReadMode,
  verses,
}: UseReaderFollowAlongScrollInput) {
  useEffect(() => {
    if (isLoading || focusVerse == null) {
      return;
    }

    if (!flushPendingReaderFocus() && readerFocusScrollRef.current.pendingVerse != null) {
      scrollReaderToVerseParagraph(focusVerse, false);
    }
  }, [
    focusVerse,
    flushPendingReaderFocus,
    isLoading,
    scrollReaderToVerseParagraph,
    verses,
    readerFocusScrollRef,
  ]);

  useEffect(() => {
    if (!showFollowAlongText || activeFollowAlongVerse == null) {
      return;
    }

    const verseOffset = followAlongOffsetsRef.current[activeFollowAlongVerse];
    if (verseOffset == null) {
      return;
    }

    followAlongScrollViewRef.current?.scrollTo({
      y: Math.max(verseOffset - 140, 0),
      animated: true,
    });
  }, [
    activeFollowAlongVerse,
    showFollowAlongText,
    followAlongOffsetsRef,
    followAlongScrollViewRef,
  ]);

  useEffect(() => {
    if (!showPremiumReadMode || !isCurrentAudioChapter || readerInlineActiveVerse == null) {
      pendingReaderAutoScrollVerseRef.current = null;
      return;
    }

    if (didRestartFollowAlongPlayback) {
      pendingReaderAutoScrollVerseRef.current = null;
      scrollReaderToOffset(0, true);
      return;
    }

    // Until the paragraphs above the verse have been measured its content
    // offset is unknown, so fall back to FlatList's own index scrolling and
    // retry from onLayout once the measurements land.
    if (!scrollReaderToMeasuredVerse(readerInlineActiveVerse, true)) {
      pendingReaderAutoScrollVerseRef.current = readerInlineActiveVerse;
      scrollReaderToVerseParagraph(readerInlineActiveVerse, true);
    }
  }, [
    didRestartFollowAlongPlayback,
    isCurrentAudioChapter,
    readerInlineActiveVerse,
    scrollReaderToOffset,
    scrollReaderToMeasuredVerse,
    scrollReaderToVerseParagraph,
    showPremiumReadMode,
    pendingReaderAutoScrollVerseRef,
  ]);

  // Fetch verse timestamps for the active text-backed audio chapter; clear when chapter changes.
  useEffect(() => {
    if (!showFollowAlongText && (!isCurrentAudioChapter || verses.length === 0)) return;

    let isCancelled = false;
    setChapterTimestamps(null);

    void import('../../../services/bible/verseTimestamps')
      .then(({ getChapterTimestamps }) => getChapterTimestamps(currentTranslation, bookId, chapter))
      .then((timestamps) => {
        if (!isCancelled) {
          setChapterTimestamps(timestamps);
        }
      })
      .catch((timestampsError) => {
        if (!isCancelled) {
          console.error('Error loading verse timestamps:', timestampsError);
          setChapterTimestamps(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    showFollowAlongText,
    isCurrentAudioChapter,
    verses.length,
    currentTranslation,
    bookId,
    chapter,
    setChapterTimestamps,
  ]);
}
