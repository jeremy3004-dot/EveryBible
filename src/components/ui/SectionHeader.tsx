import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../design/system';
import { PressableScale } from './PressableScale';

export interface SectionHeaderAction {
  label: string;
  onPress: () => void;
}

export interface SectionHeaderProps {
  title: string;
  action?: SectionHeaderAction;
  style?: StyleProp<ViewStyle>;
}

// Quiet, eyebrow-style group label. Sections earn presence from the content
// below them, not from a loud heading.
export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, style]}>
      <Text style={[typography.eyebrow, { color: colors.textTertiary }]}>{title}</Text>
      {action ? (
        <PressableScale
          haptic="selection"
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[typography.label, { color: colors.accentPrimary }]}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
});
