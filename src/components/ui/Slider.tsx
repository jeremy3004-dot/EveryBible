import { useCallback, useEffect, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius } from '../../design/system';

export interface SliderProps {
  /** 0..1 */
  value: number;
  /** Called while dragging, once per whole percent the value moves. */
  onValueChange: (value: number) => void;
  /** Called with the final value when a drag, tap or screen-reader step ends. */
  onSlidingComplete?: (value: number) => void;
  /** Required: a slider has no visible text of its own. */
  accessibilityLabel: string;
  /** How far one screen-reader increment or decrement moves it. Defaults to 10%. */
  accessibilityStep?: number;
  /** The spoken value. Defaults to a whole percentage ("40%"). */
  formatValueText?: (value: number) => string;
  disabled?: boolean;
  minimumTrackColor?: string;
  maximumTrackColor?: string;
  thumbColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const THUMB_SIZE = 22;
const TRACK_HEIGHT = 4;

const clampUnit = (value: number) => {
  'worklet';
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
};

/** Snaps to the 1% step the slider reports in. */
const toStep = (value: number) => Math.round(clampUnit(value) * 100) / 100;

const defaultValueText = (value: number) => `${Math.round(value * 100)}%`;

// A horizontal 0–1 slider: drag the thumb or tap the track, in 1% steps. The
// thumb follows the finger on the UI thread; the value crosses to JS only when
// it moves by a whole percent, so a drag does not flood the caller. Screen
// readers get one adjustable element with a spoken value and increment and
// decrement actions.
export function Slider({
  value,
  onValueChange,
  onSlidingComplete,
  accessibilityLabel,
  accessibilityStep = 0.1,
  formatValueText = defaultValueText,
  disabled = false,
  minimumTrackColor,
  maximumTrackColor,
  thumbColor,
  style,
  testID,
}: SliderProps) {
  const { colors } = useTheme();
  const steppedValue = toStep(value);
  const width = useSharedValue(0);
  const position = useSharedValue(steppedValue);
  const isDragging = useSharedValue(false);
  const lastReported = useRef(steppedValue);

  useEffect(() => {
    lastReported.current = steppedValue;
    if (!isDragging.value) position.value = steppedValue;
  }, [isDragging, position, steppedValue]);

  const report = useCallback(
    (next: number) => {
      const stepped = toStep(next);
      if (stepped === lastReported.current) return;
      lastReported.current = stepped;
      onValueChange(stepped);
    },
    [onValueChange]
  );

  const complete = useCallback(
    (next: number) => {
      report(next);
      onSlidingComplete?.(toStep(next));
    },
    [onSlidingComplete, report]
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Horizontal intent only, so a vertical swipe still scrolls the sheet around it.
    .activeOffsetX([-4, 4])
    .failOffsetY([-10, 10])
    .onStart(() => {
      'worklet';
      isDragging.value = true;
    })
    .onUpdate((event) => {
      'worklet';
      if (width.value <= 0) return;
      const next = clampUnit(event.x / width.value);
      position.value = next;
      runOnJS(report)(next);
    })
    .onEnd((event) => {
      'worklet';
      if (width.value > 0) {
        position.value = clampUnit(event.x / width.value);
      }
      runOnJS(complete)(position.value);
    })
    .onFinalize(() => {
      'worklet';
      isDragging.value = false;
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((event) => {
      'worklet';
      if (width.value <= 0) return;
      const next = clampUnit(event.x / width.value);
      position.value = next;
      runOnJS(complete)(next);
    });

  const fillStyle = useAnimatedStyle(() => ({ width: position.value * width.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * width.value - THUMB_SIZE / 2 }],
  }));

  const stepBy = (delta: number) => {
    const next = toStep(steppedValue + delta);
    if (next === steppedValue) return;
    position.value = next;
    complete(next);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    if (event.nativeEvent.actionName === 'increment') stepBy(accessibilityStep);
    else if (event.nativeEvent.actionName === 'decrement') stepBy(-accessibilityStep);
  };

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        testID={testID}
        style={[styles.container, disabled ? styles.disabled : null, style]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(steppedValue * 100),
          text: formatValueText(steppedValue),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View
          style={[styles.track, { backgroundColor: maximumTrackColor ?? colors.muted }]}
          onLayout={handleLayout}
        >
          <Animated.View
            style={[
              styles.fill,
              { backgroundColor: minimumTrackColor ?? colors.accentPrimary },
              fillStyle,
            ]}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              backgroundColor: thumbColor ?? colors.cardBackground,
              borderColor: minimumTrackColor ?? colors.accentPrimary,
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: layout.minTouchTarget,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
