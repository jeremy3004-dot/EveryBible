import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
    >
      <View
        style={[
          styles.iconShell,
          {
            backgroundColor: colors.bibleElevatedSurface,
            borderColor: colors.bibleDivider,
          },
        ]}
      >
        <Image source={getBookIcon(bookId)} style={styles.icon} resizeMode="contain" />
      </View>

      <View style={styles.copyBlock}>
        <Text style={[styles.badge, { color: colors.bibleAccent }]}>
          {t('bible.audioOnlyTitle')}
        </Text>
        <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
          {book?.name} {chapter}
        </Text>
        <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
          {t('bible.audioOnlyBody', { translation: translationLabel })}
        </Text>
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
          {formatTime(currentPosition)}
        </Text>
        <Text style={[styles.timeText, { color: colors.bibleSecondaryText }]}>
          {formatTime(duration)}
        </Text>
      </View>

      <PlaybackControls
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
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 18,
  },
  iconShell: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  icon: {
    width: 52,
    height: 52,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
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
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
