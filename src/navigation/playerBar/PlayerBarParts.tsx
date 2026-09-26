import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AudioPlaybackErrorNotice } from '../../components/audio/AudioPlaybackErrorNotice';
import { radius, spacing, typography } from '../../design/system';
import { useAudioStore } from '../../stores/audioStore';
import type { BackgroundMusicChoice } from '../../types/audio';
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

/** "Selah · Piano keeps playing": the narration is held while the sound plays on. */
export const SelahChip = memo(function SelahChip({
  soundChoice,
  palette,
}: {
  soundChoice: BackgroundMusicChoice;
  palette: PlayerBarPalette;
}) {
  const { t } = useTranslation();
  const sound = t(`interface.music.${soundChoice}.label`);

  return (
    <View
      style={[styles.chip, { backgroundColor: palette.tile, borderColor: palette.hairline }]}
      accessibilityLiveRegion="polite"
      testID="selah-chip"
    >
      <Feather size={12} strokeWidth={1.8} color={palette.accent} />
      <Text style={[styles.chipText, { color: palette.ink }]} numberOfLines={2}>
        {t('audio.playerBar.selahChip', { sound })}
      </Text>
    </View>
  );
});

/** What floats just above the capsule: a playback failure, the Selah chip. */
export function PlayerBarNotices({
  errorMessage,
  selahSound,
  palette,
}: {
  errorMessage: string | null;
  selahSound: BackgroundMusicChoice | null;
  palette: PlayerBarPalette;
}) {
  if (!errorMessage && !selahSound) return null;
  return (
    <View style={styles.notices} pointerEvents="none">
      {errorMessage ? <AudioPlaybackErrorNotice message={errorMessage} /> : null}
      {selahSound ? <SelahChip soundChoice={selahSound} palette={palette} /> : null}
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    maxWidth: '100%',
  },
  chipText: {
    ...typography.micro,
    fontWeight: '600',
    flexShrink: 1,
  },
});
