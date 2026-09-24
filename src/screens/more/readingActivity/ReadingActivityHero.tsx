import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { spacing, typography } from '../../../design/system';

/** The streak is the headline; chapter and listening totals ride the right rail. */
export function ReadingActivityHero({
  streakDays,
  chapterTotal,
  listeningLabel,
}: {
  streakDays: number;
  chapterTotal: number;
  listeningLabel: string;
}) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.hero}>
      <View style={styles.heroStreak}>
        <Text style={[styles.heroEyebrow, displayFont.regular]}>
          {t('readingActivity.currentStreak')}
        </Text>
        <View style={styles.heroStreakRow}>
          <Text maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE} style={styles.heroStreakNumber}>
            {streakDays}
          </Text>
          <Text style={[styles.heroStreakUnit, displayFont.bold]}>
            {t('readingActivity.streakUnit', { count: streakDays })}
          </Text>
        </View>
      </View>
      <View style={styles.heroTotals}>
        <Text style={styles.heroTotalValue}>{chapterTotal}</Text>
        <Text style={[styles.heroTotalLabel, displayFont.regular]}>
          {t('readingActivity.chapters')}
        </Text>
        <Text style={[styles.heroTotalValue, styles.heroTotalValueSpaced]}>{listeningLabel}</Text>
        <Text style={[styles.heroTotalLabel, displayFont.regular]}>
          {t('readingActivity.listening')}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    hero: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.primaryText,
      marginBottom: spacing.xl,
    },
    heroStreak: {
      flexShrink: 1,
    },
    heroEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginBottom: spacing.sm,
    },
    heroStreakRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    heroStreakNumber: {
      ...typography.numeralStreak,
      color: colors.primaryText,
    },
    heroStreakUnit: {
      ...typography.sectionHeading,
      fontSize: 20,
      lineHeight: 20,
      letterSpacing: -0.5,
      color: colors.secondaryText,
    },
    heroTotals: {
      alignItems: 'flex-end',
    },
    heroTotalValue: {
      ...typography.numeralRow,
      fontSize: 22,
      lineHeight: 22,
      letterSpacing: -0.88,
      color: colors.primaryText,
      textAlign: 'right',
    },
    heroTotalValueSpaced: {
      marginTop: spacing.md,
    },
    heroTotalLabel: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginTop: spacing.xs,
      textAlign: 'right',
    },
  });
