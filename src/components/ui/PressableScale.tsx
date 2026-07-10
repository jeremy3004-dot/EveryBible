import { forwardRef, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '../../design/system';
import { lightHaptic, mediumHaptic, selectionHaptic } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticFeedback = 'light' | 'medium' | 'selection';

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
  /** Fire a haptic on press-in. Omit for none. */
  haptic?: HapticFeedback;
}

export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, scaleTo = 0.96, haptic, onPressIn, onPressOut, disabled, style, ...rest },
  ref
) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const target = Math.max(0.96, scaleTo);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = reduceMotion ? 1 : 1 - pressed.value * (1 - target);
    return { transform: [{ scale }] };
  });

  const handlePressIn = (event: GestureResponderEvent) => {
    pressed.value = withSpring(1, motion.spring);
    if (haptic && !disabled) {
      HAPTIC_HANDLERS[haptic]();
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    pressed.value = withSpring(0, motion.spring);
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
