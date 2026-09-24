import { useEffect } from 'react';
import { StyleSheet, ActivityIndicator, Text, View } from 'react-native';
import { radius, spacing } from '../../../design/system';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { announceLiveRegionText } from '../../../utils/a11y';

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
  const isPending = pendingChapterAudioShareAction !== null;
  const status = `${chapterAudioShareActionLabel}, ${t('common.loading')}`;

  // The share sheet closes as this appears, and focus falls back onto the
  // reader behind it; without this the wait was silent.
  useEffect(() => {
    if (isPending) announceLiveRegionText(status);
  }, [isPending, status]);

  return isPending ? (
    <View
      // It blocks the reader for sighted users; VoiceOver is kept on it too.
      accessibilityViewIsModal
      style={[styles.chapterAudioShareLoadingOverlay, { backgroundColor: colors.overlay }]}
    >
      <View
        accessible
        accessibilityLabel={status}
        accessibilityState={{ busy: true }}
        accessibilityLiveRegion="polite"
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
