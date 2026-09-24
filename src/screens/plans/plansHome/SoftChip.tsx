import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { radius, typography } from '../../../design/system';
import { useDisplayFont } from '../../../hooks/useDisplayFont';

/** The soft status chip on a row — "ENROLLED" / "COMPLETED". */
export function SoftChip({ label, colors }: { label: string; colors: ThemeColors }) {
  const displayFont = useDisplayFont();
  return (
    <View style={[styles.chip, { backgroundColor: colors.successSoft }]}>
      <Text
        style={[typography.monoSmall, displayFont.regular, { color: colors.onSuccessSoft }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexShrink: 0,
  },
});
