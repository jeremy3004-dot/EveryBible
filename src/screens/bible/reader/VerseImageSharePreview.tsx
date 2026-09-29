import { useEffect, useState } from 'react';
import {
  StyleSheet,
  ImageBackground,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import type { RefObject } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  canVerseImageFontDraw,
  DEFAULT_VERSE_IMAGE_STYLE,
  getNextVerseImageFitSize,
  getVerseImageColor,
  getVerseImageFont,
  getVerseImageScrim,
  type VerseImageStyle,
} from './verseImage/verseImageStyle';

const REFERENCE_FONT_SIZE = 13;

export function VerseImageSharePreview({
  previewRef,
  backgroundSource,
  referenceLabel,
  selectedText,
  style = DEFAULT_VERSE_IMAGE_STYLE,
  onFitChange,
}: VerseImageSharePreviewProps) {
  const verseText = selectedText.trim();
  const shownText = `"${verseText || referenceLabel}"`;
  const color = getVerseImageColor(style.colorId);
  // The reference keeps the app's own chip in every text colour: an opaque backdrop,
  // since the wash over the photo is translucent.
  const { colors } = useTheme();
  // Scripture is set in its own language: a face without glyphs for every character
  // (Devanagari, Arabic, and for some faces Cyrillic or Vietnamese) falls back to
  // Classic, and a verse even Classic cannot draw takes the platform serif, as in the
  // reader and on the Home card.
  const font = getVerseImageFont(
    canVerseImageFontDraw(style.fontId, shownText) ? style.fontId : 'classic'
  );
  const fontFamily = canVerseImageFontDraw(font.id, shownText) ? font.fontFamily : undefined;
  const wantedSize = style.size * font.scale;

  // The verse is set at the chosen size unless that runs past the picture: then a
  // hidden copy is measured and shrunk until it fits, and the visible one follows.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [trialSize, setTrialSize] = useState(wantedSize);
  const [fittedSize, setFittedSize] = useState(wantedSize);
  const fitKey = `${shownText}|${font.id}|${wantedSize}|${box?.width}|${box?.height}`;
  const [measuredKey, setMeasuredKey] = useState(fitKey);
  // Until the new size is measured the visible verse keeps its last fitted size, so
  // it is not "capped" yet, only waiting.
  const [isSettled, setIsSettled] = useState(false);
  if (measuredKey !== fitKey) {
    setMeasuredKey(fitKey);
    setTrialSize(wantedSize);
    setIsSettled(false);
  }

  const handleBoxLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== box?.width || height !== box?.height) setBox({ width, height });
  };

  const handleMeasure = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (!box) return;
    const { lines } = event.nativeEvent;
    // Layouts report late while the size is being dragged: a report from an earlier,
    // bigger trial would shrink this one far too much. Every line is set at the trial's
    // line height, so a report whose lines are not is stale and is skipped.
    const trialLineHeight = Math.round(trialSize * font.lineHeight);
    if (lines.some((line) => Math.abs(line.height - trialLineHeight) > 1.5)) return;
    const measuredHeight = lines.reduce((total, line) => total + line.height, 0);
    const next = getNextVerseImageFitSize({
      size: trialSize,
      measuredHeight,
      availableHeight: box.height,
    });
    if (next == null) {
      setFittedSize(trialSize);
      setIsSettled(true);
    } else {
      setTrialSize(next);
    }
  };

  const isCapped = isSettled && fittedSize < wantedSize - 0.25;
  useEffect(() => {
    onFitChange?.(isCapped);
  }, [isCapped, onFitChange]);

  const verseStyle = (size: number) => [
    styles.verseImagePreviewText,
    {
      fontFamily,
      color: color.hex,
      fontSize: size,
      lineHeight: Math.round(size * font.lineHeight),
      textTransform: font.uppercase ? ('uppercase' as const) : ('none' as const),
      letterSpacing: font.letterSpacing ?? 0,
      textShadowColor: color.light ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.35)',
    },
  ];

  return (
    <View ref={previewRef} collapsable={false} style={styles.verseImagePreviewFrame}>
      <ImageBackground
        source={backgroundSource}
        style={styles.verseImagePreviewBackground}
        imageStyle={styles.verseImagePreviewImage}
        resizeMode="cover"
      >
        <LinearGradient
          pointerEvents="none"
          colors={getVerseImageScrim(color)}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.verseImagePreviewOverlay}
        />
        <View style={styles.verseImagePreviewContent}>
          <View style={styles.verseImagePreviewTextBox} onLayout={handleBoxLayout}>
            <Text
              style={verseStyle(fittedSize)}
              // This card is the picture that gets shared, at a fixed size, so OS text
              // scaling must not change it. Screen readers still read the words in full.
              allowFontScaling={false}
            >
              {shownText}
            </Text>
            {box ? (
              <Text
                testID="verse-image-measure"
                style={[verseStyle(trialSize), styles.verseImageMeasure, { width: box.width }]}
                onTextLayout={handleMeasure}
                allowFontScaling={false}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              >
                {shownText}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.verseImagePreviewReferenceChip,
              { backgroundColor: colors.bibleSurface },
            ]}
          >
            <Text
              style={[
                styles.verseImagePreviewReference,
                {
                  color: colors.biblePrimaryText,
                  fontSize: REFERENCE_FONT_SIZE,
                  lineHeight: Math.round(REFERENCE_FONT_SIZE * 1.4),
                },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              allowFontScaling={false}
            >
              {referenceLabel}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

export interface VerseImageSharePreviewProps {
  previewRef: RefObject<View | null>;
  backgroundSource: import('react-native').ImageSourcePropType;
  referenceLabel: string;
  selectedText: string;
  /** The chosen face, colour and size. */
  style?: VerseImageStyle;
  /** Told whether the chosen size had to shrink to keep the verse inside the picture. */
  onFitChange?: (capped: boolean) => void;
}

const styles = StyleSheet.create({
  verseImagePreviewFrame: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    aspectRatio: 1.08,
  },
  verseImagePreviewBackground: {
    flex: 1,
    justifyContent: 'space-between',
  },
  verseImagePreviewImage: {
    borderRadius: radius.lg,
  },
  verseImagePreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  verseImagePreviewContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  verseImagePreviewTextBox: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  verseImagePreviewText: {
    ...typography.readingDisplay,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  // Laid out off to the side and invisible: it only reports the lines it would take.
  verseImageMeasure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
  verseImagePreviewReferenceChip: {
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  verseImagePreviewReference: {
    ...typography.label,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
