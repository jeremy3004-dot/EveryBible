import { useCallback, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, motion, radius, shadows } from '../../design/system';
import { selectionHaptic } from '../../utils/haptics';

export interface TabSwitchSegment {
  key: string;
  label: string;
  /**
   * Optional glyph set before the label — for segments whose meaning is carried
   * by an image as much as a word (the light/dark scope switch). The label still
   * renders and still names the segment; the glyph never replaces it.
   */
  icon?: LucideIcon;
}

export type TabSwitchSize = 'sm' | 'md';

export interface TabSwitchProps {
  segments: TabSwitchSegment[];
  value: string;
  onChange: (key: string) => void;
  /** Stretch to fill the row with equal-width segments (1e's three-up switch). */
  fullWidth?: boolean;
  /** `sm` hugs its labels (1d's Foundations/Wisdom); `md` is the full-width form. */
  size?: TabSwitchSize;
  style?: StyleProp<ViewStyle>;
  /**
   * Required: a tablist with no name announces as a bare group, so the user
   * hears "tab, 1 of 3" with no idea what is being switched. Every call site
   * already passes one.
   */
  accessibilityLabel: string;
}

const TRACK_PADDING = 3;
const ICON_STROKE = 2;

// The `sm` track is ~24pt tall, well under the 44pt touch floor, and the track
// itself is only 3pt of padding — so the shortfall is reclaimed as hit slop the
// way IconButton does, rather than by growing the control.
const SIZE_HEIGHT: Record<TabSwitchSize, number> = {
  sm: 24,
  md: 30,
};

const SIZE_METRICS: Record<
  TabSwitchSize,
  { paddingVertical: number; fontSize: number; iconSize: number }
> = {
  sm: { paddingVertical: 5, fontSize: 12, iconSize: 13 },
  md: { paddingVertical: 7, fontSize: 13, iconSize: 15 },
};

const switchEasing = Easing.bezier(...motion.easing);

// EL's segmented control: an inset `muted` track with a single lit-paper thumb
// that slides between segments. The thumb is one absolutely-positioned view
// rather than a per-segment background, so the selection reads as one object
// moving instead of two fills crossfading.
export function TabSwitch({
  segments,
  value,
  onChange,
  fullWidth = false,
  size = 'md',
  style,
  accessibilityLabel,
}: TabSwitchProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const metrics = SIZE_METRICS[size];
  const segmentHitSlop = {
    top: Math.max(0, Math.round((layout.minTouchTarget - SIZE_HEIGHT[size]) / 2)),
    bottom: Math.max(0, Math.round((layout.minTouchTarget - SIZE_HEIGHT[size]) / 2)),
    left: 0,
    right: 0,
  } as const;

  // Segment geometry is only known after layout, so the thumb is parked at zero
  // width until then — which also keeps it invisible on the very first frame.
  const [widths, setWidths] = useState<number[]>([]);
  const selectedIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.key === value)
  );

  const handleLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setWidths((current) => {
      if (current[index] === width) {
        return current;
      }
      const next = [...current];
      next[index] = width;
      return next;
    });
  }, []);

  const measured = widths.length >= segments.length && widths.every((width) => width > 0);
  const offset = widths.slice(0, selectedIndex).reduce((total, width) => total + width, 0);
  const thumbWidth = widths[selectedIndex] ?? 0;

  const thumbStyle = useAnimatedStyle(() => {
    const duration = reduceMotion ? 0 : motion.duration.base;
    return {
      opacity: withTiming(measured ? 1 : 0, { duration, easing: switchEasing }),
      width: thumbWidth,
      transform: [{ translateX: withTiming(offset, { duration, easing: switchEasing }) }],
    };
  }, [measured, offset, reduceMotion, thumbWidth]);

  const handlePress = (key: string) => {
    if (key === value) {
      return;
    }
    selectionHaptic();
    onChange(key);
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: colors.muted, borderColor: colors.borderStrong },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            top: TRACK_PADDING,
            bottom: TRACK_PADDING,
            left: TRACK_PADDING,
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
          },
          shadows.card,
          thumbStyle,
        ]}
      />
      {segments.map((segment, index) => {
        const selected = segment.key === value;
        const SegmentIcon = segment.icon;
        const contentColor = selected ? colors.primaryText : colors.secondaryText;
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={segment.label}
            hitSlop={segmentHitSlop}
            onPress={() => handlePress(segment.key)}
            onLayout={(event) => handleLayout(index, event)}
            style={[
              styles.segment,
              { paddingVertical: metrics.paddingVertical },
              fullWidth && styles.segmentFlex,
            ]}
          >
            {SegmentIcon ? (
              <SegmentIcon
                size={metrics.iconSize}
                color={contentColor}
                strokeWidth={ICON_STROKE}
                style={styles.icon}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  fontSize: metrics.fontSize,
                  color: selected ? colors.primaryText : colors.secondaryText,
                },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: TRACK_PADDING,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  thumb: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 6,
  },
  segmentFlex: {
    flex: 1,
    paddingHorizontal: 4,
  },
  label: {
    fontWeight: '600',
  },
});
