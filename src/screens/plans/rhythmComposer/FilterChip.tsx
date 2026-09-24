import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';

export function FilterChip({
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
      <Text
        style={[styles.filterChipLabel, { color: active ? colors.onAccent : colors.primaryText }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
});
