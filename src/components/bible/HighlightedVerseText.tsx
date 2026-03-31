import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { radius } from '../../design/system';
import { getCompactHighlightVerticalInset } from './highlightMetrics';

interface HighlightedVerseTextProps {
  verseNumber: number;
  verseText: string;
  verseTextStyle: StyleProp<TextStyle>;
  verseNumberStyle: StyleProp<TextStyle>;
  selectedStyle?: StyleProp<TextStyle>;
  highlightColor: string;
  onPress: () => void;
}

const HIGHLIGHT_ALPHA = '4D';

function sameLines(left: string[] | null, right: string[]): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((line, index) => line === right[index]);
}

export function HighlightedVerseText({
  verseNumber,
  verseText,
  verseTextStyle,
  verseNumberStyle,
  selectedStyle,
  highlightColor,
  onPress,
}: HighlightedVerseTextProps) {
  const [lineTexts, setLineTexts] = useState<string[] | null>(null);
  const hasMeasuredLines = Array.isArray(lineTexts) && lineTexts.length > 0;
  const flattenedVerseTextStyle = StyleSheet.flatten(verseTextStyle) ?? {};
  const highlightVerticalInset = getCompactHighlightVerticalInset(
    flattenedVerseTextStyle.fontSize,
    flattenedVerseTextStyle.lineHeight
  );

  return (
    <Pressable onPress={onPress} style={styles.highlightVerse}>
      <Text
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(event) => {
          const nextLines = event.nativeEvent.lines
            .map((line) => line.text.replace(/\s+$/u, ''))
            .filter((line) => line.length > 0);

          setLineTexts((current) => (sameLines(current, nextLines) ? current : nextLines));
        }}
        style={[verseTextStyle, styles.measurementText]}
      >
        <Text style={verseNumberStyle}>{verseNumber}</Text>
        {'\u00A0'}
        {verseText}
      </Text>
      {hasMeasuredLines ? (
        lineTexts.map((line, index) => (
          <View key={`${verseNumber}-${index}`} style={styles.highlightLine}>
            <View
              pointerEvents="none"
              style={[
                styles.highlightBackground,
                {
                  backgroundColor: `${highlightColor}${HIGHLIGHT_ALPHA}`,
                  top: highlightVerticalInset,
                  bottom: highlightVerticalInset,
                },
              ]}
            />
            <Text style={[verseTextStyle, selectedStyle, styles.highlightLineText]}>
              {index === 0 ? <Text style={verseNumberStyle}>{verseNumber}</Text> : null}
              {index === 0 ? '\u00A0' : ''}
              {index === 0 ? line.replace(new RegExp(`^${verseNumber}[\\s\\u00A0]+`), '') : line}
            </Text>
          </View>
        ))
      ) : (
        <View style={styles.highlightFallback}>
          <View
            pointerEvents="none"
            style={[
              styles.highlightBackground,
              {
                backgroundColor: `${highlightColor}33`,
                top: highlightVerticalInset,
                bottom: highlightVerticalInset,
              },
            ]}
          />
          <Text style={[verseTextStyle, selectedStyle, styles.highlightLineText]}>
            <Text style={verseNumberStyle}>{verseNumber}</Text>
            {'\u00A0'}
            {verseText}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlightVerse: {
    alignSelf: 'stretch',
  },
  measurementText: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    top: 0,
  },
  highlightLine: {
    alignSelf: 'flex-start',
    borderRadius: radius.xs,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  highlightFallback: {
    alignSelf: 'flex-start',
    borderRadius: radius.xs,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  highlightBackground: {
    borderRadius: radius.xs,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  highlightLineText: {
    flexShrink: 1,
  },
});
