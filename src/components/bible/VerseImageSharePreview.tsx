import type { RefObject } from 'react';
import { ImageBackground, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { getReadingFontFamily } from '../../design/fonts';
import { radius, spacing, typography } from '../../design/system';

interface VerseImageSharePreviewProps {
  previewRef: RefObject<View | null>;
  backgroundSource: ImageSourcePropType;
  referenceLabel: string;
  selectedText: string;
  /** The translation's language, which picks a face that has its script's glyphs. */
  translationLanguage?: string;
}

/**
 * The verse card the reader's share sheet previews and captures with
 * react-native-view-shot: the selected Scripture over a photograph, then its reference.
 */
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
          >
            {`"${verseText || referenceLabel}"`}
          </Text>
          <Text
            style={[
              styles.verseImagePreviewReference,
              {
                color: colors.accentGreen,
                fontSize: referenceFontSize,
                lineHeight: Math.round(referenceFontSize * 1.4),
              },
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {referenceLabel}
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
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
  verseImagePreviewReference: {
    ...typography.label,
    textAlign: 'center',
    fontWeight: '700',
  },
});
