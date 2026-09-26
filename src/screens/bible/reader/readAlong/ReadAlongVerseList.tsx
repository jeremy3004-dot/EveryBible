import { memo, useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../../../contexts/ThemeContext';
import { spacing, typography } from '../../../../design/system';
import type { Verse } from '../../../../types';
import { getReaderVerseLineHeight } from '../../bibleReaderModel';
import type { ChapterTrack } from './useChapterVerseTimestamps';
import { useTimedFollowAlongVerse } from './useTimedFollowAlongVerse';
import { getReadAlongScrollOffset, shouldAutoFollow } from './readAlongModel';

type VerseTimestamps = Record<number, number>;

/** How a verse is drawn: the one being spoken, the others while one is, or all alike. */
export type ReadAlongVerseEmphasis = 'current' | 'dimmed' | 'plain';

export interface ReadAlongTextStyle {
  fontSize: number;
  lineHeight: number;
  verseNumberSize: number;
  headingSize: number;
  /** The reading serif for the text's script, or undefined for the platform serif. */
  fontFamily: string | undefined;
  /** Its slightly bolder face for the verse being spoken. */
  currentFontFamily: string | undefined;
}

interface ReadAlongVerseRowProps {
  verse: Verse;
  emphasis: ReadAlongVerseEmphasis;
  textStyle: ReadAlongTextStyle;
  onVerseLayout: (verse: number, top: number) => void;
}

/**
 * One verse. Memoized on its emphasis, so a verse change redraws the verse that stops
 * being spoken and the one that starts, and nothing else.
 */
const ReadAlongVerseRow = memo(function ReadAlongVerseRow({
  verse,
  emphasis,
  textStyle,
  onVerseLayout,
}: ReadAlongVerseRowProps) {
  const { colors } = useTheme();
  const isCurrent = emphasis === 'current';
  const textColor = emphasis === 'dimmed' ? colors.bibleSecondaryText : colors.biblePrimaryText;
  const handleLayout = (event: LayoutChangeEvent) =>
    onVerseLayout(verse.verse, event.nativeEvent.layout.y);

  return (
    <View onLayout={handleLayout} style={styles.row} testID={`read-along-verse-${verse.verse}`}>
      {verse.heading ? (
        <Text
          accessibilityRole="header"
          style={[
            styles.heading,
            {
              color: colors.bibleSecondaryText,
              fontFamily: textStyle.currentFontFamily,
              fontSize: textStyle.headingSize,
              lineHeight: Math.round(textStyle.headingSize * 1.4),
            },
          ]}
        >
          {verse.heading}
        </Text>
      ) : null}
      <Text
        accessibilityState={isCurrent ? { selected: true } : undefined}
        style={[
          styles.verseText,
          {
            color: textColor,
            fontSize: textStyle.fontSize,
            lineHeight: textStyle.lineHeight,
            fontFamily: isCurrent ? textStyle.currentFontFamily : textStyle.fontFamily,
          },
          // A named custom face carries its own weight; the platform serif (non-Latin
          // scripts) needs the weight asked for.
          isCurrent && textStyle.currentFontFamily === undefined ? styles.bolder : null,
        ]}
      >
        <Text
          style={[
            styles.verseNumber,
            { color: colors.bibleAccent, fontSize: textStyle.verseNumberSize },
          ]}
        >
          {verse.verse}{' '}
        </Text>
        {verse.text}
      </Text>
    </View>
  );
});

export interface ReadAlongVerseListProps {
  track: ChapterTrack;
  verses: Verse[];
  timestamps: VerseTimestamps | null;
  /** The chapter is the one playing, so its verse can be followed. */
  canFollow: boolean;
  textStyle: ReadAlongTextStyle;
  bottomInset: number;
}

/**
 * The chapter in large text. The only part of Read Along that follows the playing
 * verse: it re-renders when the verse changes, and scrolls to keep it in view unless
 * the listener scrolled a moment ago.
 */
export const ReadAlongVerseList = memo(function ReadAlongVerseList({
  track,
  verses,
  timestamps,
  canFollow,
  textStyle,
  bottomInset,
}: ReadAlongVerseListProps) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView | null>(null);
  const verseTopsRef = useRef<Record<number, number>>({});
  const viewportHeightRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastManualScrollAtRef = useRef<number | null>(null);
  // A verse to bring into view as soon as its row has been measured.
  const pendingVerseRef = useRef<number | null>(null);
  const hasTimings = timestamps != null;
  const currentVerse = useTimedFollowAlongVerse({ track, timestamps, enabled: canFollow });

  const scrollToVerse = useCallback(
    (verse: number, animated: boolean) => {
      const top = verseTopsRef.current[verse];
      if (top == null || viewportHeightRef.current <= 0) {
        pendingVerseRef.current = verse;
        return;
      }
      pendingVerseRef.current = null;
      scrollRef.current?.scrollTo({
        y: getReadAlongScrollOffset({ verseTopY: top, viewportHeight: viewportHeightRef.current }),
        animated: animated && !reduceMotion,
      });
    },
    [reduceMotion]
  );

  useEffect(() => {
    if (currentVerse == null || isDraggingRef.current) return;
    if (
      !shouldAutoFollow({ nowMs: Date.now(), lastManualScrollAtMs: lastManualScrollAtRef.current })
    )
      return;
    scrollToVerse(currentVerse, true);
  }, [currentVerse, scrollToVerse]);

  // A new chapter starts at its top, following again. Its rows report their own tops
  // as they lay out, replacing the last chapter's.
  const chapterKey = `${track.translationId}:${track.bookId}:${track.chapter}`;
  const shownChapterKeyRef = useRef(chapterKey);
  useEffect(() => {
    if (shownChapterKeyRef.current === chapterKey) return;
    shownChapterKeyRef.current = chapterKey;
    lastManualScrollAtRef.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [chapterKey]);

  const handleVerseLayout = useCallback(
    (verse: number, top: number) => {
      verseTopsRef.current[verse] = top;
      if (pendingVerseRef.current === verse) scrollToVerse(verse, false);
    },
    [scrollToVerse]
  );

  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      const pending = pendingVerseRef.current;
      if (pending != null) scrollToVerse(pending, false);
    },
    [scrollToVerse]
  );

  const handleScrollBeginDrag = useCallback(() => {
    isDraggingRef.current = true;
    lastManualScrollAtRef.current = Date.now();
  }, []);
  // The pause runs from the moment the finger (or the fling it started) lets go.
  const handleScrollEnd = useCallback(() => {
    isDraggingRef.current = false;
    lastManualScrollAtRef.current = Date.now();
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onLayout={handleViewportLayout}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEnd}
      onMomentumScrollEnd={handleScrollEnd}
      scrollEventThrottle={16}
    >
      {verses.map((verse) => (
        <ReadAlongVerseRow
          key={verse.id}
          verse={verse}
          emphasis={
            !hasTimings || currentVerse == null
              ? 'plain'
              : verse.verse === currentVerse
                ? 'current'
                : 'dimmed'
          }
          textStyle={textStyle}
          onVerseLayout={handleVerseLayout}
        />
      ))}
    </ScrollView>
  );
});

/** Read Along's type scale for a reader font-size scale and reading serif. */
export function buildReadAlongTextStyle(
  scaleValue: (baseSize: number) => number,
  fontFamily: string | undefined,
  currentFontFamily: string | undefined
): ReadAlongTextStyle {
  const fontSize = scaleValue(READ_ALONG_BODY_SIZE);
  return {
    fontSize,
    lineHeight: getReaderVerseLineHeight(fontSize),
    verseNumberSize: scaleValue(typography.readingVerseNumber.fontSize),
    headingSize: scaleValue(typography.readingHeading.fontSize),
    fontFamily,
    currentFontFamily,
  };
}

// Large text: a third bigger than the reader's body size, then the reader's own scale.
const READ_ALONG_BODY_SIZE = Math.round(typography.readingBody.fontSize * 1.33);

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    gap: spacing.sm,
  },
  heading: {
    ...typography.readingHeading,
  },
  verseText: {
    ...typography.readingBody,
  },
  bolder: {
    fontWeight: '600',
  },
  verseNumber: {
    ...typography.readingVerseNumber,
  },
});
