import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppCard, ProgressBar } from '../../../components/ui';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { readingPlanEntriesByPlanId } from '../../../data/readingPlans.generated';
import { radius, spacing, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { getCurrentPlanDaySummary } from '../../../services/plans/readingPlanActivity';
import {
  getActivePlanDayNumber,
  isMultiSessionPlan,
  isRecurringPlan,
} from '../../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import type { ListeningHistoryEntry } from '../../../stores/libraryModel';
import {
  formatProgressPercent,
  formatSessionStatusSummary,
  getActivePlanProgressRatio,
  getLocalizedSessionLabel,
} from './plansHomeModel';
import { PlanCover } from './PlanCover';
import { SwipeablePlanRow } from './SwipeablePlanRow';

interface ActivePlanCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress;
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  /** The local "now" a recurring plan's day and today's activity are read against. */
  today: Date;
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
}

/**
 * A started plan on My Plans: where the reader is today, and a swipe to delete.
 * Memoized: its day summary scans today's reading, and a progress write to another
 * plan or a pull-to-refresh leaves this card's props unchanged.
 */
export const ActivePlanCard = memo(function ActivePlanCard({
  plan,
  progress,
  chaptersRead,
  listeningHistory,
  today,
  onPlanPress,
  onDeletePlan,
}: ActivePlanCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currentDay = getActivePlanDayNumber(plan, progress, today);
  const currentDaySummary = getCurrentPlanDaySummary({
    plan,
    entries: readingPlanEntriesByPlanId[plan.id] ?? [],
    progress,
    chaptersRead,
    listeningHistory,
    today,
  });
  const progressRatio = getActivePlanProgressRatio(plan, currentDay);
  const sessionStatus = isMultiSessionPlan(plan)
    ? formatSessionStatusSummary(currentDaySummary, t)
    : null;
  const ctaLabel =
    isRecurringPlan(plan) && currentDaySummary?.nextIncompleteSessionKey
      ? getLocalizedSessionLabel(currentDaySummary.nextIncompleteSessionKey, t)
      : t('common.continue');
  const title = t(plan.title_key as Parameters<typeof t>[0]);
  const dayOf = t('readingPlans.dayOf', { current: currentDay, total: plan.duration_days });

  return (
    <SwipeablePlanRow onDelete={() => onDeletePlan(plan.id)}>
      <AppCard
        pressable
        padding={12}
        onPress={() => onPlanPress(plan.id)}
        accessibilityLabel={title}
        accessibilityValue={{
          text: [dayOf, sessionStatus, formatProgressPercent(progressRatio)]
            .filter(Boolean)
            .join(', '),
        }}
        // Delete is otherwise only reachable by swiping the row.
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDeletePlan(plan.id);
        }}
      >
        <View style={styles.cardTop}>
          <View style={styles.coverFrame}>
            <PlanCover plan={plan} colors={colors} t={t} initialSize={26} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[styles.cardEyebrow, displayFont.regular]} numberOfLines={2}>
              {dayOf}
            </Text>
            {sessionStatus ? (
              <View style={styles.sessionRow}>
                <Check size={12} color={colors.success} strokeWidth={2} />
                <Text
                  style={[styles.cardEyebrow, displayFont.regular, styles.sessionSummary]}
                  numberOfLines={2}
                >
                  {sessionStatus}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <ProgressBar
          progress={progressRatio}
          style={styles.progressBar}
          accessibilityLabel={t('readingPlans.progress')}
        />
        <View style={styles.cardFooter}>
          <Text style={[typography.mono, displayFont.regular, { color: colors.secondaryText }]}>
            {formatProgressPercent(progressRatio)}
          </Text>
          <View style={[styles.outlineAction, { borderColor: colors.accentPrimary }]}>
            <Text
              style={[styles.outlineActionText, { color: colors.accentPrimary }]}
              numberOfLines={2}
            >
              {ctaLabel}
            </Text>
          </View>
        </View>
      </AppCard>
    </SwipeablePlanRow>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    coverFrame: {
      width: 64,
      height: 64,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      flexShrink: 0,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
    },
    cardTitle: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    cardEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sessionSummary: {
      flex: 1,
    },
    progressBar: {
      marginTop: spacing.md,
    },
    // Wraps, and the CTA may shrink and take two lines: at large text sizes a
    // one-line, unshrinkable "Continue reading" ran past the card edge.
    cardFooter: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    outlineAction: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 6,
      paddingHorizontal: 12,
      flexShrink: 1,
    },
    outlineActionText: {
      ...typography.captionStrong,
      fontSize: 12.5,
      lineHeight: 16,
    },
  });
