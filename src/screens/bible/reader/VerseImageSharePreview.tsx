import type { RefObject } from 'react';
import { ImageBackground, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../contexts/ThemeContext';
import { styles } from './readerStyles';

export function VerseImageSharePreview({
  previewRef,
  backgroundSource,
  referenceLabel,
  selectedText,
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

export interface VerseImageSharePreviewProps {
  previewRef: RefObject<View | null>;
  backgroundSource: import('react-native').ImageSourcePropType;
  referenceLabel: string;
  selectedText: string;
}
