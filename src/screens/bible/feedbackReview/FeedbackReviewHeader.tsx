import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, ChevronDown, Users } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../../design/system';
import type { ChapterReviewHeadline, FeedbackStatusFilter } from '../../../services/feedback';
import { TranslationNotCoveredNotice } from '../../../components/feedback';
import { AppButton, AppCard, TabSwitch } from '../../../components/ui';

interface FeedbackReviewHeaderProps {
  translationId: string;
  headline: ChapterReviewHeadline;
  status: FeedbackStatusFilter;
  onChangeStatus: (status: FeedbackStatusFilter) => void;
  sourceLabelKey: string;
  onOpenSourcePicker: () => void;
  positiveOnly: boolean;
  positiveCount: number;
  onChangePositiveOnly: (positiveOnly: boolean) => void;
  mutating: boolean;
  onReviewPositive: () => void;
  notCovered: { coveredTranslationIds?: string[] } | null;
  failed: boolean;
  onRetry: () => void;
  onSwitchedTranslation: () => void;
}

/** Above the feedback list: the chapter's headline, the filters, and load failures. */
export function FeedbackReviewHeader({
  translationId,
  headline,
  status,
  onChangeStatus,
  sourceLabelKey,
  onOpenSourcePicker,
  positiveOnly,
  positiveCount,
  onChangePositiveOnly,
  mutating,
  onReviewPositive,
  notCovered,
  failed,
  onRetry,
  onSwitchedTranslation,
}: FeedbackReviewHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.header}>
      <View style={styles.headline}>
        {headline.kind === 'open' ? (
          <Text style={[styles.headlineText, { color: colors.primaryText }]}>
            {t('feedback.openCount', { count: headline.count })}
          </Text>
        ) : headline.kind === 'caughtUp' ? (
          <View style={styles.caughtUp}>
            <CheckCheck size={20} color={colors.success} strokeWidth={2} />
            <Text style={[styles.headlineText, { color: colors.primaryText }]}>
              {t('feedback.complete')}
            </Text>
          </View>
        ) : headline.kind === 'empty' ? (
          <Text style={[styles.body, { color: colors.secondaryText }]}>
            {t('bible.translatorReviewEmpty')}
          </Text>
        ) : null}
      </View>

      <TabSwitch
        segments={[
          { key: 'pending', label: t('feedback.openTab') },
          { key: 'reviewed', label: t('feedback.doneTab') },
        ]}
        value={status}
        onChange={(key) => onChangeStatus(key as FeedbackStatusFilter)}
        fullWidth
        size="md"
        accessibilityLabel={t('feedback.statusFilter')}
      />
      <AppButton
        label={t(sourceLabelKey)}
        accessibilityLabel={`${t('feedback.sourceFilter')}: ${t(sourceLabelKey)}`}
        leadingIcon={Users}
        trailingIcon={ChevronDown}
        variant="ghost"
        size="md"
        onPress={onOpenSourcePicker}
        style={styles.sourceButton}
      />

      {positiveOnly ? (
        <View style={styles.positiveRow}>
          <Text style={[styles.positiveText, { color: colors.primaryText }]}>
            {t('feedback.plainPositive', { count: positiveCount })}
          </Text>
          <AppButton
            label={t('feedback.showComments')}
            variant="ghost"
            size="md"
            onPress={() => onChangePositiveOnly(false)}
          />
        </View>
      ) : (
        positiveCount > 0 && (
          <AppCard padding={layout.denseCardPadding}>
            <View style={styles.positiveRow}>
              <Check size={18} color={colors.success} strokeWidth={2.4} />
              <Text style={[styles.positiveText, { color: colors.primaryText }]}>
                {t('feedback.plainPositive', { count: positiveCount })}
              </Text>
            </View>
            <View style={styles.positiveActions}>
              <AppButton
                label={t('feedback.viewPositive')}
                variant="ghost"
                size="md"
                onPress={() => onChangePositiveOnly(true)}
              />
              {status === 'pending' && (
                <AppButton
                  label={t('feedback.markReviewed')}
                  variant="outline"
                  size="md"
                  disabled={mutating}
                  onPress={onReviewPositive}
                />
              )}
            </View>
          </AppCard>
        )
      )}

      {notCovered ? (
        // This screen is pinned to one translation, so after switching the reader go back to
        // it; the reader then shows the new translation's feedback summary.
        <TranslationNotCoveredNotice
          translationId={translationId}
          coveredTranslationIds={notCovered.coveredTranslationIds}
          onRetry={onRetry}
          onSwitched={onSwitchedTranslation}
        />
      ) : (
        failed && (
          <AppButton label={t('common.retry')} variant="outline" size="md" onPress={onRetry} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  headline: { gap: spacing.md, alignItems: 'flex-start' },
  headlineText: { ...typography.cardTitle },
  caughtUp: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { ...typography.body },
  sourceButton: { alignSelf: 'flex-start' },
  positiveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  positiveText: { ...typography.bodyMedium, flexShrink: 1 },
  positiveActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
