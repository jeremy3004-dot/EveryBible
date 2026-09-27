import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { motion } from '../../../design/system';
import { HIGHLIGHT_CHECK_INK, PRESSED_SCALE } from './annotationActionSheetModel';

export const COLOR_DOT_SIZE = 42;
// An applied colour stands a little proud of the others rather than gaining a ring.
const APPLIED_SCALE = 1.12;
/** How far an applied dot reaches past its resting edge; the row keeps this clear. */
export const COLOR_DOT_GROWTH = Math.ceil((COLOR_DOT_SIZE * (APPLIED_SCALE - 1)) / 2);

interface ColorDotProps {
  color: string;
  label: string;
  isActive: boolean;
  canAnnotate: boolean;
  onPress: () => void;
}

/**
 * One highlight colour. An applied colour springs slightly larger and its check
 * fades in; tapping it again removes the highlight. Reduced motion sets both at once.
 */
export function ColorDot({ color, label, isActive, canAnnotate, onPress }: ColorDotProps) {
  const reduceMotion = useReducedMotion();
  const targetScale = isActive ? APPLIED_SCALE : 1;
  const targetCheckOpacity = isActive ? 1 : 0;
  // Starts at rest so an applied colour visibly grows as the sheet opens.
  const scale = useSharedValue(reduceMotion ? targetScale : 1);
  const checkOpacity = useSharedValue(reduceMotion ? targetCheckOpacity : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = targetScale;
      checkOpacity.value = targetCheckOpacity;
      return;
    }
    if (scale.value !== targetScale) {
      scale.value = withSpring(targetScale, motion.spring);
    }
    if (checkOpacity.value !== targetCheckOpacity) {
      checkOpacity.value = withTiming(targetCheckOpacity, { duration: motion.duration.base });
    }
  }, [checkOpacity, reduceMotion, scale, targetCheckOpacity, targetScale]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: checkOpacity.value }));

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive, disabled: !canAnnotate }}
      hitSlop={6}
      disabled={!canAnnotate}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: canAnnotate ? 1 : 0.46,
        transform: [{ scale: pressed && canAnnotate ? PRESSED_SCALE : 1 }],
      })}
    >
      <Animated.View style={[styles.circle, { backgroundColor: color }, circleStyle]}>
        {isActive ? (
          <Animated.View style={checkStyle} pointerEvents="none">
            <Ionicons name="checkmark" size={20} color={HIGHLIGHT_CHECK_INK} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: COLOR_DOT_SIZE,
    height: COLOR_DOT_SIZE,
    borderRadius: COLOR_DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
