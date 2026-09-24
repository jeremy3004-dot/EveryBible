import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { layout, spacing, typography } from '../../../design/system';
import { AppCard } from '../../../components/ui';
import type { SelectedDayCopy } from './readingActivityScreenModel';

/**
 * The chosen day: its date, what was read and when. Pressable when there is a
 * chapter to reopen, which is where its chevron leads.
 */
export function SelectedDayCard({
  copy,
  onOpenChapter,
}: {
  copy: SelectedDayCopy;
  onOpenChapter: () => void;
}) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasChapter = Boolean(copy.chapter);

  return (
    <AppCard
      accentRule
      padding={layout.cardPadding}
      style={styles.dayCard}
      pressable={hasChapter}
      onPress={hasChapter ? onOpenChapter : undefined}
      // The label replaces the card's children for a screen reader, so it
      // carries the summary as well as the date.
      accessibilityLabel={copy.accessibilityLabel}
    >
      <View style={styles.dayRow}>
        <View style={styles.dayCopy}>
          <Text style={[styles.dayEyebrow, displayFont.regular]}>{copy.eyebrow}</Text>
          <Text style={styles.daySummary}>{copy.summary}</Text>
          {(copy.window ?? copy.hint) ? (
            <Text style={[styles.dayWindow, displayFont.regular]}>{copy.window ?? copy.hint}</Text>
          ) : null}
        </View>
        {hasChapter ? <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} /> : null}
      </View>
    </AppCard>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    dayCard: {
      marginBottom: spacing.xl,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    dayCopy: {
      flex: 1,
      paddingLeft: spacing.sm,
      gap: spacing.xs,
    },
    dayEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    daySummary: {
      ...typography.bodyStrong,
      fontSize: 16,
      lineHeight: 21,
      color: colors.primaryText,
    },
    dayWindow: {
      ...typography.mono,
      color: colors.secondaryText,
    },
  });
