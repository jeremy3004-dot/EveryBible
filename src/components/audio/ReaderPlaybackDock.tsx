import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, shadows, spacing } from '../../design/system';

interface ReaderPlaybackDockProps {
  collapseProgress: number;
  isCollapsed: boolean;
  progress: number;
  isPlaying: boolean;
  isLoading: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onPlayPause: () => void;
}

const RING_SIZE = 78;
const RING_STROKE_WIDTH = 4;
const PLAY_BUTTON_SIZE = 66;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const circumference = 2 * Math.PI * RING_RADIUS;

export const ReaderPlaybackDock = memo(function ReaderPlaybackDock({
  collapseProgress,
  isCollapsed,
  progress,
  isPlaying,
  isLoading,
  hasPreviousChapter,
  hasNextChapter,
  onPreviousChapter,
  onNextChapter,
  onPlayPause,
}: ReaderPlaybackDockProps) {
  const { colors } = useTheme();
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const strokeDashoffset = circumference - clampedProgress * circumference;

  const leftTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 10], Extrapolation.CLAMP),
      },
    ],
  }));

  const rightTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 10], Extrapolation.CLAMP),
      },
    ],
  }));

  const centerTransportAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 4], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 1.02], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bibleBackground + 'D9',
          borderColor: colors.bibleDivider + 'CC',
        },
      ]}
    >
      <Animated.View
        style={[styles.sideTransportWrap, leftTransportAnimatedStyle]}
        pointerEvents={isCollapsed ? 'none' : 'auto'}
      >
        <Pressable
          style={[
            styles.sideTransportButton,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
          onPress={onPreviousChapter}
          disabled={isCollapsed || !hasPreviousChapter}
          accessibilityRole="button"
          accessibilityLabel="Previous chapter"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={hasPreviousChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
          />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.playButtonWrap, centerTransportAnimatedStyle]}>
        <Pressable
          style={[
            styles.playButton,
            {
              backgroundColor: colors.bibleControlBackground,
              borderColor: colors.bibleElevatedSurface,
            },
          ]}
          onPress={onPlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause chapter audio' : 'Play chapter audio'}
        >
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={styles.progressRing}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          >
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.bibleDivider + 'AA'}
              strokeWidth={RING_STROKE_WIDTH}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.bibleAccent}
              strokeWidth={RING_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              fill="none"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>

          <Ionicons
            name={isLoading ? 'hourglass' : isPlaying ? 'pause' : 'play'}
            size={30}
            color={colors.bibleBackground}
            style={styles.playIcon}
          />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[styles.sideTransportWrap, rightTransportAnimatedStyle]}
        pointerEvents={isCollapsed ? 'none' : 'auto'}
      >
        <Pressable
          style={[
            styles.sideTransportButton,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
          onPress={onNextChapter}
          disabled={isCollapsed || !hasNextChapter}
          accessibilityRole="button"
          accessibilityLabel="Next chapter"
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={hasNextChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...shadows.floating,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sideTransportWrap: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideTransportButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    position: 'absolute',
  },
  playIcon: {
    marginLeft: 2,
  },
});
