import { memo, useState } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { AudioPlaybackErrorNotice } from '../../components/audio/AudioPlaybackErrorNotice';
import { spacing } from '../../design/system';
import { seekActivePlayback } from '../../hooks/audioPlayer/transportRegistry';
import { useAudioStore } from '../../stores/audioStore';
import { formatPlaybackTime } from '../../utils/time';
import { PLAYER_BAR_PROGRESS_HEIGHT } from '../readerTabBarMotion';
import type { PlayerBarPalette } from './playerBarModel';
import { usePlayerBarScrubStore } from './playerBarScrub';

const SEEK_STEP_MS = 10_000;
const SEEK_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];
// The line under a dragging finger: thick enough to see past the fingertip.
const SCRUB_LINE_HEIGHT = 6;
// The time label above the finger, and how far it may overhang the line's ends.
const SCRUB_TIME_WIDTH = 52;
const SCRUB_TIME_OVERHANG = 8;

/**
 * The bar's progress hairline. The one part of the bar that follows the playback
 * position, so the ~250ms position tick redraws this leaf and nothing else. While
 * a finger drags it (see PlayerBar) it thickens, follows the finger and names the
 * time it will land on; screen readers step it ten seconds at a time.
 */
export const PlayerBarProgressFill = memo(function PlayerBarProgressFill({
  active,
  palette,
}: {
  active: boolean;
  palette: PlayerBarPalette;
}) {
  const { t } = useTranslation();
  const { position, duration } = useAudioStore(
    useShallow((state) =>
      active && state.duration > 0
        ? {
            position: Math.max(0, Math.min(state.duration, state.currentPosition)),
            duration: state.duration,
          }
        : { position: 0, duration: 0 }
    )
  );
  const scrubFraction = usePlayerBarScrubStore((state) => state.fraction);
  const [lineWidth, setLineWidth] = useState(0);
  const seekable = duration > 0;
  const scrubbing = seekable && scrubFraction != null;
  const fraction = scrubbing ? scrubFraction : seekable ? position / duration : 0;
  const shownPosition = fraction * duration;

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? SEEK_STEP_MS : -SEEK_STEP_MS;
    void seekActivePlayback(Math.max(0, Math.min(duration, position + step)));
  };

  return (
    <View
      testID="player-bar-progress"
      onLayout={(event) => setLineWidth(event.nativeEvent.layout.width)}
      style={[
        styles.track,
        scrubbing ? styles.trackScrubbing : null,
        { backgroundColor: palette.hairline },
      ]}
      accessible={seekable}
      accessibilityElementsHidden={!seekable}
      importantForAccessibility={seekable ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={seekable ? 'adjustable' : undefined}
      accessibilityLabel={seekable ? t('readingPlans.progress') : undefined}
      accessibilityValue={
        seekable
          ? {
              min: 0,
              max: Math.floor(duration / 1000),
              now: Math.floor(position / 1000),
              text: `${formatPlaybackTime(position)} / ${formatPlaybackTime(duration)}`,
            }
          : undefined
      }
      accessibilityActions={seekable ? SEEK_ACTIONS : undefined}
      onAccessibilityAction={seekable ? handleAccessibilityAction : undefined}
    >
      <View
        testID="player-bar-progress-fill"
        style={[
          styles.fill,
          scrubbing ? styles.fillScrubbing : null,
          { width: `${fraction * 100}%`, backgroundColor: palette.accent },
        ]}
      />
      {scrubbing ? (
        <View
          style={[
            styles.scrubTime,
            {
              left: Math.max(
                -SCRUB_TIME_OVERHANG,
                Math.min(
                  lineWidth - SCRUB_TIME_WIDTH + SCRUB_TIME_OVERHANG,
                  fraction * lineWidth - SCRUB_TIME_WIDTH / 2
                )
              ),
              backgroundColor: palette.tile,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.scrubTimeText, { color: palette.ink }]}>
            {formatPlaybackTime(shownPosition)}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * What floats just above the capsule: a playback failure. (Selah shows as its filled
 * button alone; the owner asked for no caption over the text.)
 */
export function PlayerBarNotices({ errorMessage }: { errorMessage: string | null }) {
  if (!errorMessage) return null;
  return (
    <View style={styles.notices} pointerEvents="none">
      <AudioPlaybackErrorNotice message={errorMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: PLAYER_BAR_PROGRESS_HEIGHT,
    borderRadius: PLAYER_BAR_PROGRESS_HEIGHT / 2,
  },
  // Grows about its centre, so the line does not jump down under the finger.
  trackScrubbing: {
    height: SCRUB_LINE_HEIGHT,
    borderRadius: SCRUB_LINE_HEIGHT / 2,
    marginTop: (PLAYER_BAR_PROGRESS_HEIGHT - SCRUB_LINE_HEIGHT) / 2,
  },
  fill: {
    height: '100%',
    borderRadius: PLAYER_BAR_PROGRESS_HEIGHT / 2,
  },
  fillScrubbing: {
    borderRadius: SCRUB_LINE_HEIGHT / 2,
  },
  scrubTime: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: spacing.sm,
    width: SCRUB_TIME_WIDTH,
    borderRadius: 6,
    paddingVertical: 3,
    alignItems: 'center',
  },
  scrubTimeText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  notices: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
});
