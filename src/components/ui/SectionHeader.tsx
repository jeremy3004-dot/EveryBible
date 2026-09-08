import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { spacing, typography } from '../../design/system';
import { PressableScale } from './PressableScale';

export interface SectionHeaderAction {
  label: string;
  onPress: () => void;
}

export interface SectionHeaderProps {
  title: string;
  /** Right-hand metadata in the eyebrow style — "2 PLANS", "365 DAYS". */
  eyebrow?: string;
  /** Right-hand tappable link. Ignored when `eyebrow` is set. */
  action?: SectionHeaderAction;
  style?: StyleProp<ViewStyle>;
}

// EL group heading: a display-face title carrying the section, with a quiet
// eyebrow count or a text action opposite it. Both the title and the eyebrow are
// display-face tokens rendering translated copy, so both merge the
// useDisplayFont() override for non-Latin interface languages.
export function SectionHeader({ title, eyebrow, action, style }: SectionHeaderProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();

  return (
    <View style={[styles.row, style]}>
      <Text
        style={[typography.sectionHeading, displayFont.bold, { color: colors.primaryText }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {eyebrow ? (
        // secondaryText, not textTertiary: eyebrow labels are text and must clear 4.5:1.
        <Text
          style={[
            typography.eyebrow,
            displayFont.regular,
            styles.trailing,
            { color: colors.secondaryText },
          ]}
        >
          {eyebrow}
        </Text>
      ) : action ? (
        <PressableScale
          haptic="selection"
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.trailing}
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
  trailing: {
    marginLeft: spacing.md,
  },
});
