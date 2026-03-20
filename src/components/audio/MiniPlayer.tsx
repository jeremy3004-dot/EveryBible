import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigationState } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { getBookById } from '../../constants';
import { useAudioPlayer } from '../../hooks';
import { useAudioStore, useBibleStore } from '../../stores';
import { rootNavigationRef } from '../../navigation/rootNavigation';

export function MiniPlayer() {
  const { colors } = useTheme();
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const setCurrentTrack = useAudioStore((state) => state.setCurrentTrack);
  const clearQueue = useAudioStore((state) => state.clearQueue);
  const currentRouteName = useNavigationState((state) => {
    const navigationState = state as {
      index: number;
      routes: Array<{ name: string; state?: unknown }>;
    };
    let route = navigationState.routes[navigationState.index];

    while (route?.state && typeof route.state === 'object' && 'index' in route.state && 'routes' in route.state) {
      const nestedState = route.state as {
        index: number;
        routes: Array<{ name: string; state?: unknown }>;
      };
      route = nestedState.routes[nestedState.index];
    }

    return route?.name;
  });
  const {
    status,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    lastPlayedBookId,
    lastPlayedChapter,
    togglePlayPause,
    stop,
  } = useAudioPlayer(currentTranslation);

  const displayBookId = currentBookId ?? lastPlayedBookId;
  const displayChapter = currentChapter ?? lastPlayedChapter;
  const book = displayBookId ? getBookById(displayBookId) : null;
  const progress =
    duration > 0 ? currentPosition / duration : status === 'idle' ? 0 : 0.05;

  if (!book || !displayChapter || currentRouteName === 'BibleReader') {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.shell}>
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

          rootNavigationRef.navigate('Bible', {
            screen: 'BibleReader',
            params: {
              bookId: book.id,
              chapter: displayChapter,
              preferredMode: 'listen',
            },
          });
        }}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.primaryText }]} numberOfLines={1}>
            {book.name} {displayChapter}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]} numberOfLines={1}>
            {status === 'playing' ? 'Now playing' : 'Ready to resume'}
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
              setCurrentTrack(null, null);
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
    bottom: 74,
    paddingHorizontal: 16,
  },
  container: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  copy: {
    marginRight: 92,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  controls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    marginTop: 12,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
});
