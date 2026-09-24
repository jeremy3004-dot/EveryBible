import { StyleSheet, ImageBackground, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../../design/system';
import type { RefObject } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { getReadingFontFamily } from '../../../design/fonts';

export function VerseImageSharePreview({
  previewRef,
  backgroundSource,
  referenceLabel,
  selectedText,
  translationLanguage,
}: VerseImageSharePreviewProps) {
  const { colors, isDark } = useTheme();
  const verseText = selectedText.trim();
  const verseFontSize = verseText.length > 220 ? 19 : verseText.length > 140 ? 21 : 23;
  const referenceFontSize = verseText.length > 220 ? 13 : 14;
  const gradientColors: [string, string] = isDark
    ? ['rgba(12, 11, 9, 0.12)', 'rgba(12, 11, 9, 0.74)']
    : ['rgba(245, 240, 232, 0.08)', 'rgba(245, 240, 232, 0.6)'];

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
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.verseImagePreviewOverlay}
        />
        <View style={styles.verseImagePreviewContent}>
          <Text
            style={[
              styles.verseImagePreviewText,
              {
                // Scripture renders in its own language: Lora has no glyphs for Devanagari,
                // Arabic and the like, so those scripts take the platform serif, as in the
                // reader and on the Home card.
                fontFamily: getReadingFontFamily(translationLanguage, 400, true),
                color: colors.biblePrimaryText,
                fontSize: verseFontSize,
                lineHeight: Math.round(verseFontSize * 1.38),
              },
            ]}
            numberOfLines={8}
            adjustsFontSizeToFit
            minimumFontScale={0.64}
            // This card is the picture that gets shared, at a fixed size. Scaled by
            // the OS text size, an AX-size verse overflowed the frame even at the
            // minimum shrink and the shared image lost its end. Its words are
            // still read in full by screen readers.
            allowFontScaling={false}
          >
            {`"${verseText || referenceLabel}"`}
          </Text>
          {/* The gradient is translucent over a photo, so text drawn straight on it has no
              knowable contrast (an accent reference vanished on a blue-grey photo). The reference
              sits on an opaque reader-surface chip, in the reader's text colour, which the theme
              contrast audit holds at 4.5:1. */}
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
                  fontSize: referenceFontSize,
                  lineHeight: Math.round(referenceFontSize * 1.4),
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
  /** The translation's language, which picks a face that has its script's glyphs. */
  translationLanguage?: string;
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  verseImagePreviewText: {
    ...typography.readingDisplay,
    textAlign: 'center',
    letterSpacing: -0.2,
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
  },
});
