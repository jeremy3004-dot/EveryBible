import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../../design/system';
import { lightHaptic, mediumHaptic, selectionHaptic } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The EL curve, resolved once rather than per press.
const pressEasing = Easing.bezier(...motion.easing);

export type HapticFeedback = 'light' | 'medium' | 'selection';

/**
 * How a press reads. `scale` is the historical squeeze, kept as the default so
 * existing call sites do not shift. `translate` is the EL press: the surface
 * settles 1pt down the page and nothing changes size — the only press effect
 * paper cards and rows are allowed, because scaling a bordered panel visibly
 * distorts its hairline.
 */
export type PressEffect = 'scale' | 'translate';

const PRESS_TRANSLATE_Y = 1;

const HAPTIC_HANDLERS: Record<HapticFeedback, () => void> = {
  light: lightHaptic,
  medium: mediumHaptic,
  selection: selectionHaptic,
};

// The single press physics for the whole app: a subtle scale to 0.96 on press,
// spring-interruptible, disabled under reduced motion. Every interactive
// primitive builds on this so the whole app shares one tactile feel.
export interface PressableScaleProps extends PressableProps {
  children?: ReactNode;
  /** Pressed scale target. Clamped to a minimum of 0.96 — never punchier. */
  scaleTo?: number;
  /** Press physics. Defaults to `scale`; cards and rows pass `translate`. */
  pressEffect?: PressEffect;
  /** Fire a haptic on press-in. Omit for none. */
  haptic?: HapticFeedback;
}

export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  {
    children,
    scaleTo = 0.96,
    pressEffect = 'scale',
    haptic,
    onPress,
    onPressIn,
    onPressOut,
    accessibilityRole,
    disabled,
    style,
    ...rest
  },
  ref
) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const target = Math.max(0.96, scaleTo);
  const translates = pressEffect === 'translate';

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return { transform: [] };
    }
    if (translates) {
      return { transform: [{ translateY: pressed.value * PRESS_TRANSLATE_Y }] };
    }
    return { transform: [{ scale: 1 - pressed.value * (1 - target) }] };
  });

  const press = (to: number) =>
    translates
      ? withTiming(to, { duration: motion.duration.fast, easing: pressEasing })
      : withSpring(to, motion.spring);

  const handlePressIn = (event: GestureResponderEvent) => {
    pressed.value = press(1);
    if (haptic && !disabled) {
      HAPTIC_HANDLERS[haptic]();
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    pressed.value = press(0);
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // Anything that responds to a tap is a button unless the caller says
      // otherwise, so a new call site cannot ship an untyped control by
      // forgetting the prop. Every existing call site already passes one.
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
