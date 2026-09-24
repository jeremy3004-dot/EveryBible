import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';
import type { RhythmStatusPillVariant } from './rhythmDetailModel';

export function StatusPill({
  label,
  colors,
  variant = 'neutral',
}: {
  label: string;
  colors: ThemeColors;
  variant?: RhythmStatusPillVariant;
}) {
  const backgroundColor =
    variant === 'accent'
      ? colors.accentPrimary
      : variant === 'success'
        ? // White on the `success` fill is 4.09:1 on vellum; the soft status pair
          // is the one audited for text (contrastAudit.test.ts).
          colors.successSoft
        : colors.background;
  const textColor =
    variant === 'accent'
      ? colors.onAccent
      : variant === 'success'
        ? colors.onSuccessSoft
        : colors.secondaryText;
  const borderColor = variant === 'neutral' ? colors.cardBorder : 'transparent';

  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]}>
      <Text style={[styles.pillLabel, { color: textColor }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillLabel: {
    ...typography.micro,
  },
});
