import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { layout, radius, spacing, typography } from '../../../design/system';
import { getLocalizedRhythmTitle } from '../../../services/plans/rhythmLocalization';
import type { ReadingPlanRhythm } from '../../../services/plans/types';
import { getRhythmSlotPresentation } from './rhythmDetailModel';

/** Back, the rhythm's title, slot badge and item count, and Edit. */
export function RhythmDetailHeader({
  rhythm,
  onBack,
  onEdit,
}: {
  rhythm: ReadingPlanRhythm;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const slotPresentation = getRhythmSlotPresentation(rhythm);
  const totalItemCount = rhythm.items.length;

  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={[
          styles.roundButton,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
      </TouchableOpacity>
      <View style={styles.headerCopy}>
        <Text
          maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
          accessibilityRole="header"
          style={[styles.title, displayFont.bold, { color: colors.primaryText }]}
          numberOfLines={2}
        >
          {getLocalizedRhythmTitle(rhythm.title, t)}
        </Text>
        {slotPresentation ? (
          <View
            style={[
              styles.slotBadge,
              { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
            ]}
          >
            <Ionicons name={slotPresentation.iconName} size={14} color={colors.accentPrimary} />
            <Text style={[styles.slotBadgeLabel, { color: colors.primaryText }]}>
              {t(slotPresentation.labelKey)}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('readingPlans.rhythmItemCount', {
            count: totalItemCount,
            defaultValue: `${totalItemCount} items`,
          })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onEdit}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('readingPlans.editRhythm')}
        style={[
          styles.roundButton,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <Ionicons name="create-outline" size={18} color={colors.primaryText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  // The back and edit buttons share one shape.
  roundButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.screenTitle,
  },
  subtitle: {
    ...typography.body,
  },
  slotBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  slotBadgeLabel: {
    ...typography.micro,
  },
});
