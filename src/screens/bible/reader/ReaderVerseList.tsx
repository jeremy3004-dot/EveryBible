import { StyleSheet, FlatList, Pressable, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../../design/system';
import {
  buildReaderParagraphs,
  canSelectDisplayedVerse,
  getReaderVerseLineHeight,
  getNextFontSizeSheetVisibility,
  getNextTranslationSheetVisibility,
} from '../bibleReaderModel';
import type { ScrollHandlerProcessed } from 'react-native-reanimated';
import type { createReaderFocusScroll } from '../readerFocusScroll';
import type { Dispatch, RefObject, SetStateAction, ReactElement } from 'react';
import Animated from 'react-native-reanimated';
import { useTheme } from '../../../contexts/ThemeContext';
import { selectionHaptic } from '../../../utils/haptics';
import { HighlightedVerseText } from '../../../components/bible/HighlightedVerseText';
import type { Verse } from '../../../types';
import type { UserAnnotation } from '../../../services/supabase/types';
import { toggleBibleSelectionVerse } from '../bibleSelectionModel';
import { buildReaderParagraphRenderSignature } from '../bibleReaderRenderModel';
import type { ReaderParagraph } from '../bibleReaderModel';
import { readerSharedStyles } from './readerSharedStyles';
import { ReaderParagraphBlock } from './ReaderParagraphBlock';

export interface ReaderVerseListProps {
  usePremiumTypography: boolean;
  renderVirtualized?: boolean;
  canShowTranslationSheet: boolean;
  displayedAnnotations: readonly UserAnnotation[];
  flushPendingReaderAutoScroll: (animated: boolean) => void;
  flushPendingReaderFocus: () => boolean;
  handleReaderMomentumScrollEnd: () => void;
  handleReaderScrollBeginDrag: () => void;
  handleReaderScrollEndDrag: () => void;
  highlightByVerse: Map<number, UserAnnotation>;
  isShowingRouteChapterRef: RefObject<boolean>;
  paragraphHeightsRef: RefObject<Record<string, number>>;
  pendingReaderAutoScrollVerseRef: RefObject<number | null>;
  premiumParagraphRenderSignature: string;
  premiumReaderBottomPadding: number;
  premiumReaderListRef: RefObject<FlatList<ReaderParagraph> | null>;
  premiumReaderParagraphs: ReaderParagraph[];
  readerContentTopPadding: number;
  readerFocusScrollRef: RefObject<ReturnType<typeof createReaderFocusScroll>>;
  readerInlineActiveVerse: number | null;
  readerScrollViewportHeightRef: RefObject<number>;
  readingFontFamily: string | undefined;
  readingFontFamilyBold: string | undefined;
  renderParagraphBlock: ({ item, index }: { item: ReaderParagraph; index: number }) => ReactElement;
  renderParagraphRef: RefObject<(paragraph: ReaderParagraph, index: number) => ReactElement>;
  renderTranslatorFeedbackReviewTools: () => ReactElement;
  scaleValue: (baseSize: number) => number;
  scrollHandler: ScrollHandlerProcessed<Record<string, unknown>>;
  scrollReaderToVerseParagraph: (verseNumber: number, animated: boolean) => boolean;
  selectedVerseDecorationStyle: {
    readonly textDecorationLine: 'underline';
    readonly textDecorationStyle: 'dotted';
    readonly textDecorationColor: string;
  };
  selectedVerseSet: Set<number>;
  selectedVerses: number[];
  setSelectedVerses: Dispatch<SetStateAction<number[]>>;
  setShowFontSizeSheet: Dispatch<SetStateAction<boolean>>;
  setShowTranslationSheet: Dispatch<SetStateAction<boolean>>;
  sharedTopChromeTop: number;
  verseOffsetsRef: RefObject<Record<number, number>>;
  verses: Verse[];
}

/** The chapter's paragraphs: headings, inline or stacked verses with selection, highlights and the follow-along band, virtualized in read mode. */
export function ReaderVerseList({
  usePremiumTypography,
  renderVirtualized = false,
  canShowTranslationSheet,
  displayedAnnotations,
  flushPendingReaderAutoScroll,
  flushPendingReaderFocus,
  handleReaderMomentumScrollEnd,
  handleReaderScrollBeginDrag,
  handleReaderScrollEndDrag,
  highlightByVerse,
  isShowingRouteChapterRef,
  paragraphHeightsRef,
  pendingReaderAutoScrollVerseRef,
  premiumParagraphRenderSignature,
  premiumReaderBottomPadding,
  premiumReaderListRef,
  premiumReaderParagraphs,
  readerContentTopPadding,
  readerFocusScrollRef,
  readerInlineActiveVerse,
  readerScrollViewportHeightRef,
  readingFontFamily,
  readingFontFamilyBold,
  renderParagraphBlock,
  renderParagraphRef,
  renderTranslatorFeedbackReviewTools,
  scaleValue,
  scrollHandler,
  scrollReaderToVerseParagraph,
  selectedVerseDecorationStyle,
  selectedVerseSet,
  selectedVerses,
  setSelectedVerses,
  setShowFontSizeSheet,
  setShowTranslationSheet,
  sharedTopChromeTop,
  verseOffsetsRef,
  verses,
}: ReaderVerseListProps) {
  const { colors } = useTheme();

  const verseFontSize = usePremiumTypography
    ? scaleValue(typography.readingBody.fontSize)
    : scaleValue(20);
  const verseLineHeight = getReaderVerseLineHeight(verseFontSize);
  const verseNumberSize = usePremiumTypography
    ? scaleValue(typography.readingVerseNumber.fontSize)
    : scaleValue(12);
  const headingFontSize = scaleValue(typography.readingHeading.fontSize);

  const paragraphs = usePremiumTypography ? premiumReaderParagraphs : buildReaderParagraphs(verses);

  const textStyle = [
    styles.verseText,
    usePremiumTypography ? styles.premiumVerseText : null,
    {
      fontSize: verseFontSize,
      lineHeight: verseLineHeight,
      color: colors.biblePrimaryText,
      // undefined for non-Latin scripts overrides the token's Lora → platform serif.
      fontFamily: readingFontFamily,
    },
  ];
  const verseNumberStyle = [
    styles.inlineVerseNumber,
    usePremiumTypography ? styles.premiumVerseNumber : null,
    {
      fontSize: verseNumberSize,
      lineHeight: verseLineHeight,
      color: colors.bibleSecondaryText,
    },
  ];
  // `bibleSecondaryText` only reaches 3.18:1 on the follow band, so a verse
  // number sitting on it swaps to the band's own quiet foreground.
  const followVerseNumberStyle = [...verseNumberStyle, { color: colors.bibleFollowVerseNumber }];
  const structuredVerseIndentSize = scaleValue(spacing.lg);

  const getVersePresentation = (verse: Verse) => {
    const highlightAnnotation = highlightByVerse.get(verse.verse);
    const isFocused = verse.verse === readerInlineActiveVerse;
    const verseBackgroundColor = isFocused
      ? colors.bibleFollowHighlight
      : highlightAnnotation?.color
        ? highlightAnnotation.color + '33'
        : undefined;

    return {
      highlightAnnotation,
      isFocused,
      isSelected: selectedVerseSet.has(verse.verse),
      verseBackgroundColor,
    };
  };

  const updateInlineParagraphVerseOffsets = (
    paragraphVerses: Verse[],
    paragraphOffsetY: number,
    paragraphHeight: number
  ) => {
    const totalWeight = paragraphVerses.reduce(
      (sum, verse) => sum + Math.max(verse.text.length, 12),
      0
    );
    if (totalWeight <= 0) {
      for (const verse of paragraphVerses) {
        verseOffsetsRef.current[verse.verse] = paragraphOffsetY;
      }
      return;
    }

    let cumulativeWeight = 0;
    for (const verse of paragraphVerses) {
      verseOffsetsRef.current[verse.verse] =
        paragraphOffsetY + (cumulativeWeight / totalWeight) * paragraphHeight;
      cumulativeWeight += Math.max(verse.text.length, 12);
    }
  };

  const handleToggleVerseSelection = (verse: Verse) => {
    if (!canSelectDisplayedVerse({ isShowingRouteChapter: isShowingRouteChapterRef.current })) {
      return;
    }
    selectionHaptic();
    setSelectedVerses((current) => toggleBibleSelectionVerse(current, verse.verse));
  };

  const renderStackedVerse = (verse: Verse) => {
    const { highlightAnnotation, isFocused, isSelected, verseBackgroundColor } =
      getVersePresentation(verse);
    const formattingLines = verse.formatting?.lines.length ? verse.formatting.lines : null;
    const focusRenderKey = isFocused ? 'focused' : 'idle';

    if (formattingLines) {
      return (
        <Pressable
          key={`${verse.id}-formatted-${focusRenderKey}`}
          onPress={() => handleToggleVerseSelection(verse)}
          accessibilityState={{ selected: isSelected }}
          style={[
            styles.readerVerse,
            styles.structuredVerse,
            usePremiumTypography ? styles.premiumStructuredVerse : null,
            verseBackgroundColor ? { backgroundColor: verseBackgroundColor } : null,
          ]}
        >
          {formattingLines.map((line, lineIndex) => (
            <Text
              key={`${verse.id}-line-${lineIndex}`}
              style={[
                textStyle,
                styles.structuredVerseLine,
                lineIndex > 0 ? styles.structuredVerseContinuation : null,
                isSelected ? selectedVerseDecorationStyle : null,
                line.indentLevel
                  ? { marginLeft: structuredVerseIndentSize * line.indentLevel }
                  : null,
              ]}
            >
              {lineIndex === 0 ? (
                <>
                  <Text style={verseNumberStyle}>{verse.verse}</Text>
                  {'\u00A0'}
                </>
              ) : null}
              {line.text}
            </Text>
          ))}
        </Pressable>
      );
    }

    if (highlightAnnotation?.color) {
      return (
        <View
          key={`${verse.id}-${highlightAnnotation.color}-${verseFontSize}-${verseLineHeight}-${focusRenderKey}`}
          style={styles.readerVerse}
        >
          <HighlightedVerseText
            verseNumber={verse.verse}
            verseText={verse.text}
            verseTextStyle={textStyle}
            verseNumberStyle={verseNumberStyle}
            selectedStyle={isSelected ? selectedVerseDecorationStyle : null}
            highlightColor={highlightAnnotation.color}
            isSelected={isSelected}
            onPress={() => handleToggleVerseSelection(verse)}
          />
        </View>
      );
    }

    return (
      <Pressable
        key={`${verse.id}-${focusRenderKey}`}
        onPress={() => handleToggleVerseSelection(verse)}
        accessibilityState={{ selected: isSelected }}
        style={styles.readerVerse}
      >
        <Text
          style={[
            textStyle,
            isSelected ? selectedVerseDecorationStyle : null,
            isFocused ? { backgroundColor: colors.bibleFollowHighlight } : null,
          ]}
        >
          <Text style={isFocused ? followVerseNumberStyle : verseNumberStyle}>{verse.verse}</Text>
          {'\u00A0'}
          {verse.text}
        </Text>
      </Pressable>
    );
  };

  const renderParagraph = (paragraph: ReaderParagraph, _pIndex: number): ReactElement => (
    <View
      key={paragraph.key}
      style={[
        styles.readerBlock,
        usePremiumTypography ? [styles.premiumReaderBlock, styles.premiumReaderContentShell] : null,
      ]}
      onLayout={(event) => {
        const y = event.nativeEvent.layout.y;
        paragraphHeightsRef.current[paragraph.key] = event.nativeEvent.layout.height;
        // Virtualized cells measure `y` against their own cell wrapper, so it
        // is always ~0 and must never be stored as a scroll offset; those
        // readers resolve offsets from the measured heights above instead.
        if (renderVirtualized) {
          flushPendingReaderAutoScroll(true);
          return;
        }

        const hasFormattedVerse = paragraph.verses.some(
          (verse) => (verse.formatting?.lines.length ?? 0) > 0
        );
        if (usePremiumTypography && !hasFormattedVerse) {
          updateInlineParagraphVerseOffsets(paragraph.verses, y, event.nativeEvent.layout.height);
          flushPendingReaderAutoScroll(true);
          return;
        }

        for (const v of paragraph.verses) {
          verseOffsetsRef.current[v.verse] = y;
        }
        flushPendingReaderAutoScroll(true);
      }}
    >
      {paragraph.heading ? (
        <Text
          // Lets VoiceOver/TalkBack users jump between pericopes with the headings rotor.
          accessibilityRole="header"
          style={[
            styles.sectionHeading,
            usePremiumTypography ? styles.premiumSectionHeading : null,
            {
              fontSize: headingFontSize,
              color: colors.biblePrimaryText,
              // Must be the bold face, not `readingFontFamily`: that is the regular weight
              // and silently overrode the heading token's own semi-bold family, which is
              // why section titles rendered at body weight.
              fontFamily: readingFontFamilyBold ?? readingFontFamily,
            },
          ]}
        >
          {paragraph.heading}
        </Text>
      ) : null}
      <View style={styles.readerParagraph}>
        {usePremiumTypography &&
        !paragraph.verses.some((verse) => (verse.formatting?.lines.length ?? 0) > 0) ? (
          <Text style={[textStyle, styles.premiumParagraphText]}>
            {paragraph.verses.map((verse, verseIndex) => {
              const { isFocused, isSelected, verseBackgroundColor } = getVersePresentation(verse);
              const focusRenderKey = isFocused ? 'focused' : 'idle';

              return (
                <Text
                  key={`${verse.id}-${verseFontSize}-${verseLineHeight}-${focusRenderKey}`}
                  suppressHighlighting
                  onPress={() => handleToggleVerseSelection(verse)}
                  style={[
                    styles.premiumInlineVerse,
                    isSelected ? selectedVerseDecorationStyle : null,
                    verseBackgroundColor ? { backgroundColor: verseBackgroundColor } : null,
                  ]}
                >
                  <Text
                    style={[
                      isFocused ? followVerseNumberStyle : verseNumberStyle,
                      styles.premiumInlineVerseNumber,
                    ]}
                  >
                    {verse.verse}
                  </Text>
                  {'\u00A0'}
                  {verse.text}
                  {verseIndex < paragraph.verses.length - 1 ? ' ' : ''}
                </Text>
              );
            })}
          </Text>
        ) : (
          paragraph.verses.map((verse) => renderStackedVerse(verse))
        )}
      </View>
    </View>
  );

  // The memoized rows read the latest renderer through this ref, so their props stay
  // stable across audio position ticks (see ReaderParagraphBlock). It is written while
  // rendering, before those rows render, exactly as when this lived in the screen.
  // eslint-disable-next-line react-hooks/refs -- intentional render-time handoff, see above
  renderParagraphRef.current = renderParagraph;
  // Signature of every non-position input that affects paragraph output. When
  // this changes we let memoized cells re-render; raw position ticks are absent
  // here, so ticks alone never invalidate cells.
  const paragraphRenderSignature = usePremiumTypography
    ? premiumParagraphRenderSignature
    : buildReaderParagraphRenderSignature({
        premium: false,
        verseFontSize,
        verseLineHeight,
        verseNumberSize,
        headingFontSize,
        readingFontFamily,
        readingFontFamilyBold,
        colors,
        selectedVerses,
        annotations: displayedAnnotations,
      });
  const premiumReaderListExtraData = `${readerInlineActiveVerse ?? 'none'}|${paragraphRenderSignature}`;

  if (renderVirtualized) {
    return (
      <Animated.FlatList
        ref={premiumReaderListRef}
        data={paragraphs}
        keyExtractor={(paragraph) => paragraph.key}
        renderItem={renderParagraphBlock}
        extraData={premiumReaderListExtraData}
        ListHeaderComponent={renderTranslatorFeedbackReviewTools}
        style={readerSharedStyles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        onLayout={(event) => {
          readerScrollViewportHeightRef.current = event.nativeEvent.layout.height;
          flushPendingReaderAutoScroll(false);
        }}
        onScrollToIndexFailed={(info) => {
          const focusTarget = readerFocusScrollRef.current.pendingVerse;
          premiumReaderListRef.current?.scrollToOffset({
            offset: Math.max(info.averageItemLength * info.index - sharedTopChromeTop, 0),
            animated: true,
          });
          requestAnimationFrame(() => {
            if (focusTarget != null) {
              pendingReaderAutoScrollVerseRef.current = null;
              scrollReaderToVerseParagraph(focusTarget, false);
              flushPendingReaderFocus();
            } else if (readerInlineActiveVerse != null) {
              pendingReaderAutoScrollVerseRef.current = readerInlineActiveVerse;
              scrollReaderToVerseParagraph(readerInlineActiveVerse, true);
              flushPendingReaderAutoScroll(true);
            }
          });
        }}
        onScrollBeginDrag={() => {
          handleReaderScrollBeginDrag();
          setShowFontSizeSheet((current) => getNextFontSizeSheetVisibility(current, 'scrollStart'));
          setShowTranslationSheet((current) =>
            getNextTranslationSheetVisibility(current, canShowTranslationSheet, 'dismiss')
          );
        }}
        onScrollEndDrag={handleReaderScrollEndDrag}
        onMomentumScrollEnd={handleReaderMomentumScrollEnd}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        updateCellsBatchingPeriod={32}
        contentContainerStyle={[
          styles.premiumReaderScrollContent,
          {
            paddingTop: readerContentTopPadding,
            paddingBottom: premiumReaderBottomPadding,
          },
        ]}
        ListFooterComponent={<View style={styles.premiumReaderVirtualFooter} />}
      />
    );
  }

  return (
    <View style={[styles.readerColumn, usePremiumTypography ? styles.premiumReaderColumn : null]}>
      {paragraphs.map((paragraph, pIndex) => (
        <ReaderParagraphBlock
          key={paragraph.key}
          paragraph={paragraph}
          index={pIndex}
          renderSignature={paragraphRenderSignature}
          activeVerse={readerInlineActiveVerse}
          renderParagraphRef={renderParagraphRef}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  premiumReaderScrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  premiumReaderContentShell: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  premiumReaderVirtualFooter: {
    height: 1,
  },
  readerColumn: {
    gap: 20,
  },
  premiumReaderColumn: {
    gap: 20,
  },
  readerParagraph: {
    gap: 0,
  },
  readerBlock: {
    gap: 10,
    paddingHorizontal: 12,
  },
  premiumReaderBlock: {
    gap: 6,
    paddingHorizontal: 0,
  },
  readerVerse: {
    alignSelf: 'stretch',
  },
  structuredVerse: {
    borderRadius: radius.sm,
    paddingVertical: 2,
  },
  premiumStructuredVerse: {
    paddingVertical: 4,
  },
  structuredVerseLine: {
    alignSelf: 'stretch',
  },
  structuredVerseContinuation: {
    marginTop: 2,
  },
  sectionHeading: {
    ...typography.readingHeading,
    // Carried for the platform-serif fallback used by non-Latin scripts, where no named
    // bold family is available and fontWeight is what actually thickens the glyphs.
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  premiumSectionHeading: {
    ...typography.readingHeading,
    textTransform: 'none',
    marginTop: 18,
    marginBottom: 8,
  },
  verseText: {
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  premiumVerseText: {
    ...typography.readingBody,
    letterSpacing: 0,
  },
  inlineVerseNumber: {
    fontWeight: '600',
  },
  premiumVerseNumber: {
    ...typography.readingVerseNumber,
  },
  premiumParagraphText: {
    includeFontPadding: false,
  },
  premiumInlineVerse: {},
  premiumInlineVerseNumber: {},
});
