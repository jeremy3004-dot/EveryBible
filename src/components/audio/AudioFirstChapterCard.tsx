import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAudioPlayer } from '../../hooks';
import { getBookById, getBookIcon } from '../../constants';
import { useBibleStore } from '../../stores';
import { PlaybackControls } from './PlaybackControls';

interface AudioFirstChapterCardProps {
  bookId: string;
  chapter: number;
  translationLabel: string;
  onChapterChange?: (chapter: number) => void;
}

export function AudioFirstChapterCard({
  bookId,
  chapter,
  translationLabel,
  onChapterChange,
}: AudioFirstChapterCardProps) {
  const { colors } = useTheme();
  const currentTranslation = useBibleStore((state) => state.currentTranslation);

  const {
    status,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    playbackRate,
    sleepTimerRemaining,
    playChapter,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    startSleepTimer,
  } = useAudioPlayer(currentTranslation);

  const book = getBookById(bookId);
  const isCurrentChapter = currentBookId === bookId && currentChapter === chapter;
  const progress = duration > 0 ? (currentPosition / duration) * 100 : 0;

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!isCurrentChapter) {
      void playChapter(bookId, chapter);
      return;
    }

    void togglePlayPause();
  };

  const handleSeek = (locationX: number, width: number) => {
    if (duration <= 0 || width <= 0) {
      return;
    }

    const percentage = locationX / width;
    const newPosition = percentage * duration;
    void seekTo(Math.max(0, Math.min(duration, newPosition)));
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
      if (currentBookId && currentChapter && book && currentChapter < book.chapters) {
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
  const hasNextChapter =
    currentChapter && book ? currentChapter < book.chapters : chapter < (book?.chapters ?? 1);
  const remainingDuration = Math.max(duration - currentPosition, 0);

  return (
    <View style={styles.card}>
      <View
        style={[
          styles.artworkFrame,
          {
            backgroundColor: colors.bibleElevatedSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <Image source={getBookIcon(bookId)} style={styles.artwork} resizeMode="cover" />
      </View>

      <View style={styles.metaBlock}>
        <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
          {book?.name} {chapter}
        </Text>
        <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
          {translationLabel}
        </Text>
      </View>

      <View style={styles.controlBlock}>
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
            {formatTime(currentPosition)}
          </Text>
          <Text style={[styles.timeCenterText, { color: colors.bibleSecondaryText }]}>
            {book?.name} {chapter}
          </Text>
          <Text style={[styles.timeText, { color: colors.bibleSecondaryText }]}>
            -{formatTime(remainingDuration)}
          </Text>
        </View>

        <PlaybackControls
          variant="chapter-only"
          status={isCurrentChapter ? status : 'idle'}
          playbackRate={playbackRate}
          sleepTimerRemaining={sleepTimerRemaining}
          hasPreviousChapter={hasPreviousChapter}
          hasNextChapter={hasNextChapter}
          onPlayPause={handlePlayPause}
          onPreviousChapter={handlePreviousChapter}
          onNextChapter={handleNextChapter}
          onSkipBackward={skipBackward}
          onSkipForward={skipForward}
          onChangePlaybackRate={changePlaybackRate}
          onSetSleepTimer={startSleepTimer}
        />

        {error ? (
          <Text style={[styles.errorText, { color: colors.bibleAccent }]} numberOfLines={2}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingBottom: 12,
    gap: 24,
    justifyContent: 'space-between',
  },
  artworkFrame: {
    alignSelf: 'stretch',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  metaBlock: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  controlBlock: {
    gap: 18,
  },
  progressContainer: {
    justifyContent: 'center',
    height: 18,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeCenterText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
