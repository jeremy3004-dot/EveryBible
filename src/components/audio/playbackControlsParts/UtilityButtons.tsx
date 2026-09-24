import { memo } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BackgroundMusicChoice, PlaybackRate, RepeatMode } from '../../../types/audio';
import { BACKGROUND_MUSIC_OPTIONS } from '../../../services/audio';
import {
  formatPlaybackRate,
  repeatLabelKey,
  selectedBackgroundMusicId,
} from './playbackControlsModel';
import { RepeatModeIcon, TextUtilityIcon } from './PlaybackGlyphs';
import { playbackControlsStyles as styles } from './playbackControlsStyles';

// Each utility is memoised on plain values and stable handlers, so the sleep
// timer's minute countdown redraws the timer pill and nothing else.

const UTILITY_HIT_SLOP = { top: 4, bottom: 4 };

function useUtilitySurface() {
  const { colors } = useTheme();
  return { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider };
}

export const SleepTimerButton = memo(function SleepTimerButton({
  remainingMinutes,
  onPress,
}: {
  remainingMinutes: number | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const surface = useUtilitySurface();
  const minutes = remainingMinutes
    ? t('interface.minutesShort', { count: remainingMinutes })
    : null;

  return (
    <TouchableOpacity
      style={[styles.utilityButton, surface]}
      onPress={onPress}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      // Icon-only while no timer runs; the remaining minutes (when shown)
      // are exposed as the value so the control is never an unnamed button.
      accessibilityLabel={t('audio.sleepTimer')}
      accessibilityValue={minutes ? { text: minutes } : undefined}
    >
      <Ionicons
        name={minutes ? 'timer' : 'timer-outline'}
        size={18}
        color={minutes ? colors.bibleAccent : colors.biblePrimaryText}
      />
      {minutes ? (
        <Text style={[styles.utilityText, { color: colors.bibleAccent }]}>{minutes}</Text>
      ) : null}
    </TouchableOpacity>
  );
});

export const BackgroundMusicButton = memo(function BackgroundMusicButton({
  choice,
  onPress,
}: {
  choice: BackgroundMusicChoice;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const surface = useUtilitySurface();
  const selectedId = selectedBackgroundMusicId(choice, BACKGROUND_MUSIC_OPTIONS);

  return (
    <TouchableOpacity
      style={[styles.utilityButton, styles.musicUtilityButton, surface]}
      onPress={onPress}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('interface.backgroundMusicLabel', {
        name: t(`interface.music.${selectedId}.label`),
      })}
      accessibilityHint={t('interface.backgroundMusicHint')}
    >
      <Ionicons
        name={choice === 'off' ? 'musical-notes-outline' : 'musical-notes'}
        size={18}
        color={choice !== 'off' ? colors.bibleAccent : colors.biblePrimaryText}
      />
    </TouchableOpacity>
  );
});

export const RepeatButton = memo(function RepeatButton({
  repeatMode,
  onCycle,
}: {
  repeatMode: RepeatMode;
  onCycle: () => void;
}) {
  const { t } = useTranslation();
  const surface = useUtilitySurface();

  return (
    <TouchableOpacity
      style={[styles.utilityButton, styles.repeatUtilityButton, surface]}
      // Called bare: the press event is not a repeat mode.
      onPress={() => onCycle()}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t(repeatLabelKey(repeatMode))}
      accessibilityHint={t('interface.repeatHint')}
    >
      <RepeatModeIcon repeatMode={repeatMode} />
    </TouchableOpacity>
  );
});

export const SpeedButton = memo(function SpeedButton({
  rate,
  onPress,
}: {
  rate: PlaybackRate;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const surface = useUtilitySurface();

  return (
    <TouchableOpacity
      style={[styles.utilityButton, surface]}
      onPress={onPress}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('audio.playbackSpeed')}
      accessibilityValue={{ text: formatPlaybackRate(rate) }}
    >
      <Text style={[styles.utilityText, { color: colors.biblePrimaryText }]}>{rate}x</Text>
    </TouchableOpacity>
  );
});

export const ShowTextButton = memo(function ShowTextButton({
  label,
  isChapterOnly,
  onPress,
}: {
  label: string | undefined;
  isChapterOnly: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const surface = useUtilitySurface();

  return (
    <TouchableOpacity
      style={[
        styles.utilityButton,
        styles.textUtilityButton,
        isChapterOnly ? styles.chapterOnlyTextUtilityButton : null,
        surface,
      ]}
      onPress={onPress}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('audio.showText')}
      accessibilityHint={t('audio.showTextHint')}
    >
      <TextUtilityIcon />
    </TouchableOpacity>
  );
});

export const ShareAudioButton = memo(function ShareAudioButton({
  onPress,
}: {
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const surface = useUtilitySurface();

  return (
    <TouchableOpacity
      style={[styles.utilityButton, styles.iconOnlyUtilityButton, surface]}
      onPress={onPress}
      hitSlop={UTILITY_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('bible.shareChapterAudio')}
      accessibilityHint={t('interface.shareAudioHint')}
    >
      <Ionicons name="share-outline" size={18} color={colors.biblePrimaryText} />
    </TouchableOpacity>
  );
});
