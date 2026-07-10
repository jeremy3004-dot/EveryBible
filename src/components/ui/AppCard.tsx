import { type ReactNode } from 'react';
import {
  type GestureResponderEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, shadows } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

export interface AppCardProps {
  children: ReactNode;
  /** Wrap in PressableScale so the whole card responds to taps. */
  pressable?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  /** Lift the card with the floating shadow. Rare — for surfaces that truly float. */
  elevated?: boolean;
  padding?: number;
  haptic?: HapticFeedback;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// Resting surface: lighter than the page background, separated by a hairline
// alpha border — hierarchy via tone, not shadow. Pass `pressable` for tap
// affordance and `elevated` only when the card genuinely floats.
export function AppCard({
  children,
  pressable = false,
  onPress,
  elevated = false,
  padding = layout.cardPadding,
  haptic,
  style,
  accessibilityLabel,
}: AppCardProps) {
  const { colors } = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: colors.cardBackground,
      borderColor: colors.cardBorder,
      padding,
    },
    elevated && shadows.floating,
    style,
  ];

  if (pressable || onPress) {
    return (
      <PressableScale
        onPress={onPress}
        haptic={haptic}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={cardStyle}
      >
        {children}
      </PressableScale>
    );
  }

  return (
    <View style={cardStyle} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
