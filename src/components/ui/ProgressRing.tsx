import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from '../../design/system';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Reanimated-driven SVG ring. Animating strokeDashoffset on the UI thread avoids
// the per-position React re-renders a JS-driven ring would cause.
export function ProgressRing({
  progress,
  size = 20,
  strokeWidth,
  color,
  trackColor,
  children,
}: ProgressRingProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const stroke = strokeWidth ?? Math.max(2, Math.round(size * 0.14));
  const innerRadius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * innerRadius;
  const value = useSharedValue(clamp01(progress));

  useEffect(() => {
    const next = clamp01(progress);
    value.value = reduceMotion ? next : withTiming(next, { duration: motion.duration.slow });
  }, [progress, reduceMotion, value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - value.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          stroke={trackColor ?? colors.borderStrong}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          stroke={color ?? colors.accentPrimary}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
