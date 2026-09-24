import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing } from '../../design/system';
import type { RhythmComposerScreenProps } from '../../navigation/types';
import { RHYTHM_PRESET_LIBRARY } from '../../services/plans/rhythmPresets';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import {
  ALL_TRADITIONS,
  ComposerHeader,
  CurrentRhythmCard,
  DeleteRhythmButton,
  filterRhythmPresets,
  PresetFilters,
  PresetList,
  useRhythmComposerActions,
  type SlotFilter,
} from './rhythmComposer';
import { RhythmStatusView } from './rhythmDetail';

export function RhythmComposerScreen({ navigation, route }: RhythmComposerScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rhythmId = route.params?.rhythmId ?? null;
  const isEditing = Boolean(rhythmId);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [traditionFilter, setTraditionFilter] = useState<string>(ALL_TRADITIONS);

  const currentRhythm = useReadingPlansStore((state) =>
    rhythmId ? (state.rhythmsById[rhythmId] ?? null) : null
  );
  const { applyPreset, confirmDelete } = useRhythmComposerActions(currentRhythm, navigation);

  const filteredPresets = useMemo(
    () => filterRhythmPresets(RHYTHM_PRESET_LIBRARY, slotFilter, traditionFilter),
    [slotFilter, traditionFilter]
  );

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  if (isEditing && !currentRhythm) {
    return (
      <RhythmStatusView
        status="error"
        message={t('plans.rhythmComposer.rhythmNotFound')}
        onBack={handleBack}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <ComposerHeader isEditing={isEditing} onBack={handleBack} />
        {currentRhythm ? <CurrentRhythmCard rhythm={currentRhythm} /> : null}
        <PresetFilters
          slotFilter={slotFilter}
          traditionFilter={traditionFilter}
          onSlotFilterChange={setSlotFilter}
          onTraditionFilterChange={setTraditionFilter}
        />
        <PresetList presets={filteredPresets} isEditing={isEditing} onApply={applyPreset} />
        {isEditing ? <DeleteRhythmButton onPress={confirmDelete} /> : null}
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
});
