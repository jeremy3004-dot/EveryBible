import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { RhythmPreset } from '../../../services/plans/rhythmPresets';
import { PresetCard } from './PresetCard';

/** The presets the filters leave, or a note that none match. */
export function PresetList({
  presets,
  isEditing,
  onApply,
}: {
  presets: RhythmPreset[];
  isEditing: boolean;
  onApply: (preset: RhythmPreset) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (presets.length === 0) {
    return (
      <View
        style={[
          styles.emptyState,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <Ionicons name="search-outline" size={24} color={colors.accentPrimary} />
        <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
          {t('plans.rhythmComposer.emptyTitle')}
        </Text>
        <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
          {t('plans.rhythmComposer.emptyBody')}
        </Text>
      </View>
    );
  }

  const actionLabel = isEditing
    ? t('plans.rhythmComposer.replaceRhythm')
    : t('plans.rhythmComposer.addRhythm');

  return (
    <View style={styles.presetList}>
      {presets.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          colors={colors}
          actionLabel={actionLabel}
          onApply={onApply}
        />
      ))}
    </View>
  );
}

/** Edit mode's last action: delete the rhythm, after a confirmation. */
export function DeleteRhythmButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[
        styles.destructiveButton,
        { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
      ]}
    >
      <Ionicons name="trash-outline" size={18} color={colors.error} />
      <Text style={[styles.destructiveLabel, { color: colors.error }]}>
        {t('readingPlans.deleteRhythm')}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  presetList: {
    gap: spacing.md,
  },
  emptyState: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.bodyStrong,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
  },
  destructiveButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  destructiveLabel: {
    ...typography.label,
  },
});
