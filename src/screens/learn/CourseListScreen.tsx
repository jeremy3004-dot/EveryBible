import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getBookById } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { useBibleStore, useProgressStore } from '../../stores';
import { harvestStudySections, type HarvestStudyEntry } from './harvestStudies';

export function CourseListScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);
  const isChapterRead = useProgressStore((state) => state.isChapterRead);

  const allStudyEntries = harvestStudySections.flatMap((section) =>
    section.groups.flatMap((group) => group.entries)
  );
  const completedCount = allStudyEntries.filter((entry) =>
    isChapterRead(entry.bookId, entry.chapter)
  ).length;

  const openStudyChapter = (entry: HarvestStudyEntry) => {
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.primaryText }]}>{t('harvest.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('harvest.chapterStudiesSubtitle', {
            defaultValue:
              'Topical chapter studies designed for full-context reading and listening across the Bible.',
          })}
        </Text>

        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.accentPrimary },
          ]}
        >
          <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
            {t('harvest.chapterStudiesBody', {
              defaultValue:
                'Each study opens full chapters so audio playback and reading stay reliable and in context across devices.',
            })}
          </Text>

          <View style={styles.metricsRow}>
            <View
              style={[
                styles.metricChip,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.primaryText }]}>
                {harvestStudySections.length}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.studies', { defaultValue: 'Studies' })}
              </Text>
            </View>
            <View
              style={[
                styles.metricChip,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.primaryText }]}>
                {allStudyEntries.length}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.chapters', { defaultValue: 'Chapters' })}
              </Text>
            </View>
            <View
              style={[
                styles.metricChip,
                { backgroundColor: colors.background, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.metricValue, { color: colors.primaryText }]}>
                {completedCount}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>
                {t('harvest.read', { defaultValue: 'Read' })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.playlist}>
          {harvestStudySections.map((section) => {
            const sectionEntries = section.groups.flatMap((group) => group.entries);
            const sectionCompletedCount = sectionEntries.filter((entry) =>
              isChapterRead(entry.bookId, entry.chapter)
            ).length;

            return (
              <View
                key={section.id}
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
                    {section.title}
                  </Text>
                </View>
                <Text style={[styles.sectionDescription, { color: colors.secondaryText }]}>
                  {section.description}
                </Text>
                <Text style={[styles.sectionProgress, { color: colors.accentPrimary }]}>
                  {sectionCompletedCount}/{sectionEntries.length}{' '}
                  {t('harvest.read', { defaultValue: 'Read' })}
                </Text>

                {section.groups.map((group) => (
                  <View key={group.id} style={styles.groupBlock}>
                    {section.groups.length > 1 ? (
                      <Text style={[styles.groupTitle, { color: colors.primaryText }]}>
                        {group.title}
                      </Text>
                    ) : null}

                    {group.entries.map((entry, index) => {
                      const isActive =
                        currentBook === entry.bookId && currentChapter === entry.chapter;
                      const read = isChapterRead(entry.bookId, entry.chapter);
                      const bookName = getBookById(entry.bookId)?.name ?? entry.bookId;
                      const reference = `${bookName} ${entry.chapter}`;

                      return (
                        <TouchableOpacity
                          key={`${section.id}:${group.id}:${entry.bookId}:${entry.chapter}`}
                          style={[
                            styles.playlistRow,
                            {
                              backgroundColor: colors.background,
                              borderColor: isActive ? colors.accentPrimary : colors.cardBorder,
                            },
                          ]}
                          onPress={() => openStudyChapter(entry)}
                          activeOpacity={0.9}
                        >
                          <View
                            style={[
                              styles.indexBadge,
                              {
                                backgroundColor: isActive
                                  ? colors.accentPrimary
                                  : colors.cardBackground,
                              },
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
                            <Text style={[styles.rowTitle, { color: colors.primaryText }]}>
                              {reference}
                            </Text>
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
                              <Ionicons
                                name="play-circle-outline"
                                size={22}
                                color={colors.accentPrimary}
                              />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
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
    padding: 16,
    gap: 12,
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
    paddingVertical: 12,
    paddingHorizontal: 8,
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
    gap: 14,
    paddingBottom: 20,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  sectionProgress: {
    fontSize: 12,
    fontWeight: '700',
  },
  groupBlock: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  playlistRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
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
