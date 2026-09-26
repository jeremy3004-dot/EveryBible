import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../../hooks/useDisplayFont';
import { layout, radius, spacing, typography } from '../../../../design/system';

/** A section of the audio sheet under its eyebrow heading. */
export function AudioSheetSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[typography.eyebrow, displayFont.regular, { color: colors.bibleSecondaryText }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

// Chips are drawn shorter than the 44pt touch floor; the slop makes up the rest.
const CHIP_HIT_SLOP = { top: spacing.xs, bottom: spacing.xs, left: 0, right: 0 };

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

interface ChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  /** Spoken instead of `label` when the visible text is not the option's name. */
  accessibilityLabel?: string;
  accessibilityValue?: string;
  accessibilityHint?: string;
}

/** One option of a chip group; the selected one sits on the accent surface. */
export function Chip({
  label,
  isSelected,
  onPress,
  accessibilityLabel,
  accessibilityValue,
  accessibilityHint,
}: ChipProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        isSelected
          ? { backgroundColor: colors.accentSurface, borderColor: colors.accentSurface }
          : { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
      ]}
      onPress={onPress}
      hitSlop={CHIP_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={accessibilityValue ? { text: accessibilityValue } : undefined}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[
          styles.chipText,
          { color: isSelected ? colors.onAccentSurface : colors.biblePrimaryText },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: layout.minTouchTarget - spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    ...typography.label,
  },
});
