import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../../components/ui';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { useLargeText } from '../../../hooks/useLargeText';
import type { CompletedPlanItem } from './plansHomeModel';
import { PlanCover } from './PlanCover';
import { belowTitleStyles, ROW_COVER_SIZE } from './plansHomeStyles';
import { SoftChip } from './SoftChip';
import { SwipeablePlanRow } from './SwipeablePlanRow';

interface CompletedPlanRowProps {
  item: CompletedPlanItem;
  /** The first row in the card draws no divider above it. */
  isFirst: boolean;
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
}

/** A finished plan: its finish date and a Completed chip, and a swipe to delete. */
export function CompletedPlanRow({
  item,
  isFirst,
  onPlanPress,
  onDeletePlan,
}: CompletedPlanRowProps) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const displayFont = useDisplayFont();
  const { isLargeText } = useLargeText();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const completedDate = item.completed_at
    ? new Date(item.completed_at).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const title = t(item.plan.title_key as Parameters<typeof t>[0]);

  return (
    <SwipeablePlanRow onDelete={() => onDeletePlan(item.plan.id)}>
      <PressableScale
        pressEffect="translate"
        onPress={() => onPlanPress(item.plan.id)}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[styles.row, isFirst ? null : styles.rowDivider]}
      >
        <View style={styles.coverFrame}>
          <PlanCover plan={item.plan} colors={colors} t={t} initialSize={22} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {completedDate ? (
            <Text style={[styles.eyebrow, displayFont.regular]} numberOfLines={2}>
              {completedDate}
            </Text>
          ) : null}
          {isLargeText ? (
            <View style={belowTitleStyles.trailing}>
              <SoftChip label={t('readingPlans.completed')} colors={colors} />
            </View>
          ) : null}
        </View>
        {isLargeText ? null : <SoftChip label={t('readingPlans.completed')} colors={colors} />}
      </PressableScale>
    </SwipeablePlanRow>
  );
}

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
    eyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
  });
