import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';

export function MetaPill({
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
      <Text
        style={[styles.metaPillLabel, { color: accent ? colors.onAccent : colors.secondaryText }]}
      >
        {label}
      </Text>
    </View>
  );
}

/** The wrapping row pills sit in, shared by the hero, the current rhythm and each preset. */
export const metaPillRowStyle = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
}).row;

const styles = StyleSheet.create({
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
});
