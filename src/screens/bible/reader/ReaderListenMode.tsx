import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography } from '../../../design/system';
import {
  getListenCountedNoticeViewModel,
  LISTEN_COUNTED_NOTICE_TEST_ID,
} from '../bibleReaderModel';
import type {
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../../types/audio';
import { BookIcon } from '../../../components/bible/BookIcon';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { announceLiveRegionText } from '../../../utils/a11y';
import { ReaderListenProgress } from '../ReaderAudioPositionParts';
import { PlaybackControls } from '../../../components/audio/PlaybackControls';
import type { ChapterFeedback } from './useChapterFeedback';
import { ListenFeedbackComposer } from './ListenFeedbackComposer';

export interface ReaderListenModeProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  bookId: string;
  changeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  changePlaybackRate: (rate: PlaybackRate) => Promise<void>;
  cycleRepeatMode: () => void;
  /** The player's failure message, shown only while this chapter is the one that failed. */
  errorMessage: string | null;
  feedback: ChapterFeedback;
  handleListenModeSeek: (positionMs: number) => void;
  handleNextListenChapter: () => Promise<void>;
  handlePlayDisplayedChapter: () => void;
  handlePreviousListenChapter: () => Promise<void>;
  hasNextChapter: boolean;
  hasPrevChapter: boolean;
  isCurrentAudioChapter: boolean;
  isLargeText: boolean;
  listenCountedNotice: string | null;
  /** Tapping the book artwork opens Read Along for the chapter. */
  onOpenReadAlong: () => void;
  playbackRate: PlaybackRate;
  readerAudioTrack: { translationId: string; bookId: string; chapter: number };
  repeatMode: RepeatMode;
  showInlineChapterFeedbackComposer: boolean;
  showPlanSessionChrome: boolean;
  skipBackward: () => Promise<void>;
  skipForward: () => Promise<void>;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: SleepTimerOption) => void;
  status: AudioStatus;
}

/** The listen page: artwork, the chapter transport, counted-listen notice and the inline feedback composer. */
export function ReaderListenMode({
  backgroundMusicChoice,
  bookId,
  changeBackgroundMusicChoice,
  changePlaybackRate,
  cycleRepeatMode,
  errorMessage,
  feedback,
  handleListenModeSeek,
  handleNextListenChapter,
  handlePlayDisplayedChapter,
  handlePreviousListenChapter,
  hasNextChapter,
  hasPrevChapter,
  isCurrentAudioChapter,
  isLargeText,
  listenCountedNotice,
  onOpenReadAlong,
  playbackRate,
  readerAudioTrack,
  repeatMode,
  showInlineChapterFeedbackComposer,
  showPlanSessionChrome,
  skipBackward,
  skipForward,
  sleepTimerRemaining,
  startSleepTimer,
  status,
}: ReaderListenModeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const listenStatus = isCurrentAudioChapter ? status : 'idle';
  const listenCountedNoticeViewModel = getListenCountedNoticeViewModel(listenCountedNotice);
  const countedNoticeLabel = listenCountedNoticeViewModel?.accessibilityLabel ?? null;

  // The notice slides in and leaves on a timer while the reader listens; it is
  // spoken so plan progress is not recorded in silence.
  useEffect(() => {
    if (countedNoticeLabel) announceLiveRegionText(countedNoticeLabel);
  }, [countedNoticeLabel]);

  return (
    <View style={styles.listenColumn}>
      <TouchableOpacity
        style={[
          styles.listenArtworkFrame,
          {
            backgroundColor: colors.bibleElevatedSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
        onPress={onOpenReadAlong}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('audio.readAlong')}
        accessibilityHint={t('audio.readAlongHint')}
      >
        <BookIcon bookId={bookId} style={styles.listenArtwork} />
      </TouchableOpacity>

      <View
        style={[
          styles.listenPlayerCard,
          {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
          },
        ]}
      >
        <ReaderListenProgress
          track={readerAudioTrack}
          isCurrentAudioChapter={isCurrentAudioChapter}
          onSeek={handleListenModeSeek}
          trackColor={colors.bibleDivider}
          fillColor={colors.bibleAccent}
          timeTextColor={colors.bibleSecondaryText}
          containerStyle={styles.listenProgressTouch}
          trackStyle={styles.listenProgressTrack}
          fillStyle={styles.listenProgressFill}
          timeRowStyle={styles.listenTimeRow}
          timeTextStyle={styles.listenTimeText}
        >
          {listenCountedNoticeViewModel ? (
            <Animated.View
              testID={LISTEN_COUNTED_NOTICE_TEST_ID}
              // iOS drops a View's label unless the View is an element itself.
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={listenCountedNoticeViewModel.accessibilityLabel}
              entering={SlideInDown.springify().damping(20).stiffness(220)}
              exiting={SlideOutDown.duration(180)}
              style={[
                styles.listenCountedNoticeCard,
                {
                  backgroundColor: colors.bibleSurface,
                  borderColor: colors.accentGreen,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={colors.accentGreen} />
              <Text
                style={[styles.listenCountedNoticeText, { color: colors.biblePrimaryText }]}
                numberOfLines={2}
              >
                {listenCountedNoticeViewModel.text}
              </Text>
            </Animated.View>
          ) : null}
        </ReaderListenProgress>

        <PlaybackControls
          variant="chapter-only"
          showUtilityRow={false}
          status={listenStatus}
          errorMessage={listenStatus === 'error' ? errorMessage : null}
          playbackRate={playbackRate}
          repeatMode={repeatMode}
          sleepTimerRemaining={sleepTimerRemaining}
          backgroundMusicChoice={backgroundMusicChoice}
          hasPreviousChapter={hasPrevChapter}
          hasNextChapter={hasNextChapter}
          onPlayPause={handlePlayDisplayedChapter}
          showChapterNavigation={!showPlanSessionChrome}
          onPreviousChapter={() => void handlePreviousListenChapter()}
          onNextChapter={() => void handleNextListenChapter()}
          onSkipBackward={() => void skipBackward()}
          onSkipForward={() => void skipForward()}
          onChangePlaybackRate={changePlaybackRate}
          onCycleRepeatMode={cycleRepeatMode}
          onSetSleepTimer={startSleepTimer}
          onChangeBackgroundMusicChoice={changeBackgroundMusicChoice}
        />
      </View>

      {showInlineChapterFeedbackComposer ? (
        <ListenFeedbackComposer feedback={feedback} isLargeText={isLargeText} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listenColumn: {
    flex: 1,
    gap: 20,
    justifyContent: 'flex-start',
  },
  listenArtworkFrame: {
    alignSelf: 'stretch',
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listenArtwork: {
    width: '100%',
    height: '100%',
  },
  listenPlayerCard: {
    paddingBottom: 0,
    gap: 12,
  },
  listenCountedNoticeCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listenCountedNoticeText: {
    flex: 1,
    ...typography.micro,
    fontWeight: '700',
  },
  listenProgressTouch: {
    justifyContent: 'center',
    height: 22,
  },
  listenProgressTrack: {
    height: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  listenProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  listenTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  listenTimeText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 42,
    fontVariant: ['tabular-nums'],
  },
});
