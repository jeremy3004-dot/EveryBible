import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { HighlightedVerseText } from '../../../components/bible/HighlightedVerseText';
import type { UserAnnotation } from '../../../services/supabase/types';
import type { Verse } from '../../../types';
import { radius } from '../../../design/system';

export interface VersePresentation {
  highlightAnnotation: UserAnnotation | undefined;
  isFocused: boolean;
  isSelected: boolean;
  verseBackgroundColor: string | undefined;
}

/** What a stacked (poetry or highlighted) verse needs from the list drawing it. */
export interface StackedVerseContext {
  usePremiumTypography: boolean;
  textStyle: StyleProp<TextStyle>;
  verseNumberStyle: StyleProp<TextStyle>;
  followVerseNumberStyle: StyleProp<TextStyle>;
  selectedVerseDecorationStyle: TextStyle;
  structuredVerseIndentSize: number;
  verseFontSize: number;
  verseLineHeight: number;
  followHighlightColor: string;
  getVersePresentation: (verse: Verse) => VersePresentation;
  onToggleVerseSelection: (verse: Verse) => void;
  /** VoiceOver/TalkBack is on: each verse announces itself as one selectable button. */
  screenReaderEnabled?: boolean;
}

/**
 * One verse on its own line or lines: poetry keeps its stored line breaks and indents,
 * a highlighted verse draws through HighlightedVerseText, anything else is a tappable
 * line. The key carries the follow-along state so the band change remounts the row.
 */
export function renderStackedVerse(
  verse: Verse,
  {
    usePremiumTypography,
    textStyle,
    verseNumberStyle,
    followVerseNumberStyle,
    selectedVerseDecorationStyle,
    structuredVerseIndentSize,
    verseFontSize,
    verseLineHeight,
    followHighlightColor,
    getVersePresentation,
    onToggleVerseSelection,
    screenReaderEnabled = false,
  }: StackedVerseContext
): ReactElement {
  const { highlightAnnotation, isFocused, isSelected, verseBackgroundColor } =
    getVersePresentation(verse);
  const formattingLines = verse.formatting?.lines.length ? verse.formatting.lines : null;
  const focusRenderKey = isFocused ? 'focused' : 'idle';
  // Read as the highlighted verse row reads (HighlightedVerseText), number then text.
  const screenReaderProps = screenReaderEnabled
    ? ({
        accessibilityRole: 'button',
        accessibilityLabel: `${verse.verse}\u00A0${verse.text}`,
      } as const)
    : null;

  if (formattingLines) {
    return (
      <Pressable
        key={`${verse.id}-formatted-${focusRenderKey}`}
        onPress={() => onToggleVerseSelection(verse)}
        accessibilityState={{ selected: isSelected }}
        {...screenReaderProps}
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
          onPress={() => onToggleVerseSelection(verse)}
        />
      </View>
    );
  }

  return (
    <Pressable
      key={`${verse.id}-${focusRenderKey}`}
      onPress={() => onToggleVerseSelection(verse)}
      accessibilityState={{ selected: isSelected }}
      {...screenReaderProps}
      style={styles.readerVerse}
    >
      <Text
        style={[
          textStyle,
          isSelected ? selectedVerseDecorationStyle : null,
          isFocused ? { backgroundColor: followHighlightColor } : null,
        ]}
      >
        <Text style={isFocused ? followVerseNumberStyle : verseNumberStyle}>{verse.verse}</Text>
        {'\u00A0'}
        {verse.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
