import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTranslatedBookName } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { useBibleStore } from '../../stores';
import {
  getHarvestStudySectionPlaybackSequence,
  harvestStudySections,
  type HarvestStudyEntry,
} from './harvestStudies';
import { layout, radius, spacing, typography } from '../../design/system';
import type { LearnStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<LearnStackParamList, 'GatherHome'>;

export function CourseListScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const currentBook = useBibleStore((state) => state.currentBook);
  const currentChapter = useBibleStore((state) => state.currentChapter);

  const allStudyEntries = harvestStudySections.flatMap((section) =>
    section.groups.flatMap((group) => group.entries)
  );

  const openStudyChapter = (entry: HarvestStudyEntry, playbackSequenceEntries: HarvestStudyEntry[]) => {
    if (!rootNavigationRef.isReady()) {
      return;
    }

    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: entry.bookId,
        chapter: entry.chapter,
        autoplayAudio: true,
        playbackSequenceEntries,
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

        {/* Reading Plans entry card */}
        <TouchableOpacity
          onPress={() => navigation.navigate('ReadingPlanList')}
          activeOpacity={0.85}
          style={[
            styles.readingPlansCard,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('readingPlans.title')}
        >
          <View style={styles.readingPlansIcon}>
            <Ionicons name="calendar-outline" size={24} color={colors.accentPrimary} />
          </View>
          <View style={styles.readingPlansContent}>
            <Text style={[styles.readingPlansTitle, { color: colors.primaryText }]}>
              {t('readingPlans.title')}
            </Text>
            <Text style={[styles.readingPlansSubtitle, { color: colors.secondaryText }]}>
              {t('readingPlans.browsePlans')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </TouchableOpacity>

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
          </View>
        </View>

        <View style={styles.playlist}>
          {harvestStudySections.map((section) => {
            const playbackSequenceEntries = getHarvestStudySectionPlaybackSequence(section);

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
                      const bookName = getTranslatedBookName(entry.bookId, t);
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
                          onPress={() => openStudyChapter(entry, playbackSequenceEntries)}
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
                                { color: isActive ? colors.cardBackground : colors.secondaryText },
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
                            <Ionicons
                              name="play-circle-outline"
                              size={22}
                              color={colors.accentPrimary}
                            />
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
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  title: {
    ...typography.pageTitle,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    gap: spacing.md,
  },
  heroBody: {
    ...typography.body,
    lineHeight: 21,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricValue: {
    ...typography.cardTitle,
  },
  metricLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  playlist: {
    gap: spacing.md,
    paddingBottom: layout.cardPadding,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.cardTitle,
  },
  sectionDescription: {
    ...typography.micro,
    lineHeight: 19,
  },
  groupBlock: {
    gap: spacing.sm,
  },
  groupTitle: {
    ...typography.eyebrow,
    marginTop: 2,
  },
  playlistRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: {
    ...typography.label,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
  },
  rowSubtitle: {
    ...typography.micro,
  },
  rowMeta: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingPlansCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTouchTarget + spacing.md,
  },
  readingPlansIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingPlansContent: {
    flex: 1,
    gap: 2,
  },
  readingPlansTitle: {
    ...typography.bodyStrong,
  },
  readingPlansSubtitle: {
    ...typography.micro,
  },
});
