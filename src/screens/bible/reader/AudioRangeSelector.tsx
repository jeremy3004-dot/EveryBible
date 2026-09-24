import { useCallback, useMemo, useState } from 'react';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { PanResponder, View } from 'react-native';
import { formatClockTime } from '../ReaderAudioPositionParts';
import { AUDIO_PORTION_HANDLE_WIDTH, AUDIO_PORTION_A11Y_STEP_MS } from './readerConstants';
import { styles } from './readerStyles';

export interface AudioRangeSelectorProps {
  durationMs: number;
  startMs: number;
  endMs: number;
  minRangeMs: number;
  previewPositionMs: number;
  trackColor: string;
  selectionColor: string;
  waveColor: string;
  selectedWaveColor: string;
  playedWaveColor: string;
  handleColor: string;
  handleGripColor: string;
  onStartChange: (nextStartMs: number) => void;
  onEndChange: (nextEndMs: number) => void;
  startLabel: string;
  endLabel: string;
}

export function AudioRangeSelector({
  durationMs,
  startMs,
  endMs,
  minRangeMs,
  previewPositionMs,
  trackColor,
  selectionColor,
  waveColor,
  selectedWaveColor,
  playedWaveColor,
  handleColor,
  handleGripColor,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel,
}: AudioRangeSelectorProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const waveformSamples = useMemo(
    () =>
      Array.from({ length: 44 }, (_, index) => {
        const harmonic = Math.sin((index + 1) * 0.9);
        const pulse = Math.sin((index + 1) * 0.33);
        const normalized = 0.25 + Math.abs(harmonic) * 0.5 + Math.abs(pulse) * 0.25;
        return 8 + Math.round(normalized * 34);
      }),
    []
  );

  const safeDurationMs = Math.max(durationMs, minRangeMs);
  const pxPerMs = trackWidth > 0 ? trackWidth / safeDurationMs : 0;
  const minGapPx = pxPerMs * minRangeMs;
  const clampedStartMs = Math.max(0, Math.min(startMs, safeDurationMs));
  const clampedEndMs = Math.max(clampedStartMs, Math.min(endMs, safeDurationMs));
  const startPx = pxPerMs * clampedStartMs;
  const endPx = pxPerMs * clampedEndMs;
  const previewPx = pxPerMs * Math.max(0, Math.min(previewPositionMs, safeDurationMs));

  const pxToMs = useCallback(
    (positionPx: number) => {
      if (trackWidth <= 0 || safeDurationMs <= 0) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(safeDurationMs, Math.round((positionPx / trackWidth) * safeDurationMs))
      );
    },
    [safeDurationMs, trackWidth]
  );

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const startHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gestureState) => {
          const maxStartPx = Math.max(endPx - minGapPx, 0);
          const nextStartPx = Math.max(0, Math.min(maxStartPx, startPx + gestureState.dx));
          onStartChange(pxToMs(nextStartPx));
        },
      }),
    [endPx, minGapPx, onStartChange, pxToMs, startPx]
  );

  const endHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gestureState) => {
          const minEndPx = Math.min(startPx + minGapPx, trackWidth);
          const nextEndPx = Math.max(minEndPx, Math.min(trackWidth, endPx + gestureState.dx));
          onEndChange(pxToMs(nextEndPx));
        },
      }),
    [endPx, minGapPx, onEndChange, pxToMs, startPx, trackWidth]
  );

  const isPreviewWithinSelection =
    previewPositionMs >= clampedStartMs && previewPositionMs <= clampedEndMs;

  // The handles are drag-only; as adjustable elements a screen-reader user can
  // move them with swipe up/down. The seek handlers clamp to the valid range.
  const handleA11yActions = [{ name: 'increment' as const }, { name: 'decrement' as const }];
  const onStartA11yAction = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    onStartChange(clampedStartMs + direction * AUDIO_PORTION_A11Y_STEP_MS);
  };
  const onEndA11yAction = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    onEndChange(clampedEndMs + direction * AUDIO_PORTION_A11Y_STEP_MS);
  };

  return (
    <View style={styles.audioPortionRangeSelector} onLayout={onTrackLayout}>
      <View style={[styles.audioPortionRangeTrack, { backgroundColor: trackColor }]} />
      <View
        style={[
          styles.audioPortionRangeSelection,
          {
            left: startPx,
            width: Math.max(endPx - startPx, 0),
            backgroundColor: selectionColor,
          },
        ]}
      />

      <View style={styles.audioPortionWaveRow}>
        {waveformSamples.map((sample, index) => {
          const segmentCenter = trackWidth * (index / Math.max(waveformSamples.length - 1, 1));
          const isSelected = segmentCenter >= startPx && segmentCenter <= endPx;
          const isPlayed =
            isPreviewWithinSelection && segmentCenter >= startPx && segmentCenter <= previewPx;

          return (
            <View
              key={`wave-${index}`}
              style={[
                styles.audioPortionWaveBar,
                {
                  height: sample,
                  backgroundColor: isPlayed
                    ? playedWaveColor
                    : isSelected
                      ? selectedWaveColor
                      : waveColor,
                },
              ]}
            />
          );
        })}
      </View>

      {isPreviewWithinSelection ? (
        <View
          pointerEvents="none"
          style={[
            styles.audioPortionPreviewNeedle,
            { left: previewPx, backgroundColor: playedWaveColor },
          ]}
        />
      ) : null}

      <View
        style={[
          styles.audioPortionHandle,
          styles.audioPortionHandleStart,
          {
            left: startPx - AUDIO_PORTION_HANDLE_WIDTH / 2,
            backgroundColor: handleColor,
          },
        ]}
        hitSlop={{ left: 12, right: 12 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={startLabel}
        accessibilityValue={{ text: formatClockTime(clampedStartMs) }}
        accessibilityActions={handleA11yActions}
        onAccessibilityAction={onStartA11yAction}
        {...startHandleResponder.panHandlers}
      >
        <View style={[styles.audioPortionHandleGrip, { backgroundColor: handleGripColor }]} />
      </View>

      <View
        style={[
          styles.audioPortionHandle,
          styles.audioPortionHandleEnd,
          {
            left: endPx - AUDIO_PORTION_HANDLE_WIDTH / 2,
            backgroundColor: handleColor,
          },
        ]}
        hitSlop={{ left: 12, right: 12 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={endLabel}
        accessibilityValue={{ text: formatClockTime(clampedEndMs) }}
        accessibilityActions={handleA11yActions}
        onAccessibilityAction={onEndA11yAction}
        {...endHandleResponder.panHandlers}
      >
        <View style={[styles.audioPortionHandleGrip, { backgroundColor: handleGripColor }]} />
      </View>
    </View>
  );
}
