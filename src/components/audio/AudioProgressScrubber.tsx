import { useMemo, useState } from 'react';
import type {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { PanResponder, StyleSheet, View } from 'react-native';
import { formatPlaybackTime } from '../../utils';
import { useLatestCallback } from './playbackControlsParts/useLatestCallback';

const SEEK_STEP_MS = 10000;

interface AudioProgressScrubberProps {
  position: number;
  duration: number;
  onSeek: (positionMs: number) => void;
  trackColor: string;
  fillColor: string;
  containerStyle?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
  fillStyle?: StyleProp<ViewStyle>;
  /** Names the slider; without it VoiceOver announces only the bare time value. */
  accessibilityLabel?: string;
  /**
   * The round dot on the line: always there (the default), or only under a finger
   * while dragging, for a quieter line.
   */
  thumb?: 'always' | 'whileScrubbing';
}

function clampProgressPosition(value: number, duration: number): number {
  if (duration <= 0 || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(duration, value));
}

export function AudioProgressScrubber({
  position,
  duration,
  onSeek,
  trackColor,
  fillColor,
  containerStyle,
  trackStyle,
  fillStyle,
  accessibilityLabel,
  thumb = 'always',
}: AudioProgressScrubberProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draftPosition, setDraftPosition] = useState(0);

  const displayedPosition = isScrubbing ? draftPosition : clampProgressPosition(position, duration);
  const progress = duration > 0 ? (displayedPosition / duration) * 100 : 0;

  const resolvePosition = (locationX: number) => {
    if (duration <= 0 || trackWidth <= 0) {
      return 0;
    }

    return clampProgressPosition((locationX / trackWidth) * duration, duration);
  };

  const canScrub = useLatestCallback(() => duration > 0 && trackWidth > 0);
  const previewPosition = useLatestCallback((event: GestureResponderEvent) => {
    if (!canScrub()) return;
    const nextPosition = resolvePosition(event.nativeEvent.locationX);
    setIsScrubbing(true);
    setDraftPosition(nextPosition);
    return nextPosition;
  });

  const commitPosition = useLatestCallback((event: GestureResponderEvent) => {
    setIsScrubbing(false);
    if (!canScrub()) return;
    onSeek(resolvePosition(event.nativeEvent.locationX));
  });

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const seekBy = (deltaMs: number) => {
    if (duration <= 0) {
      return;
    }

    onSeek(clampProgressPosition(clampProgressPosition(position, duration) + deltaMs, duration));
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      seekBy(SEEK_STEP_MS);
    } else if (event.nativeEvent.actionName === 'decrement') {
      seekBy(-SEEK_STEP_MS);
    }
  };

  // Keep RN's gesture state alive while previews and playback ticks re-render us.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: canScrub,
        onMoveShouldSetPanResponder: canScrub,
        onPanResponderGrant: previewPosition,
        onPanResponderMove: previewPosition,
        onPanResponderRelease: commitPosition,
        onPanResponderTerminate: () => setIsScrubbing(false),
        onPanResponderTerminationRequest: () => false,
      }),
    [canScrub, previewPosition, commitPosition]
  );

  return (
    <View
      style={[styles.container, containerStyle]}
      onLayout={handleLayout}
      hitSlop={{ top: 12, bottom: 12 }}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled: duration <= 0 }}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: Math.max(0, Math.floor(duration / 1000)),
        now: Math.floor(displayedPosition / 1000),
        text: `${formatPlaybackTime(displayedPosition)} / ${formatPlaybackTime(duration)}`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
      {...panResponder.panHandlers}
    >
      <View
        pointerEvents="none"
        style={[styles.track, { backgroundColor: trackColor }, trackStyle]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${progress}%`,
              backgroundColor: fillColor,
            },
            fillStyle,
          ]}
        />
      </View>
      {thumb === 'always' || isScrubbing ? (
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${progress}%`,
              width: isScrubbing ? 16 : 12,
              height: isScrubbing ? 16 : 12,
              marginLeft: isScrubbing ? -8 : -6,
              marginTop: isScrubbing ? -8 : -6,
              backgroundColor: fillColor,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    minHeight: 32,
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    borderRadius: 999,
  },
});
