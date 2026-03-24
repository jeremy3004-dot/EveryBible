import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { getBookById } from '../../constants';
import { useAudioPlayer } from '../../hooks';
import { useAudioStore, useBibleStore } from '../../stores';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { layout, radius, spacing, shadows, typography } from '../../design/system';

interface MiniPlayerProps {
  currentRouteName: string | null;
}

export function MiniPlayer({ currentRouteName }: MiniPlayerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = layout.tabBarBaseHeight + insets.bottom;
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setCurrentTrack = useAudioStore((state) => state.setCurrentTrack);
  const clearQueue = useAudioStore((state) => state.clearQueue);
  const playbackSequence = useAudioStore((state) => state.playbackSequence);
  const clearPlaybackSequence = useAudioStore((state) => state.clearPlaybackSequence);
  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    togglePlayPause,
    stop,
  } = useAudioPlayer(currentTranslation);

  const displayTranslationId = currentTranslationId ?? lastPlayedTranslationId;
  const displayBookId = currentBookId ?? lastPlayedBookId;
  const displayChapter = currentChapter ?? lastPlayedChapter;
  const book = displayBookId ? getBookById(displayBookId) : null;
  const progress =
    duration > 0 ? currentPosition / duration : status === 'idle' ? 0 : 0.05;

  if (!book || !displayChapter || currentRouteName === 'BibleReader') {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.shell, { bottom: tabBarHeight + spacing.sm }]}>
      <TouchableOpacity
        style={[
          styles.container,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
          },
        ]}
        activeOpacity={0.92}
        onPress={() => {
          if (!rootNavigationRef.isReady()) {
            return;
          }

          if (displayTranslationId && displayTranslationId !== currentTranslation) {
            setCurrentTranslation(displayTranslationId);
          }

          rootNavigationRef.navigate('Bible', {
            screen: 'BibleReader',
            params: {
              bookId: book.id,
              chapter: displayChapter,
              preferredMode: 'listen',
              playbackSequenceEntries:
                playbackSequence.length > 0 ? playbackSequence : undefined,
            },
          });
        }}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.primaryText }]} numberOfLines={1}>
            {book.name} {displayChapter}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]} numberOfLines={1}>
            {status === 'playing' ? t('audio.nowPlaying') : t('audio.readyToResume')}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.iconButton} onPress={() => void togglePlayPause()}>
            <Ionicons
              name={status === 'playing' ? 'pause' : 'play'}
              size={20}
              color={colors.primaryText}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              clearQueue();
              clearPlaybackSequence();
              setCurrentTrack(null, null, null);
              void stop();
            }}
          >
            <Ionicons name="close" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(Math.max(progress, 0.05), 1) * 100}%`,
                backgroundColor: colors.accentPrimary,
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: layout.screenPadding,
  },
  container: {
    ...shadows.floating,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: layout.denseCardPadding,
    paddingTop: 14,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  copy: {
    marginRight: 92,
    gap: 3,
  },
  title: {
    ...typography.cardTitle,
  },
  subtitle: {
    ...typography.micro,
  },
  controls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    marginTop: spacing.md,
    height: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
