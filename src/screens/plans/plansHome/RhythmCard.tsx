import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppCard } from '../../../components/ui';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { useLargeText } from '../../../hooks/useLargeText';
import { getActivePlanDayNumber } from '../../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import { formatPlanCadenceLabel } from './plansHomeModel';
import { PlanCover } from './PlanCover';
import { RHYTHM_COVER_ASPECT } from './plansHomeStyles';

interface RhythmCardProps {
  plan: ReadingPlan;
  /** The reader's progress in this plan; absent when not enrolled. */
  progress: UserReadingPlanProgress | undefined;
  today: Date;
  onPlanPress: (planId: string) => void;
}

/** Two-up cover card — the "Daily rhythms" shape on Find plans. */
export function RhythmCard({ plan, progress, today, onPlanPress }: RhythmCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  // Two rhythm cards to a row leaves ~150pt per title; at large text sizes that
  // is a word per line, so each card takes the full row instead.
  const { isLargeText } = useLargeText();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEnrolled = progress !== undefined;
  const cadence = formatPlanCadenceLabel(plan, t);
  const dayLabel = progress
    ? t('readingPlans.dayOf', {
        current: getActivePlanDayNumber(plan, progress, today),
        total: plan.duration_days,
      })
    : null;
  // Enrolled rhythms lead with where you are; everything else leads with the
  // cadence the plan actually runs on ("MORNING + EVENING").
  const metaLabel =
    cadence ?? dayLabel ?? t('readingPlans.daysCount', { count: plan.duration_days });
  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });

  return (
    <AppCard
      pressable
      padding={spacing.sm}
      onPress={() => onPlanPress(plan.id)}
      accessibilityLabel={title}
      // The tick marks enrolment visually; say it, with the cadence.
      accessibilityValue={{
        text: [metaLabel, isEnrolled ? t('readingPlans.enrolled') : null]
          .filter(Boolean)
          .join(', '),
      }}
      style={[styles.card, isLargeText && styles.cardFullRow]}
    >
      <View style={styles.coverFrame}>
        <PlanCover plan={plan} colors={colors} t={t} initialSize={34} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          {isEnrolled ? <Check size={12} color={colors.success} strokeWidth={2} /> : null}
          <Text style={[styles.metaEyebrow, displayFont.regular, styles.metaText]}>
            {metaLabel}
          </Text>
        </View>
      </View>
    </AppCard>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      // Two to a row. flexGrow stays 0 so an odd third card keeps its column
      // width instead of stretching across the full gutter.
      flexGrow: 0,
      flexBasis: '48%',
      paddingBottom: spacing.md,
    },
    cardFullRow: {
      flexBasis: '100%',
    },
    coverFrame: {
      width: '100%',
      aspectRatio: RHYTHM_COVER_ASPECT,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
    },
    body: {
      paddingHorizontal: 6,
      paddingTop: spacing.sm,
      gap: spacing.xs,
    },
    title: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    metaText: {
      flex: 1,
    },
    metaEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
  });
