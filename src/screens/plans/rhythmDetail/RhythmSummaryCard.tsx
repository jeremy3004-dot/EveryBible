import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { RhythmPlanTally } from './rhythmDetailModel';

/** The item, finished and remaining counts, and what the reader meets next. */
export function RhythmSummaryCard({
  totalItemCount,
  planTally,
  hasActiveSegments,
  nextTitle,
}: {
  totalItemCount: number;
  planTally: RhythmPlanTally;
  hasActiveSegments: boolean;
  nextTitle: string | null;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const stats = [
    ['items', totalItemCount, t('readingPlans.includedItems', { defaultValue: 'Included items' })],
    ['completed', planTally.completed, t('readingPlans.completed')],
    ['remaining', planTally.remaining, t('readingPlans.remaining')],
  ] as const;

  return (
    <View
      style={[
        styles.summaryCard,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.summaryRow}>
        {stats.map(([id, value, label]) => (
          <View key={id} style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: colors.primaryText }]}>{value}</Text>
            <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.summaryBody, { color: colors.secondaryText }]}>
        {hasActiveSegments ? t('readingPlans.continueRhythm') : t('readingPlans.noRhythmsBody')}
      </Text>
      {nextTitle !== null ? (
        <Text style={[styles.summaryNext, { color: colors.accentPrimary }]}>
          {t('readingPlans.nextUp', {
            value: nextTitle,
            defaultValue: `Next up: ${nextTitle}`,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryStat: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.sectionTitle,
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  summaryBody: {
    ...typography.body,
  },
  summaryNext: {
    ...typography.bodyStrong,
  },
});
