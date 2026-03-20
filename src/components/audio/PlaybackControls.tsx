import { View, TouchableOpacity, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { AudioStatus, PlaybackRate, SleepTimerOption } from '../../types';
import { PLAYBACK_RATES, SLEEP_TIMER_OPTIONS } from '../../types';

interface PlaybackControlsProps {
  variant?: 'default' | 'chapter-only';
  status: AudioStatus;
  playbackRate: PlaybackRate;
  sleepTimerRemaining: number | null;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPlayPause: () => void;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onChangePlaybackRate: (rate: PlaybackRate) => void;
  onSetSleepTimer: (minutes: SleepTimerOption) => void;
}

export function PlaybackControls({
  variant = 'default',
  status,
  playbackRate,
  sleepTimerRemaining,
  hasPreviousChapter,
  hasNextChapter,
  onPlayPause,
  onPreviousChapter,
  onNextChapter,
  onSkipBackward,
  onSkipForward,
  onChangePlaybackRate,
  onSetSleepTimer,
}: PlaybackControlsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);

  const isLoading = status === 'loading';
  const isPlaying = status === 'playing';
  const showSkipControls = variant === 'default';

  return (
    <View style={styles.container}>
      <View style={styles.transportRow}>
        <TouchableOpacity
          style={[styles.iconButton, !hasPreviousChapter && styles.disabledButton]}
          onPress={onPreviousChapter}
          disabled={!hasPreviousChapter || isLoading}
        >
          <Ionicons
            name="play-skip-back"
            size={20}
            color={hasPreviousChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
          />
        </TouchableOpacity>

        {showSkipControls ? (
          <TouchableOpacity
            style={[
              styles.skipButton,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
            onPress={onSkipBackward}
            disabled={isLoading}
          >
            <Ionicons name="play-back" size={16} color={colors.biblePrimaryText} />
            <Text style={[styles.skipLabel, { color: colors.biblePrimaryText }]}>10</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: colors.bibleControlBackground }]}
          onPress={onPlayPause}
          disabled={isLoading}
        >
          {isLoading ? (
            <Ionicons name="hourglass" size={26} color={colors.bibleBackground} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={26}
              color={colors.bibleBackground}
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
          >
            <Text style={[styles.skipLabel, { color: colors.biblePrimaryText }]}>10</Text>
            <Ionicons name="play-forward" size={16} color={colors.biblePrimaryText} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.iconButton, !hasNextChapter && styles.disabledButton]}
          onPress={onNextChapter}
          disabled={!hasNextChapter || isLoading}
        >
          <Ionicons
            name="play-skip-forward"
            size={20}
            color={hasNextChapter ? colors.biblePrimaryText : colors.bibleSecondaryText}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.utilityRow}>
        <TouchableOpacity
          style={[
            styles.utilityButton,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
          onPress={() => setShowSpeedModal(true)}
        >
          <Text style={[styles.utilityText, { color: colors.biblePrimaryText }]}>
            {playbackRate}x
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.utilityButton,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
          onPress={() => setShowTimerModal(true)}
        >
          <Ionicons
            name={sleepTimerRemaining ? 'timer' : 'timer-outline'}
            size={18}
            color={sleepTimerRemaining ? colors.bibleAccent : colors.biblePrimaryText}
          />
          <Text
            style={[
              styles.utilityText,
              {
                color: sleepTimerRemaining ? colors.bibleAccent : colors.biblePrimaryText,
              },
            ]}
          >
            {sleepTimerRemaining ? `${sleepTimerRemaining}m` : '...'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showSpeedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSpeedModal(false)}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
              {t('audio.playbackSpeed')}
            </Text>
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
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showTimerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimerModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTimerModal(false)}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
              {t('audio.sleepTimer')}
            </Text>
            {SLEEP_TIMER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.modalOption}
                onPress={() => {
                  onSetSleepTimer(option.value);
                  setShowTimerModal(false);
                }}
              >
                <Text style={[styles.modalOptionText, { color: colors.biblePrimaryText }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityButton: {
    minWidth: 64,
    height: 38,
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
  disabledButton: {
    opacity: 0.45,
  },
  skipButton: {
    minWidth: 64,
    height: 42,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
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
});
