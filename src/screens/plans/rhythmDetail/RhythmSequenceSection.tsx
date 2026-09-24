import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { RhythmSegmentViewModel } from './rhythmDetailModel';
import { SegmentCard } from './SegmentCard';

/** "Rhythm sequence" with Continue Rhythm, then a card per item, or the finished state. */
export function RhythmSequenceSection({
  segments,
  hasActiveSegments,
  onContinue,
}: {
  segments: RhythmSegmentViewModel[];
  hasActiveSegments: boolean;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: colors.primaryText }]}
        >
          {t('readingPlans.rhythmSequence', { defaultValue: 'Rhythm sequence' })}
        </Text>
        <TouchableOpacity
          onPress={onContinue}
          disabled={!hasActiveSegments}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasActiveSegments }}
          style={[
            styles.continueButton,
            { backgroundColor: hasActiveSegments ? colors.accentPrimary : colors.cardBorder },
          ]}
        >
          <Text
            style={[
              styles.continueLabel,
              { color: hasActiveSegments ? colors.onAccent : colors.secondaryText },
            ]}
          >
            {t('readingPlans.continueRhythm')}
          </Text>
        </TouchableOpacity>
      </View>

      {segments.length === 0 ? (
        <View
          style={[
            styles.emptyState,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            {t('readingPlans.completed')}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
            {t('readingPlans.noRhythmsBody')}
          </Text>
        </View>
      ) : (
        <View style={styles.segmentList}>
          {segments.map((item) => (
            <SegmentCard key={item.segment.itemId} item={item} colors={colors} />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.cardTitle,
    flex: 1,
  },
  continueButton: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: {
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
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
  },
  segmentList: {
    gap: spacing.md,
  },
});
