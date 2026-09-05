import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { buildCalendarLocale, formatListeningTime } from '../../i18n/interfaceFormatting';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useProgressStore } from '../../stores/progressStore';
import { useAuthStore } from '../../stores/authStore';
import type { MoreStackParamList } from '../../navigation/types';
import {
  buildReadingActivityMonthView,
  formatLocalDateKey,
  parseLocalDateKey,
  summarizeReadingActivity,
} from '../../services/progress/readingActivity';
import { getEngagementSummary, refreshEngagement } from '../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../services/supabase/types';
import { layout, radius, spacing, typography } from '../../design/system';
import { hexWithAlpha } from '../../utils';
import { StatCard } from '../../components/ui/StatCard';

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

const formatLongDate = (dateKey: string, language: string): string => {
  return parseLocalDateKey(dateKey).toLocaleDateString(language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (timestamp: number, language: string): string => {
  return new Date(timestamp).toLocaleTimeString(language, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function ReadingActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const calendarLocale = useMemo(
    () => buildCalendarLocale(i18n.language, t('home.today')),
    [i18n.language, t]
  );
  const [calendarLanguage, setCalendarLanguage] = useState<string | null>(null);
  useEffect(() => {
    LocaleConfig.locales[i18n.language] = calendarLocale;
    LocaleConfig.defaultLocale = i18n.language;
    // Calendar reads this external registry only when it mounts; wait for registration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarLanguage(i18n.language);
  }, [calendarLocale, i18n.language]);
  const styles = createStyles(colors);
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const streakDays = useProgressStore((state) => state.streakDays);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<UserEngagementSummary | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    // Fire-and-forget refresh so the summary row is up-to-date before we read it
    refreshEngagement()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        return getEngagementSummary();
      })
      .then((result) => {
        if (!cancelled && result?.success && result.data) {
          setEngagement(result.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const activitySummary = summarizeReadingActivity(chaptersRead);
  // Streak milestones escalate the flame color at 7 / 30 / 100 days.
  const streakTint =
    streakDays >= 100
      ? colors.warning
      : streakDays >= 30
        ? colors.accentPrimary
        : streakDays >= 7
          ? colors.success
          : undefined;
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
        selectedTextColor: colors.onAccent,
      };
      return acc;
    },
    {}
  );

  const handleDayPress = (dateKey: string) => {
    setSelectedDateKey(dateKey);
  };

  const selectedDayLabel = monthView.selectedDay
    ? formatLongDate(monthView.selectedDay.dateKey, i18n.language)
    : t('profile.noReadingActivityTitle');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.readingActivity')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{t('profile.readingActivity')}</Text>
          <Text style={styles.heroBody}>{t('profile.readingActivitySubtitle')}</Text>

          {engagement && (
            <View style={styles.engagementRow}>
              <View style={styles.engagementChip}>
                <Ionicons name="book-outline" size={14} color={colors.accentPrimary} />
                <Text style={styles.engagementChipValue}>{engagement.total_chapters_read}</Text>
                <Text style={styles.engagementChipLabel}>{t('engagement.totalChapters')}</Text>
              </View>
              <View style={styles.engagementDivider} />
              <View style={styles.engagementChip}>
                <Ionicons name="headset-outline" size={14} color={colors.accentPrimary} />
                <Text style={styles.engagementChipValue}>
                  {formatListeningTime(engagement.total_listening_minutes, t)}
                </Text>
                <Text style={styles.engagementChipLabel}>{t('engagement.totalListening')}</Text>
              </View>
            </View>
          )}

          <View style={styles.statsRow}>
            <StatCard
              icon="flame"
              value={streakDays}
              label={t('profile.streak')}
              tint={streakTint}
              style={styles.statCardFlex}
            />
            <StatCard
              icon="calendar-clear-outline"
              value={monthView.totalReadDays}
              label={t('profile.readingDays')}
              style={styles.statCardFlex}
            />
            <StatCard
              icon="book-outline"
              value={monthView.totalChapterReads}
              label={t('profile.chaptersRead')}
              style={styles.statCardFlex}
            />
          </View>
        </View>

        <View style={styles.calendarCard}>
          {calendarLanguage === i18n.language && (
            <Calendar
              key={i18n.language}
              testID="reading-activity-calendar"
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
                selectedDayTextColor: colors.onAccent,
                todayTextColor: colors.accentPrimary,
                arrowColor: colors.primaryText,
                dotColor: colors.accentPrimary,
                textDisabledColor: hexWithAlpha(colors.secondaryText, 0.33),
              }}
            />
          )}
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
                  time: formatTime(monthView.selectedDay.firstReadAt, i18n.language),
                })}
              </Text>
              <Text style={styles.detailMeta}>
                {t('profile.lastReadAt', {
                  time: formatTime(monthView.selectedDay.lastReadAt, i18n.language),
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
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: layout.screenPadding,
      gap: layout.cardGap,
    },
    heroCard: {
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      gap: spacing.lg,
    },
    heroTitle: {
      ...typography.sectionTitle,
      color: colors.primaryText,
    },
    heroBody: {
      ...typography.body,
      lineHeight: 21,
      color: colors.secondaryText,
    },
    engagementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    engagementChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    engagementChipValue: {
      ...typography.label,
      color: colors.primaryText,
      fontVariant: ['tabular-nums'],
    },
    engagementChipLabel: {
      ...typography.micro,
      color: colors.secondaryText,
      flexShrink: 1,
    },
    engagementDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.cardBorder,
      marginHorizontal: spacing.md,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    statCardFlex: {
      flex: 1,
    },
    statChip: {
      flex: 1,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    statNumber: {
      ...typography.cardTitle,
      fontSize: 22,
      lineHeight: 26,
      color: colors.primaryText,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      ...typography.micro,
      textAlign: 'center',
      color: colors.secondaryText,
    },
    calendarCard: {
      borderRadius: radius.lg,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    detailCard: {
      borderRadius: radius.lg,
      padding: layout.denseCardPadding,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      gap: spacing.md,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    detailCopy: {
      flex: 1,
      gap: spacing.xs,
    },
    detailTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    detailSubtitle: {
      ...typography.micro,
      color: colors.secondaryText,
      lineHeight: 18,
    },
    detailBody: {
      gap: spacing.sm,
    },
    detailCount: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    detailMeta: {
      ...typography.micro,
      lineHeight: 18,
      color: colors.secondaryText,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    emptyTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    emptyBody: {
      ...typography.micro,
      lineHeight: 18,
      textAlign: 'center',
      color: colors.secondaryText,
    },
  });
