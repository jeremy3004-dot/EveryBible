import { StyleSheet, Modal, Text, TouchableOpacity, View } from 'react-native';
import { shadows, spacing, typography } from '../../../design/system';
import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
  AudioStatus,
} from '../../../types/audio';
import type { Dispatch, SetStateAction } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { PlaybackControls } from '../../../components/audio/PlaybackControls';
import { readerSharedStyles } from './readerSharedStyles';

export interface AudioOptionsSheetProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  changeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  changePlaybackRate: (rate: PlaybackRate) => Promise<void>;
  cycleRepeatMode: () => void;
  handleNextListenChapter: () => Promise<void>;
  handleOpenChapterAudioShareSheet: () => void;
  handlePlayDisplayedChapter: () => void;
  handlePreviousListenChapter: () => Promise<void>;
  hasNextChapter: boolean;
  hasPrevChapter: boolean;
  isCurrentAudioChapter: boolean;
  playbackRate: PlaybackRate;
  repeatMode: RepeatMode;
  setShowAudioOptionsSheet: Dispatch<SetStateAction<boolean>>;
  showAudioOptionsSheet: boolean;
  skipBackward: () => Promise<void>;
  skipForward: () => Promise<void>;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: SleepTimerOption) => void;
  status: AudioStatus;
}

/** The top audio button's playback utilities. */
export function AudioOptionsSheet({
  backgroundMusicChoice,
  changeBackgroundMusicChoice,
  changePlaybackRate,
  cycleRepeatMode,
  handleNextListenChapter,
  handleOpenChapterAudioShareSheet,
  handlePlayDisplayedChapter,
  handlePreviousListenChapter,
  hasNextChapter,
  hasPrevChapter,
  isCurrentAudioChapter,
  playbackRate,
  repeatMode,
  setShowAudioOptionsSheet,
  showAudioOptionsSheet,
  skipBackward,
  skipForward,
  sleepTimerRemaining,
  startSleepTimer,
  status,
}: AudioOptionsSheetProps) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal
      visible={showAudioOptionsSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => setShowAudioOptionsSheet(false)}
    >
      <TouchableOpacity
        style={[
          readerSharedStyles.audioShareBackdrop,
          {
            backgroundColor: colors.overlay,
            paddingBottom: Math.max(safeInsets.bottom, 12) + spacing.md,
          },
        ]}
        activeOpacity={1}
        onPress={() => setShowAudioOptionsSheet(false)}
        // Left accessible, this wrapping backdrop folds the whole sheet into one
        // VoiceOver element whose only action is dismiss.
        accessible={false}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={() => setShowAudioOptionsSheet(false)}
          style={[
            styles.audioOptionsSheet,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
            },
          ]}
        >
          <View style={styles.audioOptionsHeader}>
            <View style={styles.audioOptionsTitleRow}>
              <Ionicons name="volume-medium-outline" size={18} color={colors.biblePrimaryText} />
              <Text
                accessibilityRole="header"
                style={[styles.audioOptionsTitle, { color: colors.biblePrimaryText }]}
              >
                {t('audio.nowPlaying')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.sheetCloseButton}
              hitSlop={6}
              onPress={() => setShowAudioOptionsSheet(false)}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>

          <PlaybackControls
            variant="utilities-only"
            status={isCurrentAudioChapter ? status : 'idle'}
            playbackRate={playbackRate}
            repeatMode={repeatMode}
            sleepTimerRemaining={sleepTimerRemaining}
            backgroundMusicChoice={backgroundMusicChoice}
            hasPreviousChapter={hasPrevChapter}
            hasNextChapter={hasNextChapter}
            onPlayPause={handlePlayDisplayedChapter}
            showChapterNavigation={false}
            onPreviousChapter={() => void handlePreviousListenChapter()}
            onNextChapter={() => void handleNextListenChapter()}
            onSkipBackward={() => void skipBackward()}
            onSkipForward={() => void skipForward()}
            onChangePlaybackRate={changePlaybackRate}
            onCycleRepeatMode={cycleRepeatMode}
            onSetSleepTimer={startSleepTimer}
            onChangeBackgroundMusicChoice={changeBackgroundMusicChoice}
            onShareAudio={handleOpenChapterAudioShareSheet}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  audioOptionsSheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  audioOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  audioOptionsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  audioOptionsTitle: {
    ...typography.cardTitle,
    fontSize: 18,
    lineHeight: 22,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
