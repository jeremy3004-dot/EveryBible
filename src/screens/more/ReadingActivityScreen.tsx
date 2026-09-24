import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { formatListeningTime } from '../../i18n/interfaceFormatting';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { selectCurrentStreakDays, useProgressStore } from '../../stores/progressStore';
import { useAuthStore } from '../../stores/authStore';
import type { MoreStackParamList } from '../../navigation/types';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { summarizeReadingActivity } from '../../services/progress/readingActivity';
import { layout, spacing, typography } from '../../design/system';
import { describeSyncStatus } from '../../utils/syncStatus';
import { BackArrowIcon, IconButton } from '../../components/ui';
import {
  buildSelectedDayCopy,
  CalendarCard,
  createDayLabelFormatter,
  ReadingActivityHero,
  SelectedDayCard,
  useEngagementSummary,
  useReadingActivityCalendar,
} from './readingActivity';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

export function ReadingActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The More tab's capsule floats over this screen, so the scroll has to clear it.
  const { contentClearance } = useTabBarHeight();
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const streakDays = useProgressStore(selectCurrentStreakDays);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const preferencesUpdatedAt = useAuthStore((state) => state.preferencesUpdatedAt);
  const engagement = useEngagementSummary(isAuthenticated);

  const activitySummary = useMemo(() => summarizeReadingActivity(chaptersRead), [chaptersRead]);
  // One formatter per language names every cell and the day card's eyebrow.
  const dayLabelFormatter = useMemo(() => createDayLabelFormatter(i18n.language), [i18n.language]);
  const calendar = useReadingActivityCalendar(activitySummary.daysByDateKey, dayLabelFormatter);

  const { selectedDateKey, selectedDay } = calendar;
  const dayCopy = useMemo(
    () =>
      buildSelectedDayCopy({
        dateKey: selectedDateKey,
        day: selectedDay,
        formatter: dayLabelFormatter,
        language: i18n.language,
        t,
      }),
    [dayLabelFormatter, i18n.language, selectedDateKey, selectedDay, t]
  );
  const syncStatus = describeSyncStatus({
    isAuthenticated,
    lastSyncedAt: preferencesUpdatedAt,
    t,
  });

  // Cloud engagement is the authority when it has loaded; local progress keeps
  // the row honest offline.
  const chapterTotal = engagement?.total_chapters_read ?? activitySummary.totalChapterReads;
  const listeningLabel = formatListeningTime(engagement?.total_listening_minutes ?? 0, t);

  // The card's chevron has to lead somewhere: it reopens the day's first
  // chapter, the same cross-tab jump the annotations list makes.
  const selectedChapter = dayCopy.chapter;
  const openSelectedChapter = useCallback(() => {
    if (!selectedChapter || !rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: { bookId: selectedChapter.bookId, chapter: selectedChapter.chapter },
    });
  }, [selectedChapter]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
        <View style={styles.header}>
          <IconButton
            icon={BackArrowIcon}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
          <Text style={[styles.headerEyebrow, displayFont.regular]}>
            {t('readingActivity.eyebrow')}
          </Text>
        </View>

        <ReadingActivityHero
          streakDays={streakDays}
          chapterTotal={chapterTotal}
          listeningLabel={listeningLabel}
        />

        <CalendarCard
          viewDate={calendar.viewDate}
          grid={calendar.grid}
          weeks={calendar.weeks}
          cellLabels={calendar.cellLabels}
          dayLabelFormatter={dayLabelFormatter}
          selectedDateKey={selectedDateKey}
          onSelectDay={calendar.selectDay}
          onChangeMonth={calendar.goToMonth}
        />

        <SelectedDayCard copy={dayCopy} onOpenChapter={openSelectedChapter} />

        <Text style={[styles.footer, displayFont.regular]}>{syncStatus.sourceLabel}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      marginBottom: spacing.xl,
    },
    headerEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      flexShrink: 1,
    },
    footer: {
      ...typography.eyebrowPlain,
      color: colors.secondaryText,
      textAlign: 'center',
    },
  });
