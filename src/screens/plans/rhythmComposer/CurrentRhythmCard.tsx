import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { getLocalizedRhythmTitle } from '../../../services/plans/rhythmLocalization';
import { inferRhythmSlotFromTitle } from '../../../services/plans/rhythmSlots';
import type { ReadingPlanRhythm } from '../../../services/plans/types';
import { MetaPill, metaPillRowStyle } from './MetaPill';
import { getRhythmSlotLabel } from './rhythmComposerModel';

/** In edit mode: the rhythm a chosen preset will replace. */
export function CurrentRhythmCard({ rhythm }: { rhythm: ReadingPlanRhythm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const slot = rhythm.slot ?? inferRhythmSlotFromTitle(rhythm.title);

  return (
    <View
      style={[
        styles.currentRhythmCard,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.primaryText }]}>
        {t('plans.rhythmComposer.replaceCurrentTitle')}
      </Text>
      <Text style={[styles.currentRhythmTitle, { color: colors.primaryText }]}>
        {getLocalizedRhythmTitle(rhythm.title, t)}
      </Text>
      <Text style={[styles.currentRhythmBody, { color: colors.secondaryText }]}>
        {t('plans.rhythmComposer.replaceCurrentBody')}
      </Text>
      <View style={metaPillRowStyle}>
        <MetaPill label={getRhythmSlotLabel(slot ?? null, t)} colors={colors} />
        <MetaPill
          label={t('readingPlans.rhythmItemCount', {
            count: rhythm.items.length,
            defaultValue: `${rhythm.items.length} items`,
          })}
          colors={colors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  currentRhythmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.cardTitle,
  },
  currentRhythmTitle: {
    ...typography.cardTitle,
  },
  currentRhythmBody: {
    ...typography.body,
  },
});
