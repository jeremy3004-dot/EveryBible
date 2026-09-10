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
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, motion, shadows, spacing, typography } from '../../design/system';
import { PressableScale, type HapticFeedback } from './PressableScale';

/**
 * - `primary`  accent fill, the one CTA per view.
 * - `secondary` paper strip — the icon-button surface stretched (Google sign-in).
 * - `ink`      inverted page fill, reserved for Apple sign-in.
 * - `outline`  hairline only, no fill — the "Complete" toggle.
 * - `ghost`    text only.
 * - `destructive` error fill.
 */
export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ink'
  | 'outline'
  | 'ghost'
  | 'destructive';
export type AppButtonSize = 'lg' | 'md';

export interface AppButtonProps {
  label: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  fullWidth?: boolean;
  haptic?: HapticFeedback;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// EL pills: 50pt for the primary CTA, 40pt for inline actions. The radius is
// always half the height, so both are fully rounded.
const SIZE_HEIGHT: Record<AppButtonSize, number> = {
  lg: layout.pillHeight,
  md: layout.iconButton,
};

const ICON_SIZE = 18;
const ICON_STROKE = 2;

// Once the spinner appears it stays for at least this long, so a fast-resolving
// action never flashes it for a single frame.
const MIN_SPINNER_MS = 400;

// Labels still scale with the user's text size, but stop short of the extreme
// accessibility sizes where a CTA would eat the screen.
const LABEL_MAX_FONT_SCALE = 1.6;

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
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
        ? colors.cardBackground
        : variant === 'ink'
          ? colors.primaryText
          : variant === 'destructive'
            ? colors.error
            : 'transparent';

  const contentColor: string =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'ink'
        ? colors.background
        : variant === 'secondary' || variant === 'outline'
          ? colors.primaryText
          : variant === 'destructive'
            ? '#FFFFFF'
            : colors.accentPrimary;

  const borderStyle: ViewStyle =
    variant === 'secondary'
      ? { borderWidth: 1, borderColor: colors.cardBorder }
      : variant === 'outline'
        ? { borderWidth: 1, borderColor: colors.borderStrong }
        : {};

  const height = SIZE_HEIGHT[size];
  const isInteractive = !disabled && !loading;

  return (
    <PressableScale
      haptic={isInteractive ? haptic : undefined}
      disabled={!isInteractive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={Math.max(0, Math.round((layout.minTouchTarget - height) / 2))}
      style={[
        styles.base,
        // minHeight, not height: the pill keeps its 50/40pt stature at every
        // normal text size and only grows when a wrapped label needs the room.
        { minHeight: height, borderRadius: height / 2, backgroundColor },
        borderStyle,
        variant === 'secondary' ? shadows.card : null,
        fullWidth && styles.fullWidth,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      <Animated.View style={[styles.content, labelStyle]}>
        {LeadingIcon ? (
          <LeadingIcon
            size={ICON_SIZE}
            color={contentColor}
            strokeWidth={ICON_STROKE}
            style={styles.leadingIcon}
          />
        ) : null}
        {/* `styles.base` is min-height, not a fixed height, so a long translated
            label wraps to a second line and grows the pill rather than being
            truncated. The multiplier cap keeps that growth bounded at the top
            of the Dynamic Type range. */}
        <Text
          style={[typography.bodyStrong, { color: contentColor }]}
          numberOfLines={2}
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
        >
          {label}
        </Text>
        {TrailingIcon ? (
          <TrailingIcon
            size={ICON_SIZE}
            color={contentColor}
            strokeWidth={ICON_STROKE}
            style={styles.trailingIcon}
          />
        ) : null}
      </Animated.View>
      <Animated.View style={[styles.spinner, spinnerStyle]} pointerEvents="none">
        <ActivityIndicator color={contentColor} />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    // Inert at every normal text size (the label is far shorter than the pill's
    // minHeight); it only earns its keep once a wrapped label outgrows the pill
    // and would otherwise run into the rounded edge.
    paddingVertical: spacing.xs,
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
  leadingIcon: {
    marginRight: spacing.sm,
  },
  trailingIcon: {
    marginLeft: spacing.sm,
  },
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
