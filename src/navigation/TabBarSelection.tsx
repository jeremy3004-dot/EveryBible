import React, { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '../design/system';
import { TAB_BAR_CAPSULE_ROW_INSET } from './tabBarCapsuleStyle';

export function TabBarSelection({
  selectedIndex,
  count,
  color,
}: {
  selectedIndex: number;
  count: number;
  color: string;
}) {
  const [width, setWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  const position = useSharedValue(selectedIndex);
  useEffect(() => {
    position.value = reduceMotion ? selectedIndex : withSpring(selectedIndex, motion.spring);
  }, [position, selectedIndex, reduceMotion]);
  const itemWidth = (width - TAB_BAR_CAPSULE_ROW_INSET * 2) / count;
  const direction = I18nManager.isRTL ? -1 : 1;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * itemWidth * direction }],
  }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          style={[styles.pill, { width: itemWidth, backgroundColor: color }, animatedStyle]}
        />
      )}
    </View>
  );
}

// 52pt tall inside the 64pt capsule's 6pt padding, radius 26.
export const TAB_BAR_SELECTION_PILL_RADIUS = 26;

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: TAB_BAR_CAPSULE_ROW_INSET,
    bottom: TAB_BAR_CAPSULE_ROW_INSET,
    start: TAB_BAR_CAPSULE_ROW_INSET,
    borderRadius: TAB_BAR_SELECTION_PILL_RADIUS,
  },
});
