import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import type { RhythmComposerScreenProps } from '../../navigation/types';
import { RHYTHM_SLOT_META, inferRhythmSlotFromTitle } from '../../services/plans/rhythmSlots';
import {
  buildPresetRhythmItems,
  RHYTHM_PRESET_LIBRARY,
  RHYTHM_PRESET_TRADITIONS,
  type RhythmPreset,
} from '../../services/plans/rhythmPresets';
import type { RhythmSlot } from '../../services/plans/types';
import { RHYTHM_MUTATION_ERROR_CODES } from '../../stores/readingPlansStore';
import { useReadingPlansStore } from '../../stores';
import { mediumHaptic, successHaptic } from '../../utils';

type SlotFilter = 'all' | 'anytime' | RhythmSlot;

const ALL_TRADITIONS = 'All traditions';

/** Maps a stable rhythm-mutation error code (H9) to a translated message. */
function resolveRhythmErrorMessage(
  code: string | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string {
  switch (code) {
    case RHYTHM_MUTATION_ERROR_CODES.emptyItems:
      return t('plans.rhythmComposer.errorEmptyItems');
    case RHYTHM_MUTATION_ERROR_CODES.planInAnotherRhythm:
      return t('plans.rhythmComposer.errorPlanInAnotherRhythm');
    case RHYTHM_MUTATION_ERROR_CODES.notFound:
      return t('plans.rhythmComposer.errorRhythmNotFound');
    default:
      return t('common.unexpectedError', { defaultValue: 'Something went wrong' });
  }
}

function FilterChip({
  label,
  active,
  colors,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? colors.accentPrimary : colors.cardBackground,
          borderColor: active ? colors.accentPrimary : colors.cardBorder,
        },
      ]}
    >
      <Text style={[styles.filterChipLabel, { color: active ? colors.onAccent : colors.primaryText }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MetaPill({
  label,
  colors,
  accent = false,
}: {
  label: string;
  colors: ThemeColors;
  accent?: boolean;
}) {
  return (
    <View
      style={[
        styles.metaPill,
        {
          backgroundColor: accent ? colors.accentPrimary : colors.background,
          borderColor: accent ? colors.accentPrimary : colors.cardBorder,
        },
      ]}
    >
      <Text style={[styles.metaPillLabel, { color: accent ? colors.onAccent : colors.secondaryText }]}>
        {label}
      </Text>
    </View>
  );
}

function getSlotLabel(slot: RhythmSlot | null, t: ReturnType<typeof useTranslation>['t']): string {
  if (!slot) {
    return t('plans.rhythmComposer.anyTime');
  }

  return t(RHYTHM_SLOT_META[slot].shortLabelKey);
}

function PresetCard({
  preset,
  colors,
  t,
  actionLabel,
  saving = false,
  onPress,
}: {
  preset: RhythmPreset;
  colors: ThemeColors;
  t: ReturnType<typeof useTranslation>['t'];
  actionLabel: string;
  saving?: boolean;
  onPress: () => void;
}) {
  const slotMeta = preset.slot ? RHYTHM_SLOT_META[preset.slot] : null;
  const itemPreview = preset.items
    .map((item) => ('title' in item ? item.title : item.planId))
    .join('  •  ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      disabled={saving}
      style={[styles.presetCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
    >
      <View style={styles.presetHeader}>
        <View
          style={[
            styles.presetIconWrap,
            {
              backgroundColor: colors.background,
              borderColor: colors.cardBorder,
            },
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
            {preset.title}
          </Text>
          <Text style={[styles.presetBody, { color: colors.secondaryText }]} numberOfLines={3}>
            {preset.description}
          </Text>
        </View>
      </View>

      <View style={styles.presetMetaRow}>
        <MetaPill label={preset.tradition} colors={colors} accent />
        <MetaPill label={getSlotLabel(preset.slot, t)} colors={colors} />
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
        <Text style={[styles.sourceValue, { color: colors.primaryText }]}>{preset.historicRoots}</Text>
      </View>

      <View style={styles.sourceBlock}>
        <Text style={[styles.sourceLabel, { color: colors.secondaryText }]}>
          {t('plans.rhythmComposer.includes')}
        </Text>
        <Text style={[styles.includesValue, { color: colors.primaryText }]}>{itemPreview}</Text>
      </View>

      <View style={[styles.inlineAction, { backgroundColor: colors.accentPrimary }]}>
        {saving ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <Ionicons name="add-outline" size={18} color={colors.onAccent} />
        )}
        <Text style={[styles.inlineActionLabel, { color: colors.onAccent }]}>{actionLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function RhythmComposerScreen({ navigation, route }: RhythmComposerScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rhythmId = route.params?.rhythmId ?? null;
  const isEditing = Boolean(rhythmId);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [traditionFilter, setTraditionFilter] = useState<string>(ALL_TRADITIONS);
  const [savingPresetId] = useState<string | null>(null);

  const rhythmsById = useReadingPlansStore((state) => state.rhythmsById);
  const createRhythm = useReadingPlansStore((state) => state.createRhythm);
  const updateRhythm = useReadingPlansStore((state) => state.updateRhythm);
  const deleteRhythm = useReadingPlansStore((state) => state.deleteRhythm);
  const currentRhythm = rhythmId ? rhythmsById[rhythmId] ?? null : null;

  const filteredPresets = useMemo(
    () =>
      RHYTHM_PRESET_LIBRARY.filter((preset) => {
        const matchesSlot =
          slotFilter === 'all'
            ? true
            : slotFilter === 'anytime'
              ? preset.slot === null
              : preset.slot === slotFilter;
        const matchesTradition =
          traditionFilter === ALL_TRADITIONS ? true : preset.tradition === traditionFilter;

        return matchesSlot && matchesTradition;
      }),
    [slotFilter, traditionFilter]
  );

  const currentRhythmSlot = currentRhythm?.slot ?? inferRhythmSlotFromTitle(currentRhythm?.title);

  const handleApplyPreset = useCallback(
    (preset: RhythmPreset) => {
      const result = currentRhythm
        ? updateRhythm(currentRhythm.id, {
            title: preset.title,
            slot: preset.slot,
            items: buildPresetRhythmItems(preset),
          })
        : createRhythm({
            title: preset.title,
            slot: preset.slot,
            items: buildPresetRhythmItems(preset),
          });

      if (!result.success || !result.rhythm) {
        Alert.alert(
          t('common.error', { defaultValue: 'Error' }),
          resolveRhythmErrorMessage(result.error, t)
        );
        return;
      }

      successHaptic();
      navigation.replace('RhythmDetail', { rhythmId: result.rhythm.id });
    },
    [createRhythm, currentRhythm, navigation, t, updateRhythm]
  );

  const handleDeleteRhythm = useCallback(() => {
    if (!currentRhythm) {
      return;
    }

    Alert.alert(
      t('readingPlans.deleteRhythmConfirmTitle'),
      t('readingPlans.deleteRhythmConfirmBody', { title: currentRhythm.title }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            mediumHaptic();
            deleteRhythm(currentRhythm.id);
            navigation.popToTop();
          },
        },
      ]
    );
  }, [currentRhythm, deleteRhythm, navigation, t]);

  if (isEditing && !currentRhythm) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.primaryText }]}>
            {t('readingPlans.rhythms')}
          </Text>
          <Text style={[styles.errorBody, { color: colors.secondaryText }]}>
            {t('plans.rhythmComposer.rhythmNotFound')}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[styles.errorButton, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={[styles.errorButtonLabel, { color: colors.onAccent }]}>
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.backButton, { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.screenTitle, { color: colors.primaryText }]}>
              {isEditing ? t('readingPlans.editRhythm') : t('readingPlans.createRhythm')}
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.secondaryText }]}>
              {t('plans.rhythmComposer.subtitle')}
            </Text>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <Text style={[styles.heroEyebrow, { color: colors.accentPrimary }]}>
            {t('plans.rhythmComposer.heroEyebrow')}
          </Text>
          <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
            {t('plans.rhythmComposer.heroTitle')}
          </Text>
          <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
            {t('plans.rhythmComposer.heroBody')}
          </Text>
          <View style={styles.heroMetaRow}>
            <MetaPill
              label={t('plans.rhythmComposer.presetCount', {
                count: RHYTHM_PRESET_LIBRARY.length,
              })}
              colors={colors}
              accent
            />
            <MetaPill label={t('plans.rhythmComposer.prayerAndScripture')} colors={colors} />
            <MetaPill label={t('plans.rhythmComposer.tapToAdd')} colors={colors} />
          </View>
        </View>

        {currentRhythm ? (
          <View
            style={[
              styles.currentRhythmCard,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
              {t('plans.rhythmComposer.replaceCurrentTitle')}
            </Text>
            <Text style={[styles.currentRhythmTitle, { color: colors.primaryText }]}>{currentRhythm.title}</Text>
            <Text style={[styles.currentRhythmBody, { color: colors.secondaryText }]}>
              {t('plans.rhythmComposer.replaceCurrentBody')}
            </Text>
            <View style={styles.heroMetaRow}>
              <MetaPill label={getSlotLabel(currentRhythmSlot ?? null, t)} colors={colors} />
              <MetaPill
                label={t('readingPlans.rhythmItemCount', {
                  count: currentRhythm.items.length,
                  defaultValue: `${currentRhythm.items.length} items`,
                })}
                colors={colors}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.filterSection}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
            {t('plans.rhythmComposer.timeOfDay')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterChip
              label={t('plans.rhythmComposer.filterAll')}
              active={slotFilter === 'all'}
              colors={colors}
              onPress={() => setSlotFilter('all')}
            />
            <FilterChip
              label={t(RHYTHM_SLOT_META.morning.shortLabelKey)}
              active={slotFilter === 'morning'}
              colors={colors}
              onPress={() => setSlotFilter('morning')}
            />
            <FilterChip
              label={t('plans.rhythmComposer.midday')}
              active={slotFilter === 'afternoon'}
              colors={colors}
              onPress={() => setSlotFilter('afternoon')}
            />
            <FilterChip
              label={t(RHYTHM_SLOT_META.evening.shortLabelKey)}
              active={slotFilter === 'evening'}
              colors={colors}
              onPress={() => setSlotFilter('evening')}
            />
            <FilterChip
              label={t('plans.rhythmComposer.anyTime')}
              active={slotFilter === 'anytime'}
              colors={colors}
              onPress={() => setSlotFilter('anytime')}
            />
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
            {t('plans.rhythmComposer.tradition')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterChip
              label={t('plans.rhythmComposer.allTraditions')}
              active={traditionFilter === ALL_TRADITIONS}
              colors={colors}
              onPress={() => setTraditionFilter(ALL_TRADITIONS)}
            />
            {RHYTHM_PRESET_TRADITIONS.map((tradition) => (
              <FilterChip
                key={tradition}
                label={tradition}
                active={traditionFilter === tradition}
                colors={colors}
                onPress={() => setTraditionFilter(tradition)}
              />
            ))}
          </ScrollView>
        </View>

        {filteredPresets.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
            <Ionicons name="search-outline" size={24} color={colors.accentPrimary} />
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
              {t('plans.rhythmComposer.emptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
              {t('plans.rhythmComposer.emptyBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.presetList}>
            {filteredPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                colors={colors}
                t={t}
                saving={savingPresetId === preset.id}
                actionLabel={
                  isEditing
                    ? t('plans.rhythmComposer.replaceRhythm')
                    : t('plans.rhythmComposer.addRhythm')
                }
                onPress={() => handleApplyPreset(preset)}
              />
            ))}
          </View>
        )}

        {isEditing ? (
          <TouchableOpacity
            onPress={handleDeleteRhythm}
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
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  backButton: {
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
  screenTitle: {
    ...typography.screenTitle,
  },
  screenSubtitle: {
    ...typography.body,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  heroEyebrow: {
    ...typography.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typography.sectionTitle,
  },
  heroBody: {
    ...typography.body,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  currentRhythmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.sm,
  },
  currentRhythmTitle: {
    ...typography.cardTitle,
  },
  currentRhythmBody: {
    ...typography.body,
  },
  sectionTitle: {
    ...typography.cardTitle,
  },
  filterSection: {
    gap: spacing.sm,
  },
  filterRow: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  filterChip: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipLabel: {
    ...typography.micro,
  },
  presetList: {
    gap: spacing.md,
  },
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
  presetMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaPill: {
    minHeight: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaPillLabel: {
    ...typography.micro,
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  errorTitle: {
    ...typography.screenTitle,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.body,
    textAlign: 'center',
  },
  errorButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: layout.cardPadding,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorButtonLabel: {
    ...typography.label,
  },
});
