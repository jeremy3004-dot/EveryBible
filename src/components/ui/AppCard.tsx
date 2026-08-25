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

// EL atlas-paper: a lit-paper panel on the vellum ground, warm hairline border,
// a whisper of shadow, and an edge light along the top so the panel reads as
// paper catching the light.
//
// The EL kit expresses that edge light as `inset 0 1.5px 0 #ffffffb3`, but this
// app runs the old React Native architecture (app.json newArchEnabled: false),
// where `boxShadow` — and therefore inset shadows — is unavailable. So it is
// drawn as a real hairline view pinned to the top edge instead, clipped to the
// card radius. Pass `pressable` for tap affordance and `elevated` only when the
// card genuinely floats.
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
  const { colors, isDark } = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: colors.cardBackground,
      borderColor: colors.cardBorder,
      padding,
    },
    elevated ? shadows.floating : shadows.card,
    style,
  ];

  // Bright on paper, barely there on ink — the EL kit drops the edge light to
  // 5% white in its dark scope.
  const edgeLight = (
    <View
      pointerEvents="none"
      style={[
        styles.edgeLight,
        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.7)' },
      ]}
    />
  );

  if (pressable || onPress) {
    return (
      <PressableScale
        onPress={onPress}
        haptic={haptic}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={cardStyle}
      >
        {edgeLight}
        {children}
      </PressableScale>
    );
  }

  return (
    <View style={cardStyle} accessibilityLabel={accessibilityLabel}>
      {edgeLight}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    // No `overflow: 'hidden'` here: on iOS it sets clipsToBounds, which masks the
    // card's own layer shadow and would silently no-op both shadows.card and the
    // `elevated` floating shadow. The edge light rounds its own corners instead.
  },
  edgeLight: {
    position: 'absolute',
    // Inset by the hairline border so the light sits inside it, not on top.
    top: 1,
    left: 1,
    right: 1,
    height: StyleSheet.hairlineWidth * 2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
