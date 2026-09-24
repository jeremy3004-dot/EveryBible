import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type {
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../types';
import { PLAYBACK_RATES, SLEEP_TIMER_OPTIONS } from '../../types';
import { BACKGROUND_MUSIC_OPTIONS } from '../../services/audio';
import { mediumHaptic } from '../../utils';
import { useAudioStore } from '../../stores/audioStore';
import { isSleepTimerOptionSelected } from './sleepTimerSelection';
import { PlaybackOptionsDialog } from './PlaybackOptionsDialog';

interface PlaybackControlsProps {
  variant?: 'default' | 'chapter-only' | 'utilities-only';
  status: AudioStatus;
  playbackRate: PlaybackRate;
  repeatMode: RepeatMode;
  sleepTimerRemaining: number | null;
  backgroundMusicChoice: BackgroundMusicChoice;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPlayPause: () => void;
  showChapterNavigation?: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onChangePlaybackRate: (rate: PlaybackRate) => void;
  onCycleRepeatMode: () => void;
  onSetSleepTimer: (minutes: SleepTimerOption) => void;
  onChangeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  onShowText?: () => void;
  showTextLabel?: string;
  onShareAudio?: () => void;
  showUtilityRow?: boolean;
  footer?: React.ReactNode;
}

export function PlaybackControls({
  variant = 'default',
  status,
  playbackRate,
  repeatMode,
  sleepTimerRemaining,
  backgroundMusicChoice,
  hasPreviousChapter,
  hasNextChapter,
  onPlayPause,
  showChapterNavigation = true,
  onPreviousChapter,
  onNextChapter,
  onSkipBackward,
  onSkipForward,
  onChangePlaybackRate,
  onCycleRepeatMode,
  onSetSleepTimer,
  onChangeBackgroundMusicChoice,
  onShowText,
  showTextLabel,
  onShareAudio,
  showUtilityRow = true,
  footer,
}: PlaybackControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showBackgroundMusicModal, setShowBackgroundMusicModal] = useState(false);
  const sleepTimerMinutes = useAudioStore((state) => state.sleepTimerMinutes);

  const isLoading = status === 'loading';
  const isPlaying = status === 'playing';
  const isChapterOnlyTransport = variant === 'chapter-only';
  const isUtilitiesOnly = variant === 'utilities-only';
  const showChapterTransportButtons = !isChapterOnlyTransport || showChapterNavigation;
  const showSkipControls = variant === 'default';
  const showTextUtility = typeof onShowText === 'function';
  const showShareAudioUtility = typeof onShareAudio === 'function';
  const isRepeatActive = repeatMode !== 'off';
  const isBackgroundMusicActive = backgroundMusicChoice !== 'off';
  const selectedBackgroundMusic =
    BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === backgroundMusicChoice) ??
    BACKGROUND_MUSIC_OPTIONS[0];
  const repeatIconColor = isRepeatActive ? colors.bibleAccent : colors.bibleSecondaryText;
  const backgroundMusicIconColor = isBackgroundMusicActive
    ? colors.bibleAccent
    : colors.biblePrimaryText;
  const repeatAccessibilityLabel =
    repeatMode === 'chapter'
      ? t('audio.repeatChapter')
      : repeatMode === 'book'
        ? t('audio.repeatBook')
        : t('audio.repeatOff');

  const renderRepeatModeIcon = () => (
    <View style={styles.repeatIconWrapper}>
      <Ionicons
        name={repeatMode === 'off' ? 'repeat-outline' : 'repeat'}
        size={18}
        color={repeatIconColor}
      />
      {repeatMode === 'chapter' ? (
        <View style={[styles.repeatBadge, { backgroundColor: repeatIconColor }]}>
          <Text style={[styles.repeatBadgeText, { color: colors.bibleBackground }]}>1</Text>
        </View>
      ) : null}
    </View>
  );

  const renderTextUtilityIcon = () => (
    <View style={styles.textUtilityIcon}>
      <View
        style={[
          styles.textUtilityIconBubble,
          {
            borderColor: colors.biblePrimaryText,
          },
        ]}
      >
        <View
          style={[styles.textUtilityIconLineLong, { backgroundColor: colors.biblePrimaryText }]}
        />
        <View
          style={[styles.textUtilityIconLineMedium, { backgroundColor: colors.biblePrimaryText }]}
        />
        <View
          style={[styles.textUtilityIconLineShort, { backgroundColor: colors.biblePrimaryText }]}
        />
      </View>
      <View
        style={[
          styles.textUtilityIconTail,
          {
            borderBottomColor: colors.biblePrimaryText,
          },
        ]}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {!isUtilitiesOnly ? (
        <View
          style={[
            styles.transportRow,
            isChapterOnlyTransport ? styles.chapterOnlyTransportRow : null,
          ]}
        >
          {showChapterTransportButtons ? (
            <TouchableOpacity
              style={[
                styles.iconButton,
                isChapterOnlyTransport ? styles.chapterOnlyTransportButton : null,
                !hasPreviousChapter && styles.disabledButton,
              ]}
              onPress={onPreviousChapter}
              disabled={!hasPreviousChapter || isLoading}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('audio.previousChapter')}
              accessibilityState={{ disabled: !hasPreviousChapter || isLoading }}
            >
              <Ionicons
                name="play-skip-back"
                size={isChapterOnlyTransport ? 28 : 20}
                color={hasPreviousChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
              />
            </TouchableOpacity>
          ) : null}

          {showSkipControls ? (
            <TouchableOpacity
              style={[
                styles.skipButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={onSkipBackward}
              disabled={isLoading}
              hitSlop={4}
              accessibilityRole="button"
              // The visible "10" plus a chevron is not a name; say what it does.
              accessibilityLabel={t('audio.skipBackward')}
              accessibilityState={{ disabled: isLoading }}
            >
              <Ionicons name="play-back" size={16} color={colors.biblePrimaryText} />
              <Text style={[styles.skipLabel, { color: colors.biblePrimaryText }]}>10</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.playButton,
              isChapterOnlyTransport ? styles.chapterOnlyPlayButton : null,
              { backgroundColor: colors.bibleControlBackground },
            ]}
            onPress={() => {
              mediumHaptic();
              onPlayPause();
            }}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={t(
              isPlaying ? 'interface.pauseChapterAudio' : 'interface.playChapterAudio'
            )}
            accessibilityState={{ busy: isLoading, disabled: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.bibleBackground} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={isChapterOnlyTransport ? 34 : 26}
                color={colors.bibleBackground}
                style={!isPlaying ? styles.playIconOffset : undefined}
              />
            )}
          </TouchableOpacity>

          {showSkipControls ? (
            <TouchableOpacity
              style={[
                styles.skipButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={onSkipForward}
              disabled={isLoading}
              hitSlop={4}
              accessibilityRole="button"
              // The visible "10" plus a chevron is not a name; say what it does.
              accessibilityLabel={t('audio.skipForward')}
              accessibilityState={{ disabled: isLoading }}
            >
              <Text style={[styles.skipLabel, { color: colors.biblePrimaryText }]}>10</Text>
              <Ionicons name="play-forward" size={16} color={colors.biblePrimaryText} />
            </TouchableOpacity>
          ) : null}

          {showChapterTransportButtons ? (
            <TouchableOpacity
              style={[
                styles.iconButton,
                isChapterOnlyTransport ? styles.chapterOnlyTransportButton : null,
                !hasNextChapter && styles.disabledButton,
              ]}
              onPress={onNextChapter}
              disabled={!hasNextChapter || isLoading}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('audio.nextChapter')}
              accessibilityState={{ disabled: !hasNextChapter || isLoading }}
            >
              <Ionicons
                name="play-skip-forward"
                size={isChapterOnlyTransport ? 28 : 20}
                color={hasNextChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {showUtilityRow ? (
        <View
          style={[styles.utilityRow, isChapterOnlyTransport ? styles.chapterOnlyUtilityRow : null]}
        >
          <View style={styles.utilityPrimaryGroup}>
            <TouchableOpacity
              style={[
                styles.utilityButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => setShowTimerModal(true)}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              // Icon-only while no timer runs; the remaining minutes (when shown)
              // are exposed as the value so the control is never an unnamed button.
              accessibilityLabel={t('audio.sleepTimer')}
              accessibilityValue={
                sleepTimerRemaining
                  ? { text: t('interface.minutesShort', { count: sleepTimerRemaining }) }
                  : undefined
              }
            >
              <Ionicons
                name={sleepTimerRemaining ? 'timer' : 'timer-outline'}
                size={18}
                color={sleepTimerRemaining ? colors.bibleAccent : colors.biblePrimaryText}
              />
              {sleepTimerRemaining ? (
                <Text style={[styles.utilityText, { color: colors.bibleAccent }]}>
                  {t('interface.minutesShort', { count: sleepTimerRemaining })}
                </Text>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.utilityButton,
                styles.musicUtilityButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => setShowBackgroundMusicModal(true)}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('interface.backgroundMusicLabel', {
                name: t(`interface.music.${selectedBackgroundMusic.id}.label`),
              })}
              accessibilityHint={t('interface.backgroundMusicHint')}
            >
              <Ionicons
                name={backgroundMusicChoice === 'off' ? 'musical-notes-outline' : 'musical-notes'}
                size={18}
                color={backgroundMusicIconColor}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.utilityButton,
                styles.repeatUtilityButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => onCycleRepeatMode()}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={repeatAccessibilityLabel}
              accessibilityHint={t('interface.repeatHint')}
            >
              {renderRepeatModeIcon()}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.utilityButton,
                { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
              ]}
              onPress={() => setShowSpeedModal(true)}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('audio.playbackSpeed')}
              accessibilityValue={{ text: `${playbackRate}x` }}
            >
              <Text style={[styles.utilityText, { color: colors.biblePrimaryText }]}>
                {playbackRate}x
              </Text>
            </TouchableOpacity>

            {showTextUtility ? (
              <TouchableOpacity
                style={[
                  styles.utilityButton,
                  styles.textUtilityButton,
                  isChapterOnlyTransport ? styles.chapterOnlyTextUtilityButton : null,
                  { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
                ]}
                onPress={onShowText}
                hitSlop={{ top: 4, bottom: 4 }}
                accessibilityRole="button"
                accessibilityLabel={showTextLabel ?? t('audio.showText')}
                accessibilityHint={t('audio.showTextHint')}
              >
                {renderTextUtilityIcon()}
              </TouchableOpacity>
            ) : null}

            {showShareAudioUtility ? (
              <TouchableOpacity
                style={[
                  styles.utilityButton,
                  styles.iconOnlyUtilityButton,
                  { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
                ]}
                onPress={onShareAudio}
                hitSlop={{ top: 4, bottom: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t('bible.shareChapterAudio')}
                accessibilityHint={t('interface.shareAudioHint')}
              >
                <Ionicons name="share-outline" size={18} color={colors.biblePrimaryText} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {footer}

      <PlaybackOptionsDialog
        visible={showBackgroundMusicModal}
        onClose={() => setShowBackgroundMusicModal(false)}
        title={t('audio.musicAndSounds')}
        contentStyle={styles.backgroundMusicModalContent}
        listStyle={styles.backgroundMusicModalContent}
      >
        <Text style={[styles.modalSubtitle, { color: colors.bibleSecondaryText }]}>
          {t('audio.chooseBackgroundLayer')}
        </Text>
        {BACKGROUND_MUSIC_OPTIONS.map((option) => {
          const isSelected = option.id === backgroundMusicChoice;

          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.backgroundMusicOption,
                {
                  backgroundColor: isSelected
                    ? colors.bibleElevatedSurface
                    : colors.bibleBackground,
                  borderColor: colors.bibleDivider,
                },
              ]}
              onPress={() => {
                onChangeBackgroundMusicChoice(option.id);
                setShowBackgroundMusicModal(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={styles.backgroundMusicCopy}>
                <Text
                  style={[
                    styles.backgroundMusicLabel,
                    {
                      color: isSelected ? colors.bibleAccent : colors.biblePrimaryText,
                    },
                  ]}
                >
                  {t(`interface.music.${option.id}.label`)}
                </Text>
                <Text
                  style={[styles.backgroundMusicDescription, { color: colors.bibleSecondaryText }]}
                >
                  {t(`interface.music.${option.id}.description`)}
                </Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkmark" size={20} color={colors.bibleAccent} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </PlaybackOptionsDialog>

      <PlaybackOptionsDialog
        visible={showSpeedModal}
        onClose={() => setShowSpeedModal(false)}
        title={t('audio.playbackSpeed')}
      >
        {PLAYBACK_RATES.map((rate) => (
          <TouchableOpacity
            key={rate}
            style={[
              styles.modalOption,
              rate === playbackRate && {
                backgroundColor: colors.bibleElevatedSurface,
              },
            ]}
            onPress={() => {
              onChangePlaybackRate(rate);
              setShowSpeedModal(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: rate === playbackRate }}
          >
            <Text
              style={[
                styles.modalOptionText,
                {
                  color: rate === playbackRate ? colors.bibleAccent : colors.biblePrimaryText,
                },
              ]}
            >
              {rate}x
            </Text>
            {rate === playbackRate ? (
              <Ionicons name="checkmark" size={20} color={colors.bibleAccent} />
            ) : null}
          </TouchableOpacity>
        ))}
      </PlaybackOptionsDialog>

      <PlaybackOptionsDialog
        visible={showTimerModal}
        onClose={() => setShowTimerModal(false)}
        title={t('audio.sleepTimer')}
      >
        {SLEEP_TIMER_OPTIONS.map((option) => {
          const isSelected = isSleepTimerOptionSelected(
            option.value,
            sleepTimerMinutes,
            sleepTimerRemaining
          );
          return (
            <TouchableOpacity
              key={option.value ?? 'off'}
              style={[
                styles.modalOption,
                isSelected && { backgroundColor: colors.bibleElevatedSurface },
              ]}
              onPress={() => {
                onSetSleepTimer(option.value);
                setShowTimerModal(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  { color: isSelected ? colors.bibleAccent : colors.biblePrimaryText },
                ]}
              >
                {option.value == null
                  ? t('interface.music.off.label')
                  : t('interface.minutesShort', { count: option.value })}
              </Text>
              {isSelected ? (
                <Ionicons name="checkmark" size={20} color={colors.bibleAccent} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </PlaybackOptionsDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  chapterOnlyTransportRow: {
    gap: 18,
    marginTop: 6,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  utilityPrimaryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    maxWidth: '100%',
  },
  chapterOnlyUtilityRow: {
    gap: 10,
    marginTop: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterOnlyTransportButton: {
    width: 52,
    height: 52,
  },
  utilityButton: {
    minWidth: 64,
    // minHeight, not height: the sleep-timer and speed labels grow with Dynamic Type.
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  utilityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  musicUtilityButton: {
    minWidth: 38,
    paddingHorizontal: 10,
  },
  repeatUtilityButton: {
    minWidth: 38,
    paddingHorizontal: 10,
  },
  textUtilityButton: {
    minWidth: 38,
    paddingHorizontal: 10,
  },
  chapterOnlyTextUtilityButton: {
    paddingHorizontal: 10,
  },
  iconOnlyUtilityButton: {
    minWidth: 38,
    paddingHorizontal: 10,
  },
  repeatIconWrapper: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textUtilityIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textUtilityIconBubble: {
    width: 16,
    minHeight: 13,
    borderWidth: 1.5,
    borderRadius: 5,
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 2,
  },
  textUtilityIconTail: {
    position: 'absolute',
    left: 4,
    bottom: 0,
    width: 5,
    height: 5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: '-45deg' }],
    backgroundColor: 'transparent',
  },
  textUtilityIconLineLong: {
    width: 8,
    height: 1.5,
    borderRadius: 999,
  },
  textUtilityIconLineMedium: {
    width: 7,
    height: 1.5,
    borderRadius: 999,
  },
  textUtilityIconLineShort: {
    width: 5,
    height: 1.5,
    borderRadius: 999,
  },
  repeatBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  repeatBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
  disabledButton: {
    opacity: 0.45,
  },
  skipButton: {
    minWidth: 64,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  skipLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  chapterOnlyPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginHorizontal: 10,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  modalOption: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  backgroundMusicModalContent: {
    gap: 10,
  },
  backgroundMusicOption: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backgroundMusicCopy: {
    flex: 1,
    gap: 4,
  },
  backgroundMusicLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  backgroundMusicDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
