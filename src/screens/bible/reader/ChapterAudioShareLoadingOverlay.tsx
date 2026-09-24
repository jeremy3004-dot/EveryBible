import { StyleSheet, ActivityIndicator, Text, View } from 'react-native';
import { radius, spacing } from '../../../design/system';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';

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

const styles = StyleSheet.create({
  chapterAudioShareLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 50,
  },
  chapterAudioShareLoadingCard: {
    minWidth: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chapterAudioShareLoadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  chapterAudioShareLoadingBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
