import { useEffect } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, radius } from '../../design/system';

export interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  /** Render the fill as a two-stop accent gradient. */
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Rounded pill track with an animated accent fill. One progress recipe for
// plans, downloads, and reading goals.
export function ProgressBar({
  progress,
  height = 6,
  trackColor,
  fillColor,
  gradient = false,
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(clamp01(progress));

  useEffect(() => {
    const next = clamp01(progress);
    value.value = reduceMotion ? next : withTiming(next, { duration: motion.duration.slow });
  }, [progress, reduceMotion, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${value.value * 100}%`,
  }));

  const resolvedFill = fillColor ?? colors.accentPrimary;

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: trackColor ?? colors.borderStrong },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamp01(progress) * 100), min: 0, max: 100 }}
    >
      <Animated.View style={[styles.fill, { height }, fillStyle]}>
        {gradient ? (
          <LinearGradient
            colors={[colors.accentSecondary, resolvedFill]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientFill}
          />
        ) : (
          <View style={[styles.solidFill, { backgroundColor: resolvedFill }]} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  gradientFill: {
    flex: 1,
  },
  solidFill: {
    flex: 1,
  },
});
