import { useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { radius } from '../../design/system';

interface HighlightedVerseTextProps {
  verseNumber: number;
  verseText: string;
  verseTextStyle: StyleProp<TextStyle>;
  verseNumberStyle: StyleProp<TextStyle>;
  selectedStyle?: StyleProp<TextStyle>;
  highlightColor: string;
  onPress: () => void;
  trailingSpace?: string;
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
  trailingSpace = '',
}: HighlightedVerseTextProps) {
  const [lineTexts, setLineTexts] = useState<string[] | null>(null);
  const hasMeasuredLines = Array.isArray(lineTexts) && lineTexts.length > 0;

  return (
    <Text onPress={onPress} style={[verseTextStyle, selectedStyle]}>
      <Text style={verseNumberStyle}>{verseNumber}</Text>
      {'\u00A0'}
      {hasMeasuredLines ? (
        lineTexts.map((line, index) => (
          <Text
            key={`${verseNumber}-${index}`}
            style={[
              styles.highlightLine,
              {
                backgroundColor: `${highlightColor}${HIGHLIGHT_ALPHA}`,
              },
            ]}
          >
            {line}
            {index < lineTexts.length - 1 ? '\n' : ''}
          </Text>
        ))
      ) : (
        <Text
          onTextLayout={(event) => {
            const nextLines = event.nativeEvent.lines
              .map((line) => line.text.replace(/\s+$/u, ''))
              .filter((line) => line.length > 0);

            setLineTexts((current) => (sameLines(current, nextLines) ? current : nextLines));
          }}
          style={[
            styles.highlightFallback,
            {
              backgroundColor: `${highlightColor}33`,
            },
          ]}
        >
          {verseText}
        </Text>
      )}
      {trailingSpace}
    </Text>
  );
}

const styles = StyleSheet.create({
  highlightLine: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  highlightFallback: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
