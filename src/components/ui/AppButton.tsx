import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, motion, radius, spacing, typography } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type AppButtonSize = 'lg' | 'md';

export interface AppButtonProps {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  haptic?: HapticFeedback;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const SIZE_HEIGHT: Record<AppButtonSize, number> = {
  lg: 52,
  md: 44,
};

// Once the spinner appears it stays for at least this long, so a fast-resolving
// action never flashes it for a single frame.
const MIN_SPINNER_MS = 400;

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  leadingIcon,
  fullWidth = true,
  haptic = 'medium',
  style,
  accessibilityLabel,
}: AppButtonProps) {
  const { colors } = useTheme();
  // 0 = label shown, 1 = spinner shown. Crossfade is opacity-only, so it runs
  // even under reduced motion.
  const spinner = useSharedValue(loading ? 1 : 0);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      shownAt.current = Date.now();
      spinner.value = withTiming(1, { duration: motion.duration.base });
      return;
    }
    const elapsed = shownAt.current ? Date.now() - shownAt.current : MIN_SPINNER_MS;
    const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);
    spinner.value = withDelay(remaining, withTiming(0, { duration: motion.duration.base }));
  }, [loading, spinner]);

  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - spinner.value }));
  const spinnerStyle = useAnimatedStyle(() => ({ opacity: spinner.value }));

  const backgroundColor: string =
    variant === 'primary'
      ? colors.accentPrimary
      : variant === 'secondary'
        ? colors.accentSoft
        : variant === 'destructive'
          ? colors.error
          : 'transparent';

  const contentColor: string =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'destructive'
        ? '#FFFFFF'
        : colors.accentPrimary;

  const isInteractive = !disabled && !loading;

  return (
    <PressableScale
      haptic={isInteractive ? haptic : undefined}
      disabled={!isInteractive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        { height: SIZE_HEIGHT[size], backgroundColor },
        fullWidth && styles.fullWidth,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      <Animated.View style={[styles.content, labelStyle]}>
        {leadingIcon ? (
          <Ionicons name={leadingIcon} size={18} color={contentColor} style={styles.icon} />
        ) : null}
        <Text style={[typography.button, { color: contentColor }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.spinner, spinnerStyle]} pointerEvents="none">
        <ActivityIndicator color={contentColor} />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: layout.minTouchTarget,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.45,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
