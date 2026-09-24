import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { useLargeText } from '../../../hooks/useLargeText';
import { layout, radius, spacing, typography } from '../../../design/system';
import { getRhythmSegmentCardCopy, type RhythmSegmentViewModel } from './rhythmDetailModel';
import { StatusPill } from './StatusPill';

/** One item of the rhythm's sequence: a plan's day, or a repeatable passage. */
export function SegmentCard({
  item,
  colors,
}: {
  item: RhythmSegmentViewModel;
  colors: ThemeColors;
}) {
  const { t } = useTranslation();
  // At large text the status pill beside the title left it a word per line, so it
  // moves under the title and meta.
  const { isLargeText } = useLargeText();
  const copy = getRhythmSegmentCardCopy(item, t);

  const statusPill = (
    <StatusPill label={copy.statusLabel} colors={colors} variant={copy.statusVariant} />
  );

  return (
    <View
      style={[
        styles.segmentCard,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.segmentHeader}>
        <View style={[styles.segmentBadge, { backgroundColor: colors.background }]}>
          <Ionicons name="book-outline" size={18} color={colors.accentPrimary} />
        </View>
        <View style={styles.segmentHeaderCopy}>
          <Text style={[styles.segmentTitle, { color: colors.primaryText }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.segmentMeta, { color: colors.secondaryText }]}>{copy.meta}</Text>
          {isLargeText ? statusPill : null}
        </View>
        {isLargeText ? null : statusPill}
      </View>

      <View style={styles.segmentMetaRow}>
        <StatusPill label={copy.chapterCountLabel} colors={colors} />
        <StatusPill label={copy.progressLabel} colors={colors} />
      </View>

      {copy.body ? (
        <Text style={[styles.segmentBody, { color: colors.secondaryText }]}>{copy.body}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  segmentBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  segmentTitle: {
    ...typography.bodyStrong,
  },
  segmentMeta: {
    ...typography.micro,
  },
  segmentMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  segmentBody: {
    ...typography.body,
  },
});
