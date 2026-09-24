import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { layout, spacing, typography } from '../../../design/system';
import { AppCard } from '../../../components/ui';
import type { CurrentPlanDaySummary } from '../../../services/plans/readingPlanActivity';
import { getActivePlanDayNumber } from '../../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import { formatPlanProgressAnnouncement, formatPlanProgressTally } from '../planProgressTally';
import { getPlanLedgerGridDayCount } from '../planLedgerGridModel';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { LedgerCells } from './LedgerCells';
import { getLedgerCellStates } from './planDetailLedgerModel';

interface ProgressCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress | null;
  currentDaySummary: CurrentPlanDaySummary | null;
  today: Date;
}

/** "Day 3 /30", the read/missed tally, and the dot grid beneath them. */
export function ProgressCard({ plan, progress, currentDaySummary, today }: ProgressCardProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  // This month's length for a day-of-month plan, so September has no day-31 dot.
  const totalDays = getPlanLedgerGridDayCount(plan, today);
  const currentDay = currentDaySummary?.dayNumber ?? getActivePlanDayNumber(plan, progress, today);
  const isCurrentDayComplete = Boolean(currentDaySummary?.isComplete);

  const cellStates = useMemo(
    () =>
      getLedgerCellStates({
        plan,
        progress,
        currentDay,
        isCurrentDayComplete,
        today,
        totalDays,
      }),
    [currentDay, isCurrentDayComplete, plan, progress, today, totalDays]
  );

  const doneCount = cellStates.filter((state) => state === 'done').length;
  const missedCount = cellStates.filter((state) => state === 'missed').length;
  const tallyLabel = formatPlanProgressTally(t, {
    done: doneCount,
    missed: missedCount,
    totalDays,
  });
  const progressAnnouncement = formatPlanProgressAnnouncement(t, {
    currentDay,
    done: doneCount,
    missed: missedCount,
    totalDays,
  });

  return (
    <AppCard padding={layout.cardPaddingWide}>
      <View
        style={styles.headRow}
        // One stop for screen readers ("Day 1 of 365, Completed, 0 of 365 days")
        // instead of "Day", "1", "/365" fragments; the dot grid below is hidden.
        accessible
        accessibilityLabel={progressAnnouncement}
      >
        <View>
          <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('readingPlans.day')}
          </Text>
          <View style={styles.numeralRow}>
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
              style={[typography.numeralXL, { color: colors.primaryText }]}
            >
              {currentDay}
            </Text>
            <Text style={[styles.numeralTotal, { color: colors.secondaryText }]}>/{totalDays}</Text>
          </View>
        </View>

        <View style={styles.tally}>
          <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('readingPlans.completed')}
          </Text>
          <Text style={[styles.tallyValue, displayFont.regular, { color: colors.primaryText }]}>
            {tallyLabel}
          </Text>
        </View>
      </View>

      <LedgerCells states={cellStates} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  numeralRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  numeralTotal: {
    ...typography.sectionHeading,
    fontSize: 18,
    letterSpacing: -0.45,
  },
  tally: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  tallyValue: {
    ...typography.mono,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'right',
  },
});
