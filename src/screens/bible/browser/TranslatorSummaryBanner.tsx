import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TranslationNotCoveredNotice } from '../../../components/feedback/TranslationNotCoveredNotice';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { TranslatorNotCovered } from './useTranslatorFeedbackSummaries';

interface TranslatorSummaryBannerProps {
  /** Translator review is on; otherwise the banner renders nothing. */
  enabled: boolean;
  translationId: string;
  /** Loading with nothing to show yet; a refresh over existing badges stays silent. */
  isLoadingFirstSummary: boolean;
  error: string | null;
  notCovered: TranslatorNotCovered | null;
  onRetry: () => void;
}

/** Header of the book list for translator reviewers: loading, error, or coverage notice. */
export const TranslatorSummaryBanner = memo(function TranslatorSummaryBanner({
  enabled,
  translationId,
  isLoadingFirstSummary,
  error,
  notCovered,
  onRetry,
}: TranslatorSummaryBannerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!enabled) {
    return null;
  }

  if (isLoadingFirstSummary) {
    return (
      <View style={styles.banner}>
        <ActivityIndicator size="small" color={colors.bibleAccent} />
        <Text style={[styles.bannerText, { color: colors.bibleSecondaryText }]}>
          {t('bible.translatorReviewLoading')}
        </Text>
      </View>
    );
  }

  if (notCovered) {
    return (
      <View
        style={[
          styles.errorCard,
          styles.notCoveredCard,
          { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <TranslationNotCoveredNotice
          tone="reader"
          translationId={translationId}
          coveredTranslationIds={notCovered.coveredTranslationIds}
          onRetry={onRetry}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.errorCard,
          { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
        ]}
      >
        <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
          onPress={onRetry}
        >
          <Text style={[styles.retryText, { color: colors.bibleAccent }]}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
  },
  bannerText: {
    ...typography.label,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  notCoveredCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  retryText: {
    ...typography.label,
  },
});
