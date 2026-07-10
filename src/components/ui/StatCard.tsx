import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { numeric, spacing, typography } from '../../design/system';
import { AppCard } from './AppCard';

export interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  /** Tint the value + icon with the accent instead of the primary text color. */
  accent?: boolean;
  /** Override the icon/value tint (e.g. milestone colors). */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}

// Icon + tabular-nums value + label, on a resting card. Values use `numeric` so
// counters and streaks don't jitter as digits change.
export function StatCard({ icon, value, label, accent = false, tint, style }: StatCardProps) {
  const { colors } = useTheme();
  const emphasisColor = tint ?? (accent ? colors.accentPrimary : colors.primaryText);

  return (
    <AppCard padding={spacing.lg} style={style}>
      <View style={styles.header}>
        <Ionicons name={icon} size={18} color={emphasisColor} />
      </View>
      <Text style={[styles.value, numeric, { color: emphasisColor }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[typography.micro, { color: colors.secondaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});
