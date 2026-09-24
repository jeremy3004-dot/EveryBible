import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing, typography } from '../../../design/system';
import { RHYTHM_PRESET_TRADITIONS } from '../../../services/plans/rhythmPresets';
import { FilterChip } from './FilterChip';
import {
  ALL_TRADITIONS,
  getTraditionLabelKey,
  SLOT_FILTER_CHIPS,
  type SlotFilter,
} from './rhythmComposerModel';

/** The "Time of day" and "Tradition" chip rows. */
export function PresetFilters({
  slotFilter,
  traditionFilter,
  onSlotFilterChange,
  onTraditionFilterChange,
}: {
  slotFilter: SlotFilter;
  traditionFilter: string;
  onSlotFilterChange: (filter: SlotFilter) => void;
  onTraditionFilterChange: (tradition: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.filterSection}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: colors.primaryText }]}
        >
          {t('plans.rhythmComposer.timeOfDay')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {SLOT_FILTER_CHIPS.map(({ filter, labelKey }) => (
            <FilterChip
              key={filter}
              label={t(labelKey)}
              active={slotFilter === filter}
              colors={colors}
              onPress={() => onSlotFilterChange(filter)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterSection}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: colors.primaryText }]}
        >
          {t('plans.rhythmComposer.tradition')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label={t('plans.rhythmComposer.allTraditions')}
            active={traditionFilter === ALL_TRADITIONS}
            colors={colors}
            onPress={() => onTraditionFilterChange(ALL_TRADITIONS)}
          />
          {RHYTHM_PRESET_TRADITIONS.map((tradition) => (
            <FilterChip
              key={tradition}
              label={t(getTraditionLabelKey(tradition))}
              active={traditionFilter === tradition}
              colors={colors}
              onPress={() => onTraditionFilterChange(tradition)}
            />
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  filterSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.cardTitle,
  },
  filterRow: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
});
