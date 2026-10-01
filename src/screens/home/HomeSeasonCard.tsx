import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../../components/ui/PressableScale';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import { radius, spacing, typography } from '../../design/system';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { PlanCover } from '../plans/plansHome/PlanCover';
import type { HomeSeasonPlan } from './homeSeasonPlanModel';

const COVER_WIDTH = 88;

interface HomeSeasonCardProps {
  seasonPlan: HomeSeasonPlan;
  onOpenPlan: (planId: string) => void;
}

/**
 * A seasonal plan (Lent, Advent, All Saints, …) offered on Home as its season
 * comes round: "Starts Wed, 10 Feb" before day 1, then where the season is.
 */
export function HomeSeasonCard({ seasonPlan, onOpenPlan }: HomeSeasonCardProps) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const displayFont = useDisplayFont();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { plan, season, daysUntilStart } = seasonPlan;

  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
  const meta = useMemo(() => {
    if (daysUntilStart > 0) {
      const date = season.start.toLocaleDateString(i18n.language || undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      return t('readingPlans.seasonStarts', { date });
    }
    if (daysUntilStart === 0) {
      return t('readingPlans.seasonStartsToday');
    }
    return t('readingPlans.dayOf', { current: 1 - daysUntilStart, total: season.dayCount });
  }, [daysUntilStart, i18n.language, season, t]);

  return (
    <PressableScale
      pressEffect="translate"
      haptic="light"
      onPress={() => onOpenPlan(plan.id)}
      accessibilityRole="button"
      accessibilityLabel={`${t('readingPlans.inSeason')}: ${title}`}
      accessibilityValue={{ text: meta }}
      style={styles.card}
    >
      <View style={styles.coverFrame}>
        <PlanCover plan={plan} colors={colors} t={t} initialSize={28} />
      </View>
      <View style={styles.body}>
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          style={[styles.eyebrow, displayFont.regular]}
          numberOfLines={1}
        >
          {t('readingPlans.inSeason')}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          style={[styles.meta, displayFont.regular]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.secondaryText} strokeWidth={2} />
    </PressableScale>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      paddingRight: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    coverFrame: {
      width: COVER_WIDTH,
      aspectRatio: 4 / 3,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.muted,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    eyebrow: {
      ...typography.eyebrow,
      color: colors.accentPrimary,
    },
    title: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    meta: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
  });
