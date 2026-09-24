import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { localizeRhythmPreset } from '../../../services/plans/rhythmLocalization';
import type { RhythmPreset } from '../../../services/plans/rhythmPresets';
import { RHYTHM_SLOT_META } from '../../../services/plans/rhythmSlots';
import { MetaPill, metaPillRowStyle } from './MetaPill';
import { buildPresetItemPreview, getRhythmSlotLabel } from './rhythmComposerModel';

/**
 * One historic rhythm, tappable to add it (or to replace the rhythm being edited).
 * Memoised with a stable `onApply`, so a filter change leaves the cards that stay
 * on screen alone instead of re-localizing every preset.
 */
export const PresetCard = memo(function PresetCard({
  preset,
  colors,
  actionLabel,
  onApply,
}: {
  preset: RhythmPreset;
  colors: ThemeColors;
  actionLabel: string;
  onApply: (preset: RhythmPreset) => void;
}) {
  const { t } = useTranslation();
  const localizedPreset = localizeRhythmPreset(preset, t);
  const slotMeta = preset.slot ? RHYTHM_SLOT_META[preset.slot] : null;

  return (
    <TouchableOpacity
      onPress={() => onApply(preset)}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[
        styles.presetCard,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.presetHeader}>
        <View
          style={[
            styles.presetIconWrap,
            { backgroundColor: colors.background, borderColor: colors.cardBorder },
          ]}
        >
          <Ionicons
            name={slotMeta?.iconName ?? 'library-outline'}
            size={18}
            color={colors.accentPrimary}
          />
        </View>
        <View style={styles.presetHeaderCopy}>
          <Text style={[styles.presetTitle, { color: colors.primaryText }]} numberOfLines={2}>
            {localizedPreset.title}
          </Text>
          <Text style={[styles.presetBody, { color: colors.secondaryText }]} numberOfLines={3}>
            {localizedPreset.description}
          </Text>
        </View>
      </View>

      <View style={metaPillRowStyle}>
        <MetaPill label={localizedPreset.tradition} colors={colors} accent />
        <MetaPill label={getRhythmSlotLabel(preset.slot, t)} colors={colors} />
        <MetaPill
          label={t('readingPlans.chapterCount', {
            count: preset.items.length,
            defaultValue: `${preset.items.length} passages`,
          })}
          colors={colors}
        />
      </View>

      <View style={styles.sourceBlock}>
        <Text style={[styles.sourceLabel, { color: colors.secondaryText }]}>
          {t('plans.rhythmComposer.historicRoots')}
        </Text>
        <Text style={[styles.sourceValue, { color: colors.primaryText }]}>
          {localizedPreset.historicRoots}
        </Text>
      </View>

      <View style={styles.sourceBlock}>
        <Text style={[styles.sourceLabel, { color: colors.secondaryText }]}>
          {t('plans.rhythmComposer.includes')}
        </Text>
        <Text style={[styles.includesValue, { color: colors.primaryText }]}>
          {buildPresetItemPreview(localizedPreset)}
        </Text>
      </View>

      <View style={[styles.inlineAction, { backgroundColor: colors.accentPrimary }]}>
        <Ionicons name="add-outline" size={18} color={colors.onAccent} />
        <Text style={[styles.inlineActionLabel, { color: colors.onAccent }]}>{actionLabel}</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  presetCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  presetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  presetTitle: {
    ...typography.bodyStrong,
    fontSize: 18,
    lineHeight: 24,
  },
  presetBody: {
    ...typography.body,
  },
  sourceBlock: {
    gap: 4,
  },
  sourceLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sourceValue: {
    ...typography.bodyStrong,
  },
  includesValue: {
    ...typography.body,
  },
  inlineAction: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  inlineActionLabel: {
    ...typography.label,
  },
});
