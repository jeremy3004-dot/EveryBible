/**
 * Leaf components that consume the live audio position for the Bible reader.
 *
 * `audioStore.setPosition` fires roughly every 250ms for the whole length of a
 * chapter, so anything that subscribes to it re-renders ~4x/second. Keeping every
 * consumer of `useAudioPosition` inside these small leaves means BibleReaderScreen
 * itself never subscribes: it re-renders only when the resolved follow-along verse
 * actually changes (≈ once per several seconds), not once per tick.
 */
import type { MutableRefObject, ReactElement, ReactNode, Ref } from 'react';
import { memo, useEffect, useImperativeHandle, useRef } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import { AudioProgressScrubber } from '../../components/audio/AudioProgressScrubber';
import type { Verse } from '../../types';
import { getEstimatedFollowAlongVerse, hasAudioPositionRestarted } from './bibleReaderModel';
import { useAudioPosition } from '../../hooks/useAudioPosition';

export interface ReaderAudioTrack {
  translationId: string;
  bookId: string;
  chapter: number;
}

export interface ReaderAudioPositionSnapshot {
  currentPosition: number;
  duration: number;
}

export interface ReaderFollowAlongPlaybackState {
  verse: number | null;
  didRestart: boolean;
}

export interface ReaderAudioPositionBridgeHandle {
  /**
   * Drops the monotonic clamp so the highlight may jump backward after an
   * explicit user seek or a preview restart.
   */
  reset: () => void;
}

export const formatClockTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

interface ReaderAudioPositionBridgeProps {
  track: ReaderAudioTrack;
  verses: Verse[];
  focusVerse?: number;
  timestamps: Record<number, number> | null;
  /** Identity of the chapter currently being played, or null when it is not this one. */
  activeTrackKey: string | null;
  /**
   * Kept in sync with the live position so the screen's async handlers (share,
   * seek, preview) can read it without subscribing to the tick.
   */
  positionRef: MutableRefObject<ReaderAudioPositionSnapshot>;
  onFollowAlongChange: (state: ReaderFollowAlongPlaybackState) => void;
  handleRef?: Ref<ReaderAudioPositionBridgeHandle>;
}

/**
 * Renders nothing. Subscribes to the position tick, resolves the follow-along
 * verse, and notifies the screen ONLY when the resolved verse (or a restart)
 * changes.
 */
export const ReaderAudioPositionBridge = memo(function ReaderAudioPositionBridge({
  track,
  verses,
  focusVerse,
  timestamps,
  activeTrackKey,
  positionRef,
  onFollowAlongChange,
  handleRef,
}: ReaderAudioPositionBridgeProps) {
  const { currentPosition, duration } = useAudioPosition(track);
  const lastVerseRef = useRef<number | null>(null);
  const previousPositionRef = useRef<number | null>(null);
  const previousTrackKeyRef = useRef<string | null>(null);
  const lastSentRef = useRef<ReaderFollowAlongPlaybackState | null>(null);

  useImperativeHandle(
    handleRef,
    () => ({
      reset: () => {
        lastVerseRef.current = null;
      },
    }),
    []
  );

  useEffect(() => {
    positionRef.current = { currentPosition, duration };

    if (previousTrackKeyRef.current !== activeTrackKey) {
      previousTrackKeyRef.current = activeTrackKey;
      previousPositionRef.current = null;
      lastVerseRef.current = null;
    }

    const didRestart =
      activeTrackKey != null &&
      hasAudioPositionRestarted({
        currentPosition,
        previousPosition: previousPositionRef.current,
        duration,
      });
    if (didRestart) {
      lastVerseRef.current = null;
    }
    previousPositionRef.current = activeTrackKey != null ? currentPosition : null;

    const rawFollowAlongVerse = getEstimatedFollowAlongVerse({
      verses,
      currentPosition,
      duration,
      fallbackVerse: focusVerse,
      timestamps,
    });

    let verse: number | null;
    if (rawFollowAlongVerse == null) {
      lastVerseRef.current = null;
      verse = null;
    } else {
      // Clamp to monotonic advancement: never let the highlight go backward.
      // This prevents flickering when interpolated position briefly overshoots
      // a verse boundary and snaps back on the next real poll.
      const last = lastVerseRef.current;
      verse = last != null && rawFollowAlongVerse < last ? last : rawFollowAlongVerse;
      lastVerseRef.current = verse;
    }

    const previous = lastSentRef.current;
    if (previous != null && previous.verse === verse && previous.didRestart === didRestart) {
      return;
    }

    const next: ReaderFollowAlongPlaybackState = { verse, didRestart };
    lastSentRef.current = next;
    onFollowAlongChange(next);
  }, [
    activeTrackKey,
    currentPosition,
    duration,
    focusVerse,
    onFollowAlongChange,
    positionRef,
    timestamps,
    verses,
  ]);

  return null;
});

interface ReaderListenProgressProps {
  track: ReaderAudioTrack;
  isCurrentAudioChapter: boolean;
  onSeek: (positionMs: number) => void;
  trackColor: string;
  fillColor: string;
  timeTextColor: string;
  containerStyle?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
  fillStyle?: StyleProp<ViewStyle>;
  timeRowStyle?: StyleProp<ViewStyle>;
  timeTextStyle?: StyleProp<TextStyle>;
  /** Rendered between the scrubber and the elapsed/remaining row. */
  children?: ReactNode;
}

/** Scrubber + elapsed/remaining labels for the listen-mode transport. */
export const ReaderListenProgress = memo(function ReaderListenProgress({
  track,
  isCurrentAudioChapter,
  onSeek,
  trackColor,
  fillColor,
  timeTextColor,
  containerStyle,
  trackStyle,
  fillStyle,
  timeRowStyle,
  timeTextStyle,
  children,
}: ReaderListenProgressProps) {
  const { currentPosition, duration } = useAudioPosition(track);
  const listenPosition = isCurrentAudioChapter ? currentPosition : 0;
  const listenDuration = isCurrentAudioChapter ? duration : 0;
  const remainingDuration = Math.max(listenDuration - listenPosition, 0);

  return (
    <>
      <AudioProgressScrubber
        position={listenPosition}
        duration={listenDuration}
        onSeek={onSeek}
        trackColor={trackColor}
        fillColor={fillColor}
        containerStyle={containerStyle}
        trackStyle={trackStyle}
        fillStyle={fillStyle}
      />

      {children}

      <View style={timeRowStyle}>
        <Text style={[timeTextStyle, { color: timeTextColor }]}>
          {formatClockTime(listenPosition)}
        </Text>
        <Text style={[timeTextStyle, { color: timeTextColor }]}>
          -{formatClockTime(remainingDuration)}
        </Text>
      </View>
    </>
  );
});

interface ReaderAudioPortionPreviewGuardProps {
  track: ReaderAudioTrack;
  endMs: number;
  onReachEnd: () => void;
}

/**
 * Renders nothing. Stops the share-portion preview once playback passes the end
 * of the selected range; mounted only while a preview is actually running.
 */
export const ReaderAudioPortionPreviewGuard = memo(function ReaderAudioPortionPreviewGuard({
  track,
  endMs,
  onReachEnd,
}: ReaderAudioPortionPreviewGuardProps) {
  const { currentPosition } = useAudioPosition(track);

  useEffect(() => {
    if (currentPosition < endMs) {
      return;
    }

    onReachEnd();
  }, [currentPosition, endMs, onReachEnd]);

  return null;
});

interface ReaderAudioPositionValueProps {
  track: ReaderAudioTrack;
  enabled: boolean;
  fallbackMs: number;
  render: (positionMs: number) => ReactElement;
}

/**
 * Hands the live position to a subtree that genuinely needs every tick (the
 * share-portion waveform) without waking the screen around it.
 */
/* eslint-disable react/prop-types */
export const ReaderAudioPositionValue = memo(function ReaderAudioPositionValue({
  track,
  enabled,
  fallbackMs,
  render,
}: ReaderAudioPositionValueProps) {
  const { currentPosition } = useAudioPosition(track);
  return render(enabled ? currentPosition : fallbackMs);
});
/* eslint-enable react/prop-types */
