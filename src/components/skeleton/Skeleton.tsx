import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const animatedValue = useMemo(() => new Animated.Value(0), []);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    animationRef.current.start();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [animatedValue]);

  const opacity = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
      }),
    [animatedValue]
  );

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: colors.cardBorder,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {},
});
