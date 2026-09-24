import type {
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../../types/audio';
import { BookIcon } from '../../../components/bible/BookIcon';
import { Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { ReaderListenProgress } from '../ReaderAudioPositionParts';
import { PlaybackControls } from '../../../components/audio/PlaybackControls';
import {
  getListenCountedNoticeViewModel,
  LISTEN_COUNTED_NOTICE_TEST_ID,
} from '../bibleReaderModel';
import type { ChapterFeedback } from './useChapterFeedback';
import { ListenFeedbackComposer } from './ListenFeedbackComposer';
import { styles } from './readerStyles';

export interface ReaderListenModeProps {
  backgroundMusicChoice: BackgroundMusicChoice;
  bookId: string;
  changeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  changePlaybackRate: (rate: PlaybackRate) => Promise<void>;
  cycleRepeatMode: () => void;
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

  const listenStatus = isCurrentAudioChapter ? status : 'idle';
  const listenCountedNoticeViewModel = getListenCountedNoticeViewModel(listenCountedNotice);

  return (
    <View style={styles.listenColumn}>
      <View
        style={[
          styles.listenArtworkFrame,
          {
            backgroundColor: colors.bibleElevatedSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <BookIcon bookId={bookId} style={styles.listenArtwork} />
      </View>

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
