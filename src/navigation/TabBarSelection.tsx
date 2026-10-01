import React, { useLayoutEffect, useRef, useState } from 'react';
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
  // Where the pill rests is plain layout, derived on every render from (selectedIndex,
  // measured width): its `start` edge. Nothing animated can strand it on the wrong tab.
  // The spring only drives a transient offset, in points, that starts at the distance
  // just travelled and settles at 0. An earlier version animated the resting position
  // itself through shared values; on Android the pill is unmounted while the reader
  // hides the bar (the capsule measures 0 wide) and re-attached on show, and a style
  // attached after the spring had finished kept the stale first-tab offset.
  const offset = useSharedValue(0);
  const previousIndex = useRef(selectedIndex);
  const itemWidth = (width - TAB_BAR_CAPSULE_ROW_INSET * 2) / count;
  const direction = I18nManager.isRTL ? -1 : 1;
  // A width-only change re-runs this but leaves early: the index has not moved.
  useLayoutEffect(() => {
    const from = previousIndex.current;
    previousIndex.current = selectedIndex;
    if (from === selectedIndex) return;
    if (reduceMotion || width <= 0) {
      offset.value = 0;
      return;
    }
    offset.value = (from - selectedIndex) * itemWidth * direction;
    offset.value = withSpring(0, motion.spring);
  }, [offset, selectedIndex, reduceMotion, width, itemWidth, direction]);
  // A number, never a percent string: on the old architecture (this app) Android's
  // transform parser only accepts numbers, and a '%' translate crashes view creation.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: itemWidth,
              backgroundColor: color,
              start: TAB_BAR_CAPSULE_ROW_INSET + selectedIndex * itemWidth,
            },
            animatedStyle,
          ]}
        />
      )}
    </View>
  );
}

// 52pt tall inside the 64pt capsule's 6pt padding, radius 26.
const TAB_BAR_SELECTION_PILL_RADIUS = 26;

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: TAB_BAR_CAPSULE_ROW_INSET,
    bottom: TAB_BAR_CAPSULE_ROW_INSET,
    borderRadius: TAB_BAR_SELECTION_PILL_RADIUS,
  },
});
