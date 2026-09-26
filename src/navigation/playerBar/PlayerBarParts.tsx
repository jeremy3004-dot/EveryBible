import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AudioPlaybackErrorNotice } from '../../components/audio/AudioPlaybackErrorNotice';
import { spacing } from '../../design/system';
import { useAudioStore } from '../../stores/audioStore';
import { PLAYER_BAR_PROGRESS_HEIGHT } from '../readerTabBarMotion';
import type { PlayerBarPalette } from './playerBarModel';

/**
 * The bar's progress hairline. The one part of the bar that follows the playback
 * position, so the ~250ms position tick redraws this leaf and nothing else.
 */
export const PlayerBarProgressFill = memo(function PlayerBarProgressFill({
  active,
  palette,
}: {
  active: boolean;
  palette: PlayerBarPalette;
}) {
  const fraction = useAudioStore((state) =>
    active && state.duration > 0
      ? Math.max(0, Math.min(1, state.currentPosition / state.duration))
      : 0
  );

  return (
    <View
      style={[styles.track, { backgroundColor: palette.hairline }]}
      testID="player-bar-progress"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        testID="player-bar-progress-fill"
        style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: palette.accent }]}
      />
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
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
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
