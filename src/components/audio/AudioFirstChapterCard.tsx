import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAudioPlayer } from '../../hooks';
import { getBookById, getBookIcon } from '../../constants';
import { useBibleStore } from '../../stores';
import { getAdjacentAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { AudioProgressScrubber } from './AudioProgressScrubber';
import { PlaybackControls } from './PlaybackControls';
import type { AudioPlaybackSequenceEntry } from '../../types';

interface AudioFirstChapterCardProps {
  bookId: string;
  chapter: number;
  translationLabel: string;
  playbackSequenceEntries?: AudioPlaybackSequenceEntry[];
  onChapterChange?: (bookId: string, chapter: number) => void;
  onShare?: () => void;
}

export function AudioFirstChapterCard({
  bookId,
  chapter,
  translationLabel,
  playbackSequenceEntries = [],
  onChapterChange,
  onShare,
}: AudioFirstChapterCardProps) {
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
    backgroundMusicChoice,
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
    changeBackgroundMusicChoice,
  } = useAudioPlayer(currentTranslation);

  const book = getBookById(bookId);
  const isCurrentChapter =
    currentTranslationId === currentTranslation &&
    currentBookId === bookId &&
    currentChapter === chapter;
  const previousSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    playbackSequenceEntries,
    bookId,
    chapter,
    -1
  );
  const nextSequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    playbackSequenceEntries,
    bookId,
    chapter,
    1
  );
  const previousNavigationTarget =
    previousSequenceEntry ?? (chapter > 1 ? { bookId, chapter: chapter - 1 } : null);
  const nextNavigationTarget =
    nextSequenceEntry ?? (book && chapter < book.chapters ? { bookId, chapter: chapter + 1 } : null);
  const displayPosition = isCurrentChapter ? currentPosition : 0;
  const displayDuration = isCurrentChapter ? duration : 0;
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

  const handleSeek = (positionMs: number) => {
    if (!isCurrentChapter || displayDuration <= 0) {
      return;
    }

    void seekTo(Math.max(0, Math.min(displayDuration, positionMs)));
  };

  const handlePreviousChapter = async () => {
    if (isCurrentChapter) {
      const target = await previousChapter();
      if (target) {
        onChapterChange?.(target.bookId, target.chapter);
      }
      return;
    }

    if (previousNavigationTarget) {
      await playChapter(previousNavigationTarget.bookId, previousNavigationTarget.chapter);
      onChapterChange?.(previousNavigationTarget.bookId, previousNavigationTarget.chapter);
    }
  };

  const handleNextChapter = async () => {
    if (isCurrentChapter) {
      const target = await nextChapter();
      if (target) {
        onChapterChange?.(target.bookId, target.chapter);
      }
      return;
    }

    if (nextNavigationTarget) {
      await playChapter(nextNavigationTarget.bookId, nextNavigationTarget.chapter);
      onChapterChange?.(nextNavigationTarget.bookId, nextNavigationTarget.chapter);
    }
  };

  const hasPreviousChapter = previousNavigationTarget != null;
  const hasNextChapter = nextNavigationTarget != null;
  const remainingDuration = Math.max(displayDuration - displayPosition, 0);

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

      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={[styles.title, { color: colors.biblePrimaryText }]}>
            {book?.name} {chapter}
          </Text>
          <Text style={[styles.subtitle, { color: colors.bibleSecondaryText }]}>
            {translationLabel}
          </Text>
        </View>

      </View>

      <View style={styles.controlBlock}>
        <AudioProgressScrubber
          position={displayPosition}
          duration={displayDuration}
          onSeek={handleSeek}
          trackColor={colors.bibleDivider}
          fillColor={colors.bibleAccent}
          containerStyle={styles.progressContainer}
          trackStyle={styles.progressTrack}
          fillStyle={styles.progressFill}
        />

        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: colors.bibleSecondaryText }]}>
            {formatTime(displayPosition)}
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
          repeatMode={repeatMode}
          sleepTimerRemaining={sleepTimerRemaining}
          backgroundMusicChoice={backgroundMusicChoice}
          hasPreviousChapter={hasPreviousChapter}
          hasNextChapter={hasNextChapter}
          onPlayPause={handlePlayPause}
          onPreviousChapter={handlePreviousChapter}
          onNextChapter={handleNextChapter}
          onSkipBackward={skipBackward}
          onSkipForward={skipForward}
          onChangePlaybackRate={changePlaybackRate}
          onCycleRepeatMode={cycleRepeatMode}
          onSetSleepTimer={startSleepTimer}
          onChangeBackgroundMusicChoice={changeBackgroundMusicChoice}
          onShareAudio={onShare}
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
    flex: 1,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
