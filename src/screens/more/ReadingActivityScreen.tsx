import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'react-native-calendars';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useProgressStore } from '../../stores/progressStore';
import type { MoreStackParamList } from '../../navigation/types';
import {
  buildReadingActivityMonthView,
  formatLocalDateKey,
  parseLocalDateKey,
  summarizeReadingActivity,
} from '../../services/progress/readingActivity';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

const getMonthSelectionKey = (
  viewDate: Date,
  daysByDateKey: Record<string, { dateKey: string; lastReadAt: number }>
): string | null => {
  const monthKey = formatLocalDateKey(viewDate).slice(0, 7);
  const monthDays = Object.values(daysByDateKey)
    .filter((day) => day.dateKey.startsWith(monthKey))
    .sort((a, b) => b.lastReadAt - a.lastReadAt);

  return monthDays[0]?.dateKey ?? null;
};

const formatLongDate = (dateKey: string): string => {
  return parseLocalDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function ReadingActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const streakDays = useProgressStore((state) => state.streakDays);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const activitySummary = summarizeReadingActivity(chaptersRead);
  const effectiveSelectedDateKey =
    selectedDateKey ?? getMonthSelectionKey(viewDate, activitySummary.daysByDateKey);
  const monthView = buildReadingActivityMonthView(chaptersRead, viewDate, effectiveSelectedDateKey);
  const markedDates = Object.values(activitySummary.daysByDateKey).reduce<Record<string, object>>(
    (acc, day) => {
      const isSelected = day.dateKey === effectiveSelectedDateKey;
      acc[day.dateKey] = {
        marked: true,
        dotColor: colors.accentPrimary,
        selected: isSelected,
        selectedColor: colors.accentPrimary,
        selectedTextColor: '#ffffff',
      };
      return acc;
    },
    {}
  );

  const handleDayPress = (dateKey: string) => {
    setSelectedDateKey(dateKey);
  };

  const selectedDayLabel = monthView.selectedDay
    ? formatLongDate(monthView.selectedDay.dateKey)
    : t('profile.noReadingActivityTitle');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.readingActivity')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{t('profile.readingActivity')}</Text>
          <Text style={styles.heroBody}>{t('profile.readingActivitySubtitle')}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statNumber}>{streakDays}</Text>
              <Text style={styles.statLabel}>{t('profile.streak')}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statNumber}>{monthView.totalReadDays}</Text>
              <Text style={styles.statLabel}>{t('profile.readingDays')}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statNumber}>{monthView.totalChapterReads}</Text>
              <Text style={styles.statLabel}>{t('profile.chaptersRead')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <Calendar
            current={`${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-01`}
            markedDates={markedDates}
            onDayPress={(day) => handleDayPress(day.dateString)}
            onMonthChange={(month: { year: number; month: number }) => {
              setSelectedDateKey(null);
              setViewDate(new Date(month.year, month.month - 1, 1));
            }}
            hideExtraDays={false}
            enableSwipeMonths
            theme={{
              backgroundColor: colors.cardBackground,
              calendarBackground: colors.cardBackground,
              textSectionTitleColor: colors.secondaryText,
              dayTextColor: colors.primaryText,
              monthTextColor: colors.primaryText,
              textDayFontWeight: '600',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
              selectedDayBackgroundColor: colors.accentPrimary,
              selectedDayTextColor: '#ffffff',
              todayTextColor: colors.accentPrimary,
              arrowColor: colors.primaryText,
              dotColor: colors.accentPrimary,
            }}
          />
        </View>

        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailCopy}>
              <Text style={styles.detailTitle}>{t('profile.selectedDay')}</Text>
              <Text style={styles.detailSubtitle}>
                {monthView.selectedDay ? selectedDayLabel : t('profile.tapDayHint')}
              </Text>
            </View>
            <Ionicons name="today-outline" size={24} color={colors.accentPrimary} />
          </View>

          {monthView.selectedDay ? (
            <View style={styles.detailBody}>
              <Text style={styles.detailCount}>
                {monthView.selectedDay.chapterCount}{' '}
                {monthView.selectedDay.chapterCount === 1
                  ? t('profile.chapterRead')
                  : t('profile.chaptersRead')}
              </Text>
              <Text style={styles.detailMeta}>
                {t('profile.firstReadAt', {
                  time: formatTime(monthView.selectedDay.firstReadAt),
                })}
              </Text>
              <Text style={styles.detailMeta}>
                {t('profile.lastReadAt', {
                  time: formatTime(monthView.selectedDay.lastReadAt),
                })}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={32} color={colors.secondaryText} />
              <Text style={styles.emptyTitle}>{t('profile.noReadingActivityTitle')}</Text>
              <Text style={styles.emptyBody}>{t('profile.noReadingActivityBody')}</Text>
            </View>
          )}
        </View>
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
      gap: 16,
    },
    heroCard: {
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      gap: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primaryText,
    },
    heroBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.secondaryText,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    statChip: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 4,
    },
    statNumber: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primaryText,
    },
    statLabel: {
      fontSize: 12,
      textAlign: 'center',
      color: colors.secondaryText,
    },
    calendarCard: {
      borderRadius: 18,
      padding: 8,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    detailCard: {
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      gap: 14,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    detailCopy: {
      flex: 1,
      gap: 4,
    },
    detailTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primaryText,
    },
    detailSubtitle: {
      fontSize: 13,
      color: colors.secondaryText,
      lineHeight: 18,
    },
    detailBody: {
      gap: 8,
    },
    detailCount: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primaryText,
    },
    detailMeta: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.secondaryText,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 12,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primaryText,
    },
    emptyBody: {
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      color: colors.secondaryText,
    },
  });
