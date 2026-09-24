import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../../components/ui';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { useLargeText } from '../../../hooks/useLargeText';
import type { ReadingPlan } from '../../../services/plans/types';
import { formatPlanCadenceLabel } from './plansHomeModel';
import { PlanCover } from './PlanCover';
import { belowTitleStyles, ROW_COVER_SIZE } from './plansHomeStyles';
import { SoftChip } from './SoftChip';

interface CatalogPlanRowProps {
  plan: ReadingPlan;
  /** Whether the reader is enrolled in this plan. */
  isEnrolled: boolean;
  /** The day the row shows when enrolled; ignored otherwise. Passed as the
   * derived primitive (not the whole progress object) so a sync that only
   * restamps synced_at — a new progress object with the same day — does not
   * fail this row's memo comparison and redraw it. */
  activeDayNumber: number | undefined;
  /** The first row in its card draws no divider above it. */
  isFirst: boolean;
  onPlanPress: (planId: string) => void;
}

/**
 * Compact list row — every Find plans category other than Daily rhythms. Memoized: a
 * search keystroke that leaves this row in the results does not redraw it.
 */
export const CatalogPlanRow = memo(function CatalogPlanRow({
  plan,
  isEnrolled,
  activeDayNumber,
  isFirst,
  onPlanPress,
}: CatalogPlanRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const { isLargeText } = useLargeText();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
  const metaParts = [t('readingPlans.daysCount', { count: plan.duration_days })];
  const cadence = formatPlanCadenceLabel(plan, t);
  if (isEnrolled) {
    metaParts.push(t('readingPlans.dayLabel', { day: activeDayNumber ?? 1 }));
  } else if (cadence) {
    metaParts.push(cadence);
  }

  const trailing = isEnrolled ? (
    <SoftChip label={t('readingPlans.enrolled')} colors={colors} />
  ) : (
    <PressableScale
      pressEffect="translate"
      hitSlop={12}
      onPress={() => onPlanPress(plan.id)}
      accessibilityRole="button"
      accessibilityLabel={`${t('readingPlans.start')} — ${title}`}
      style={[styles.startButton, { borderColor: colors.accentPrimary }]}
    >
      <Text style={[styles.startButtonText, { color: colors.accentPrimary }]}>
        {t('readingPlans.start')}
      </Text>
    </PressableScale>
  );

  return (
    <PressableScale
      pressEffect="translate"
      onPress={() => onPlanPress(plan.id)}
      accessibilityRole="button"
      accessibilityLabel={[title, ...metaParts, isEnrolled ? t('readingPlans.enrolled') : null]
        .filter(Boolean)
        .join(', ')}
      style={[styles.row, isFirst ? null : styles.rowDivider]}
    >
      <View style={styles.coverFrame}>
        <PlanCover plan={plan} colors={colors} t={t} initialSize={22} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.metaEyebrow, displayFont.regular]} numberOfLines={2}>
          {metaParts.join(' · ')}
        </Text>
        {isLargeText ? <View style={belowTitleStyles.trailing}>{trailing}</View> : null}
      </View>
      {isLargeText ? null : trailing}
    </PressableScale>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    coverFrame: {
      width: ROW_COVER_SIZE,
      height: ROW_COVER_SIZE,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      flexShrink: 0,
    },
    body: {
      flex: 1,
      gap: spacing.xs,
    },
    title: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    metaEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    startButton: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 6,
      paddingHorizontal: 12,
      flexShrink: 0,
    },
    startButtonText: {
      ...typography.captionStrong,
      fontSize: 12.5,
      lineHeight: 16,
    },
  });
