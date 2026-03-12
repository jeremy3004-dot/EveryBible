import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { useBibleStore, useProgressStore } from '../../stores';
import {
  creationToChristPlaylist,
  type CreationToChristPlaylistEntry,
} from './creationToChristPlaylist';

export function CourseListScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const isChapterRead = useProgressStore((state) => state.isChapterRead);

  const completedCount = creationToChristPlaylist.filter((entry) =>
    isChapterRead(entry.bookId, entry.chapter)
  ).length;

  const openPlaylistChapter = (entry: CreationToChristPlaylistEntry) => {
    if (!rootNavigationRef.isReady()) {
      return;
    }

    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: entry.bookId,
        chapter: entry.chapter,
        autoplayAudio: true,
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>{t('harvest.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('harvest.creationToChristSubtitle', {
            defaultValue: 'A chapter-by-chapter story arc from creation to Christ.',
          })}
        </Text>

        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.accentPrimary },
          ]}
        >
          <View style={styles.heroHeader}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accentPrimary + '18' }]}>
              <Ionicons name="play-circle" size={26} color={colors.accentPrimary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: colors.accentPrimary }]}>
                {t('harvest.chapterPlaylistEyebrow', { defaultValue: 'Chapter Playlist' })}
              </Text>
              <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                {t('harvest.creationToChristTitle', { defaultValue: 'Creation to Christ' })}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
            {t('harvest.chapterPlaylistBody', {
              defaultValue:
                'Every item opens a full Bible chapter so listening works consistently across translations and devices.',
            })}
          </Text>

          <View style={styles.metricsRow}>
            <View style={[styles.metricChip, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
              <Text style={[styles.metricValue, { color: colors.primaryText }]}>
                {creationToChristPlaylist.length}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.chapters', { defaultValue: 'Chapters' })}
              </Text>
            </View>
            <View style={[styles.metricChip, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
              <Text style={[styles.metricValue, { color: colors.primaryText }]}>{completedCount}</Text>
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.read', { defaultValue: 'Read' })}
              </Text>
            </View>
            <View style={[styles.metricChip, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
              <Ionicons name="volume-high-outline" size={16} color={colors.accentPrimary} />
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.chapterOnly', { defaultValue: 'Chapter only' })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.playlist}>
          {creationToChristPlaylist.map((entry, index) => {
            const isActive = currentBook === entry.bookId && currentChapter === entry.chapter;
            const read = isChapterRead(entry.bookId, entry.chapter);
            const bookName = getBookById(entry.bookId)?.name ?? entry.bookId;
            const reference = `${bookName} ${entry.chapter}`;

            return (
              <TouchableOpacity
                key={`${entry.bookId}:${entry.chapter}`}
                style={[
                  styles.playlistRow,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: isActive ? colors.accentPrimary : colors.cardBorder,
                  },
                ]}
                onPress={() => openPlaylistChapter(entry)}
                activeOpacity={0.9}
              >
                <View
                  style={[
                    styles.indexBadge,
                    { backgroundColor: isActive ? colors.accentPrimary : colors.background },
                  ]}
                >
                  <Text
                    style={[
                      styles.indexBadgeText,
                      { color: isActive ? '#fff' : colors.secondaryText },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: colors.primaryText }]}>{reference}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.secondaryText }]}>
                    {isActive
                      ? t('harvest.nowReading', { defaultValue: 'Now open in Bible tab' })
                      : t('harvest.playChapterSubtitle', {
                          defaultValue: 'Open and play full chapter',
                        })}
                  </Text>
                </View>

                <View style={styles.rowMeta}>
                  {read ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  ) : (
                    <Ionicons name="play-circle-outline" size={22} color={colors.accentPrimary} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 6,
    lineHeight: 22,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontWeight: '600',
  },
  playlist: {
    gap: 10,
    paddingBottom: 20,
  },
  playlistRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 13,
  },
  rowMeta: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
