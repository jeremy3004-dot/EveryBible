import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAudioPlayer } from '../../hooks';
import { getBookById } from '../../constants';
import { useBibleStore } from '../../stores';
import { PlaybackControls } from './PlaybackControls';

interface AudioPlayerBarProps {
  bookId: string;
  chapter: number;
  onChapterChange?: (chapter: number) => void;
}

export function AudioPlayerBar({ bookId, chapter, onChapterChange }: AudioPlayerBarProps) {
  const { colors } = useTheme();
  const currentTranslation = useBibleStore((state) => state.currentTranslation);

  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    playbackRate,
    repeatMode,
    sleepTimerRemaining,
    playChapter,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    cycleRepeatMode,
    startSleepTimer,
    setShowPlayer,
  } = useAudioPlayer(currentTranslation);

  const book = getBookById(bookId);
  const currentBook = currentBookId ? getBookById(currentBookId) : null;
  const isCurrentChapter =
    currentTranslationId === currentTranslation &&
    currentBookId === bookId &&
    currentChapter === chapter;
  const displayPosition = isCurrentChapter ? currentPosition : 0;
  const displayDuration = isCurrentChapter ? duration : 0;
  const progress = displayDuration > 0 ? (displayPosition / displayDuration) * 100 : 0;

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayDisplayedChapter = () => {
    if (!isCurrentChapter) {
      void playChapter(bookId, chapter);
      return;
    }
    void togglePlayPause();
  };

  const handleSeek = (locationX: number, width: number) => {
    if (!isCurrentChapter || displayDuration <= 0 || width <= 0) {
      return;
    }
    const percentage = locationX / width;
    const newPosition = percentage * displayDuration;
    void seekTo(Math.max(0, Math.min(displayDuration, newPosition)));
  };

  const handlePreviousChapter = async () => {
    if (isCurrentChapter) {
      await previousChapter();
      if (currentBookId && currentChapter && currentChapter > 1) {
        onChapterChange?.(currentChapter - 1);
      }
      return;
    }

    if (chapter > 1) {
      await playChapter(bookId, chapter - 1);
      onChapterChange?.(chapter - 1);
    }
  };

  const handleNextChapter = async () => {
    if (isCurrentChapter) {
      await nextChapter();
      if (currentBookId && currentChapter && currentBook && currentChapter < currentBook.chapters) {
        onChapterChange?.(currentChapter + 1);
      }
      return;
    }

    if (book && chapter < book.chapters) {
      await playChapter(bookId, chapter + 1);
      onChapterChange?.(chapter + 1);
    }
  };

  const hasPreviousChapter = currentChapter ? currentChapter > 1 : chapter > 1;
  const hasNextChapter = currentBook
    ? currentChapter! < currentBook.chapters
    : book
      ? chapter < book.chapters
      : false;

  const displayBookName = currentBook?.name || book?.name || '';
  const displayChapter = currentChapter || chapter;

  return (
    <View style={[styles.container, { backgroundColor: colors.bibleBackground }]}>
      <View style={styles.metaRow}>
        <View>
          <Text style={[styles.metaTitle, { color: colors.biblePrimaryText }]}>
            {displayBookName} {displayChapter}
          </Text>
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={() => setShowPlayer(false)}>
          <Ionicons name="close" size={18} color={colors.bibleSecondaryText} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.progressContainer}
        activeOpacity={0.85}
        onPress={(event) => {
          const { locationX } = event.nativeEvent;
          event.currentTarget.measure((_x, _y, measuredWidth) => {
            handleSeek(locationX, measuredWidth);
          });
        }}
      >
        <View style={[styles.progressTrack, { backgroundColor: colors.bibleDivider }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: colors.bibleAccent },
            ]}
          />
        </View>
      </TouchableOpacity>

      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: colors.bibleSecondaryText }]}>
          {formatTime(displayPosition)}
        </Text>
        <Text style={[styles.timeText, { color: colors.bibleSecondaryText }]}>
          {formatTime(displayDuration)}
        </Text>
      </View>

      <PlaybackControls
        status={isCurrentChapter ? status : 'idle'}
        playbackRate={playbackRate}
        repeatMode={repeatMode}
        sleepTimerRemaining={sleepTimerRemaining}
        hasPreviousChapter={hasPreviousChapter}
        hasNextChapter={hasNextChapter}
        onPlayPause={handlePlayDisplayedChapter}
        onPreviousChapter={handlePreviousChapter}
        onNextChapter={handleNextChapter}
        onSkipBackward={skipBackward}
        onSkipForward={skipForward}
        onChangePlaybackRate={changePlaybackRate}
        onCycleRepeatMode={cycleRepeatMode}
        onSetSleepTimer={startSleepTimer}
      />

      {error ? (
        <Text style={[styles.errorText, { color: colors.bibleAccent }]} numberOfLines={1}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    marginBottom: 6,
    justifyContent: 'center',
    height: 18,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
});
