import { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BackgroundMusicChoice, PlaybackRate, SleepTimerOption } from '../../../types/audio';
import { PLAYBACK_RATES, SLEEP_TIMER_OPTIONS } from '../../../types';
import { BACKGROUND_MUSIC_OPTIONS } from '../../../services/audio';
import { useAudioStore } from '../../../stores/audioStore';
import { isSleepTimerOptionSelected } from '../sleepTimerSelection';
import { PlaybackOptionsDialog } from '../PlaybackOptionsDialog';
import { formatPlaybackRate, sleepTimerOptionLabel } from './playbackControlsModel';
import { playbackControlsStyles as styles } from './playbackControlsStyles';

// The three option sheets behind the utility pills. Choosing a row reports it
// and closes the sheet. Option rows are named explicitly: without a label
// Android derives the name from all children, and the selected row's Ionicons
// checkmark is a private-use icon-font glyph that TalkBack reads out.

interface SheetProps<Value> {
  visible: boolean;
  onClose: () => void;
  onSelect: (value: Value) => void;
}

export const BackgroundMusicSheet = memo(function BackgroundMusicSheet({
  visible,
  onClose,
  onSelect,
  choice,
}: SheetProps<BackgroundMusicChoice> & { choice: BackgroundMusicChoice }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <PlaybackOptionsDialog
      visible={visible}
      onClose={onClose}
      title={t('audio.musicAndSounds')}
      contentStyle={styles.backgroundMusicModalContent}
      listStyle={styles.backgroundMusicModalContent}
    >
      <Text style={[styles.modalSubtitle, { color: colors.bibleSecondaryText }]}>
        {t('audio.chooseBackgroundLayer')}
      </Text>
      {BACKGROUND_MUSIC_OPTIONS.map((option) => {
        const isSelected = option.id === choice;
        const label = t(`interface.music.${option.id}.label`);
        const description = t(`interface.music.${option.id}.description`);

        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.backgroundMusicOption,
              {
                backgroundColor: isSelected ? colors.bibleElevatedSurface : colors.bibleBackground,
                borderColor: colors.bibleDivider,
              },
            ]}
            onPress={() => {
              onSelect(option.id);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${description}`}
            accessibilityState={{ selected: isSelected }}
          >
            <View style={styles.backgroundMusicCopy}>
              <Text
                style={[
                  styles.backgroundMusicLabel,
                  { color: isSelected ? colors.bibleAccent : colors.biblePrimaryText },
                ]}
              >
                {label}
              </Text>
              <Text
                style={[styles.backgroundMusicDescription, { color: colors.bibleSecondaryText }]}
              >
                {description}
              </Text>
            </View>
            {isSelected ? <Ionicons name="checkmark" size={20} color={colors.bibleAccent} /> : null}
          </TouchableOpacity>
        );
      })}
    </PlaybackOptionsDialog>
  );
});

/** One row of the speed or sleep-timer sheet. */
function OptionRow({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.modalOption, isSelected && { backgroundColor: colors.bibleElevatedSurface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[
          styles.modalOptionText,
          { color: isSelected ? colors.bibleAccent : colors.biblePrimaryText },
        ]}
      >
        {label}
      </Text>
      {isSelected ? <Ionicons name="checkmark" size={20} color={colors.bibleAccent} /> : null}
    </TouchableOpacity>
  );
}

export const PlaybackSpeedSheet = memo(function PlaybackSpeedSheet({
  visible,
  onClose,
  onSelect,
  rate,
}: SheetProps<PlaybackRate> & { rate: PlaybackRate }) {
  const { t } = useTranslation();

  return (
    <PlaybackOptionsDialog visible={visible} onClose={onClose} title={t('audio.playbackSpeed')}>
      {PLAYBACK_RATES.map((option) => (
        <OptionRow
          key={option}
          label={formatPlaybackRate(option)}
          isSelected={option === rate}
          onPress={() => {
            onSelect(option);
            onClose();
          }}
        />
      ))}
    </PlaybackOptionsDialog>
  );
});

export const SleepTimerSheet = memo(function SleepTimerSheet({
  visible,
  onClose,
  onSelect,
  remainingMinutes,
}: SheetProps<SleepTimerOption> & { remainingMinutes: number | null }) {
  const { t } = useTranslation();
  // The remembered length marks its row only while a countdown exists.
  const sleepTimerMinutes = useAudioStore((state) => state.sleepTimerMinutes);

  return (
    <PlaybackOptionsDialog visible={visible} onClose={onClose} title={t('audio.sleepTimer')}>
      {SLEEP_TIMER_OPTIONS.map((option) => {
        const label = sleepTimerOptionLabel(option.value);
        return (
          <OptionRow
            key={option.value ?? 'off'}
            label={label.count === undefined ? t(label.key) : t(label.key, { count: label.count })}
            isSelected={isSleepTimerOptionSelected(
              option.value,
              sleepTimerMinutes,
              remainingMinutes
            )}
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
          />
        );
      })}
    </PlaybackOptionsDialog>
  );
});
