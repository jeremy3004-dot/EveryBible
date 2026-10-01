import { StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSkeletonOpacity } from './useSkeletonOpacity';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  color?: string;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  color,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSkeletonOpacity();

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: color ?? colors.cardBorder,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {},
});
