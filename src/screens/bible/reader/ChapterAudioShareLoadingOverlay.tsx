import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { styles } from './readerStyles';

export interface ChapterAudioShareLoadingOverlayProps {
  chapterAudioShareActionLabel: string;
  pendingChapterAudioShareAction: 'full' | 'portion' | null;
}

/** Covers the reader while a chapter audio share is being prepared. */
export function ChapterAudioShareLoadingOverlay({
  chapterAudioShareActionLabel,
  pendingChapterAudioShareAction,
}: ChapterAudioShareLoadingOverlayProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return pendingChapterAudioShareAction !== null ? (
    <View style={[styles.chapterAudioShareLoadingOverlay, { backgroundColor: colors.overlay }]}>
      <View
        style={[
          styles.chapterAudioShareLoadingCard,
          {
            backgroundColor: colors.bibleSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <ActivityIndicator size="small" color={colors.biblePrimaryText} />
        <Text style={[styles.chapterAudioShareLoadingTitle, { color: colors.biblePrimaryText }]}>
          {chapterAudioShareActionLabel}
        </Text>
        <Text style={[styles.chapterAudioShareLoadingBody, { color: colors.bibleSecondaryText }]}>
          {t('common.loading')}
        </Text>
      </View>
    </View>
  ) : null;
}
