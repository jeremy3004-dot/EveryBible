import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing } from '../../../design/system';
import { RHYTHM_COVER_ASPECT, ROW_COVER_SIZE } from './plansHomeStyles';

/** The loading skeleton — the page's geometry: search strip, two-up grid, row list. */
export function PlansSkeleton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    // The blocks are empty shapes; to a screen reader the page is one busy
    // "Loading" element rather than nothing at all.
    <View
      style={styles.content}
      accessible
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
    >
      <Skeleton width="100%" height={44} borderRadius={radius.lg} />
      <View style={styles.section}>
        <Skeleton width="45%" height={18} borderRadius={radius.xs} />
        <View style={styles.grid}>
          {[0, 1].map((index) => (
            <View key={index} style={styles.gridCard}>
              <View style={styles.gridCover} />
              <Skeleton width="80%" height={14} borderRadius={radius.xs} />
              <Skeleton width="55%" height={11} borderRadius={radius.xs} />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Skeleton width="38%" height={18} borderRadius={radius.xs} />
        <View style={styles.listCard}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.listRow, index === 0 ? null : styles.listRowDivider]}>
              <Skeleton width={ROW_COVER_SIZE} height={ROW_COVER_SIZE} borderRadius={radius.sm} />
              <View style={styles.listRowBody}>
                <Skeleton width="70%" height={14} borderRadius={radius.xs} />
                <Skeleton width="40%" height={11} borderRadius={radius.xs} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      gap: spacing.xl,
    },
    section: {
      gap: spacing.md,
    },
    grid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    gridCard: {
      flexGrow: 0,
      flexBasis: '48%',
      gap: spacing.sm,
      padding: spacing.sm,
      paddingBottom: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    gridCover: {
      width: '100%',
      aspectRatio: RHYTHM_COVER_ASPECT,
      borderRadius: radius.sm,
      backgroundColor: colors.muted,
    },
    listCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    listRowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    listRowBody: {
      flex: 1,
      gap: spacing.sm,
    },
  });
