import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getBookById } from '../../constants';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import type { MoreStackParamList } from '../../navigation/types';
import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';
import { useAudioStore, useBibleStore, useLibraryStore } from '../../stores';
import { buildChapterLaunchParams } from '../bible/chapterSelectorModel';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

const formatChapterLabel = (bookId: string, chapter: number) => {
  const book = getBookById(bookId);
  return `${book?.name ?? bookId} ${chapter}`;
};

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const favorites = useLibraryStore((state) => state.favorites);
  const playlists = useLibraryStore((state) => state.playlists);
  const history = useLibraryStore((state) => state.history);
  const clearHistory = useLibraryStore((state) => state.clearHistory);
  const queue = useAudioStore((state) => state.queue);
  const clearQueue = useAudioStore((state) => state.clearQueue);

  const openChapter = (bookId: string, chapter: number) => {
    if (!rootNavigationRef.isReady()) {
      return;
    }

    trackBibleExperienceEvent({
      name: 'library_reopened',
      bookId,
      chapter,
      source: 'saved-library',
      mode: preferredChapterLaunchMode,
    });

    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: buildChapterLaunchParams(bookId, chapter, preferredChapterLaunchMode),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Library</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Keep your listening path together</Text>
          <Text style={styles.heroBody}>
            Favorites, playlists, queue, and listening history all stay on device so you can pick
            back up without a backend dependency.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Favorites</Text>
          {favorites.length > 0 ? (
            favorites.map((favorite) => (
              <TouchableOpacity
                key={favorite.id}
                style={styles.listCard}
                onPress={() => openChapter(favorite.bookId, favorite.chapter)}
              >
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>
                    {formatChapterLabel(favorite.bookId, favorite.chapter)}
                  </Text>
                  <Text style={styles.listBody}>Saved for quick return.</Text>
                </View>
                <Ionicons name="heart" size={18} color={colors.accentPrimary} />
              </TouchableOpacity>
            ))
          ) : (
            <EmptySectionCard body="Favorite a chapter from the reader to keep it here." />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playlists</Text>
          {playlists.length > 0 ? (
            playlists.map((playlist) => (
              <TouchableOpacity
                key={playlist.id}
                style={styles.listCard}
                onPress={() => {
                  const firstEntry = playlist.entries[0];
                  if (firstEntry) {
                    openChapter(firstEntry.bookId, firstEntry.chapter);
                  }
                }}
              >
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{playlist.title}</Text>
                  <Text style={styles.listBody}>
                    {playlist.entries.length} saved {playlist.entries.length === 1 ? 'chapter' : 'chapters'}
                  </Text>
                </View>
                <Ionicons name="list-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))
          ) : (
            <EmptySectionCard body="Add a chapter to the saved playlist from the reader menu." />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Queue</Text>
            {queue.length > 0 ? (
              <TouchableOpacity onPress={clearQueue}>
                <Text style={styles.clearLabel}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {queue.length > 0 ? (
            queue.map((entry, index) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.listCard}
                onPress={() => openChapter(entry.bookId, entry.chapter)}
              >
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{formatChapterLabel(entry.bookId, entry.chapter)}</Text>
                  <Text style={styles.listBody}>
                    {index === 0 ? 'Up next in your queue' : 'Queued for later listening'}
                  </Text>
                </View>
                <Ionicons name="play-forward-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))
          ) : (
            <EmptySectionCard body="Add chapters to the queue from the reader actions menu." />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Listening History</Text>
            {history.length > 0 ? (
              <TouchableOpacity onPress={clearHistory}>
                <Text style={styles.clearLabel}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {history.length > 0 ? (
            history.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.listCard}
                onPress={() => openChapter(entry.bookId, entry.chapter)}
              >
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{formatChapterLabel(entry.bookId, entry.chapter)}</Text>
                  <Text style={styles.listBody}>{Math.round(entry.progress * 100)}% heard</Text>
                </View>
                <Ionicons name="time-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))
          ) : (
            <EmptySectionCard body="Start listening to build your chapter history." />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptySectionCard({ body }: { body: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primaryText,
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      gap: 18,
    },
    heroCard: {
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      gap: 10,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.primaryText,
    },
    heroBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.secondaryText,
    },
    section: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.primaryText,
    },
    clearLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.accentPrimary,
    },
    listCard: {
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    listCopy: {
      flex: 1,
      gap: 4,
    },
    listTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primaryText,
    },
    listBody: {
      fontSize: 13,
      color: colors.secondaryText,
    },
    emptyCard: {
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    emptyBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.secondaryText,
    },
  });
