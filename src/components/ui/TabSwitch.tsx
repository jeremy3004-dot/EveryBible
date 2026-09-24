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
import { CONTROL_LABEL_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import { useLargeText } from '../../hooks/useLargeText';
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
  const { isLargeText } = useLargeText();
  // Equal thirds of a row hold one short word at accessibility sizes, so a
  // full-width switch stacks its segments instead (the HIG's advice for
  // horizontal controls at AX sizes). A hugging switch stays a row: its segments
  // are as wide as their labels, which wrap between words.
  const stacked = fullWidth && isLargeText;
  const axis = stacked ? 'y' : 'x';
  const metrics = SIZE_METRICS[size];
  const segmentHitSlop = {
    top: Math.max(0, Math.round((layout.minTouchTarget - SIZE_HEIGHT[size]) / 2)),
    bottom: Math.max(0, Math.round((layout.minTouchTarget - SIZE_HEIGHT[size]) / 2)),
    left: 0,
    right: 0,
  } as const;

  // Segment geometry is only known after layout, so the thumb is parked at zero
  // size until then — which also keeps it invisible on the very first frame.
  // Each segment's extent along the switch's axis: widths in a row, heights once
  // stacked. Measurements from the other axis are discarded, not reused.
  const [measured, setMeasured] = useState<{ axis: 'x' | 'y'; sizes: number[] }>({
    axis,
    sizes: [],
  });
  const sizes = measured.axis === axis ? measured.sizes : [];
  const selectedIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.key === value)
  );

  const handleLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      const extent = axis === 'y' ? height : width;
      setMeasured((current) => {
        const base = current.axis === axis ? current.sizes : [];
        if (current.axis === axis && base[index] === extent) {
          return current;
        }
        const next = [...base];
        next[index] = extent;
        return { axis, sizes: next };
      });
    },
    [axis]
  );

  const isMeasured = sizes.length >= segments.length && sizes.every((extent) => extent > 0);
  const offset = sizes.slice(0, selectedIndex).reduce((total, extent) => total + extent, 0);
  const thumbSize = sizes[selectedIndex] ?? 0;

  const thumbStyle = useAnimatedStyle(() => {
    const duration = reduceMotion ? 0 : motion.duration.base;
    const opacity = withTiming(isMeasured ? 1 : 0, { duration, easing: switchEasing });
    const moved = withTiming(offset, { duration, easing: switchEasing });
    return stacked
      ? { opacity, height: thumbSize, transform: [{ translateY: moved }] }
      : { opacity, width: thumbSize, transform: [{ translateX: moved }] };
  }, [isMeasured, offset, reduceMotion, stacked, thumbSize]);

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
        stacked && styles.trackStacked,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          stacked
            ? { top: TRACK_PADDING, left: TRACK_PADDING, right: TRACK_PADDING }
            : { top: TRACK_PADDING, bottom: TRACK_PADDING, left: TRACK_PADDING },
          {
            backgroundColor: colors.cardBackground,
            // The thumb is the only mark of which segment is selected, and its
            // fill is ~1.2:1 on the muted track, so its outline carries the 3:1.
            borderColor: colors.controlBorder,
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
              stacked ? styles.segmentStacked : fullWidth && styles.segmentFlex,
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
            {/* Two lines, not one: an equal-width third of the row holds about
                eight characters at accessibility sizes, so "Foundations" became
                "Found…". The thumb is inset top/bottom, so it grows with the row.
                The cap keeps a single word narrower than its segment, so iOS
                never breaks one mid-word ("We/ek"); a stacked segment has the
                full row and no line limit. */}
            <Text
              numberOfLines={stacked ? undefined : 2}
              maxFontSizeMultiplier={CONTROL_LABEL_MAX_FONT_SCALE}
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
  // Hugs its labels, but never wider than its container: at accessibility text
  // sizes the segments narrow and their labels wrap instead of running off-card.
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    alignItems: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: TRACK_PADDING,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  trackStacked: {
    flexDirection: 'column',
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
    flexShrink: 1,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 6,
  },
  segmentFlex: {
    flex: 1,
    paddingHorizontal: 4,
  },
  segmentStacked: {
    alignSelf: 'stretch',
  },
  label: {
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
});
