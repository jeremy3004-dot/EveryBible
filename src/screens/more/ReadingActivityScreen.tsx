import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { formatListeningTime } from '../../i18n/interfaceFormatting';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useDisplayFont, useTabBarHeight } from '../../hooks';
import { useProgressStore } from '../../stores/progressStore';
import { useAuthStore } from '../../stores/authStore';
import { getBookById, getTranslatedBookName } from '../../constants/books';
import type { MoreStackParamList } from '../../navigation/types';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import {
  formatLocalDateKey,
  parseLocalDateKey,
  summarizeReadingActivity,
} from '../../services/progress/readingActivity';
import { getEngagementSummary, refreshEngagement } from '../../services/analytics/analyticsService';
import type { UserEngagementSummary } from '../../services/supabase/types';
import { layout, radius, spacing, typography } from '../../design/system';
import { describeSyncStatus } from '../../utils/syncStatus';
import { AppCard, IconButton } from '../../components/ui';
import {
  buildReadingActivityGrid,
  buildWeekdayInitials,
  CALENDAR_COLUMN_COUNT,
  firstChapterOfDay,
  shiftMonth,
  summarizeDayChapters,
  type ReadingActivityGridCell,
} from './readingActivityCalendarModel';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList>;

const CELL_GAP = spacing.sm - 2; // 6pt gutter between calendar squares
const CELL_RADIUS = radius.sm; // 6
const SELECTED_RING_GAP = 2;
const SELECTED_RING_WIDTH = 1.5;
const TODAY_BORDER_WIDTH = 1.5;
const LEGEND_SWATCH = 12;
const LEADING_DAY_OPACITY = 0.4;
/** Pre-measurement cell size, so the card does not jump on first layout. */
const ESTIMATED_CELL_SIZE = 40;
const MINUTE_MS = 60_000;

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

const formatMonthTitle = (viewDate: Date, language: string): string =>
  viewDate.toLocaleDateString(language, { month: 'long', year: 'numeric' });

const formatDayEyebrow = (dateKey: string, language: string): string =>
  parseLocalDateKey(dateKey).toLocaleDateString(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const formatTime = (timestamp: number, language: string): string =>
  new Date(timestamp).toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' });

export function ReadingActivityScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The More tab's capsule floats over this screen, so the scroll has to clear it.
  const { contentClearance } = useTabBarHeight();
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const streakDays = useProgressStore((state) => state.streakDays);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const preferencesUpdatedAt = useAuthStore((state) => state.preferencesUpdatedAt);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<UserEngagementSummary | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

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

  const activitySummary = useMemo(() => summarizeReadingActivity(chaptersRead), [chaptersRead]);
  const effectiveSelectedDateKey =
    selectedDateKey ?? getMonthSelectionKey(viewDate, activitySummary.daysByDateKey);
  const grid = useMemo(
    () =>
      buildReadingActivityGrid({
        daysByDateKey: activitySummary.daysByDateKey,
        viewDate,
        selectedDateKey: effectiveSelectedDateKey,
      }),
    [activitySummary.daysByDateKey, viewDate, effectiveSelectedDateKey]
  );
  const weekdayInitials = useMemo(() => buildWeekdayInitials(i18n.language), [i18n.language]);
  const selectedDay = effectiveSelectedDateKey
    ? (activitySummary.daysByDateKey[effectiveSelectedDateKey] ?? null)
    : null;

  const syncStatus = describeSyncStatus({
    isAuthenticated,
    lastSyncedAt: preferencesUpdatedAt,
    t,
  });

  // Cloud engagement is the authority when it has loaded; local progress keeps
  // the row honest offline.
  const chapterTotal = engagement?.total_chapters_read ?? activitySummary.totalChapterReads;
  const listeningLabel = formatListeningTime(engagement?.total_listening_minutes ?? 0, t);

  // Exact, not floored: the grid, the weekday headers and the card's right edge
  // all have to line up, and 7 floored cells can leave a visible strip of slack.
  const cellSize =
    gridWidth > 0
      ? (gridWidth - CELL_GAP * (CALENDAR_COLUMN_COUNT - 1)) / CALENDAR_COLUMN_COUNT
      : 0;
  const measuredCell = cellSize || ESTIMATED_CELL_SIZE;

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);

  const goToMonth = (delta: number) => {
    setSelectedDateKey(null);
    setViewDate((current) => shiftMonth(current, delta));
  };

  const resolveBook = (bookId: string) => ({
    name: getTranslatedBookName(bookId, t as (key: string) => string),
    order: getBookById(bookId)?.order ?? Number.MAX_SAFE_INTEGER,
  });
  const selectedBooks = selectedDay
    ? summarizeDayChapters(selectedDay.chapterKeys, resolveBook)
    : '';
  const sessionMinutes = selectedDay
    ? Math.round((selectedDay.lastReadAt - selectedDay.firstReadAt) / MINUTE_MS)
    : 0;
  // The card's chevron has to lead somewhere: it reopens the day's first
  // chapter, the same cross-tab jump the annotations list makes.
  const selectedChapter = selectedDay
    ? firstChapterOfDay(selectedDay.chapterKeys, resolveBook)
    : null;

  const openSelectedChapter = () => {
    if (!selectedChapter || !rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: { bookId: selectedChapter.bookId, chapter: selectedChapter.chapter },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
        <View style={styles.header}>
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
          <Text style={[styles.headerEyebrow, displayFont.regular]}>
            {t('readingActivity.eyebrow')}
          </Text>
        </View>

        {/* Hero: the streak is the headline, totals ride the right rail. */}
        <View style={styles.hero}>
          <View style={styles.heroStreak}>
            <Text style={[styles.heroEyebrow, displayFont.regular]}>
              {t('readingActivity.currentStreak')}
            </Text>
            <View style={styles.heroStreakRow}>
              <Text style={styles.heroStreakNumber}>{streakDays}</Text>
              <Text style={[styles.heroStreakUnit, displayFont.bold]}>
                {t('readingActivity.days')}
              </Text>
            </View>
          </View>
          <View style={styles.heroTotals}>
            <Text style={styles.heroTotalValue}>{chapterTotal}</Text>
            <Text style={[styles.heroTotalLabel, displayFont.regular]}>
              {t('readingActivity.chapters')}
            </Text>
            <Text style={[styles.heroTotalValue, styles.heroTotalValueSpaced]}>
              {listeningLabel}
            </Text>
            <Text style={[styles.heroTotalLabel, displayFont.regular]}>
              {t('readingActivity.listening')}
            </Text>
          </View>
        </View>

        <AppCard padding={0} style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={[styles.monthTitle, displayFont.bold]} numberOfLines={2}>
              {formatMonthTitle(viewDate, i18n.language)}
            </Text>
            <View style={styles.monthNav}>
              <IconButton
                icon={ChevronLeft}
                size={30}
                iconSize={14}
                onPress={() => goToMonth(-1)}
                accessibilityLabel={t('readingActivity.previousMonth')}
              />
              <IconButton
                icon={ChevronRight}
                size={30}
                iconSize={14}
                onPress={() => goToMonth(1)}
                accessibilityLabel={t('readingActivity.nextMonth')}
              />
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayInitials.map((initial, index) => (
              <Text
                key={`weekday-${index}`}
                style={[styles.weekday, displayFont.regular, { width: measuredCell }]}
              >
                {initial}
              </Text>
            ))}
          </View>

          <View
            testID="reading-activity-calendar"
            style={[
              styles.grid,
              { minHeight: grid.rowCount * (measuredCell + CELL_GAP) - CELL_GAP },
            ]}
            onLayout={handleGridLayout}
          >
            {grid.cells.map((cell) => (
              <CalendarCell
                key={cell.dateKey}
                cell={cell}
                size={cellSize}
                colors={colors}
                styles={styles}
                label={formatDayEyebrow(cell.dateKey, i18n.language)}
                onPress={() => setSelectedDateKey(cell.dateKey)}
              />
            ))}
          </View>

          <View style={styles.legend}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.accentPrimary }]} />
            <Text style={[styles.legendLabel, displayFont.regular]}>
              {t('readingActivity.legendRead')}
            </Text>
            <View style={[styles.legendSwatch, styles.legendSwatchToday, styles.legendSpacer]} />
            <Text style={[styles.legendLabel, displayFont.regular]}>
              {t('readingActivity.legendToday')}
            </Text>
            <Text style={[styles.legendProgress, displayFont.regular]}>
              {t('readingActivity.legendProgress', {
                read: grid.readDays,
                elapsed: grid.elapsedDays,
              })}
            </Text>
          </View>
        </AppCard>

        <AppCard
          accentRule
          padding={layout.cardPadding}
          style={styles.dayCard}
          pressable={Boolean(selectedChapter)}
          onPress={selectedChapter ? openSelectedChapter : undefined}
          accessibilityLabel={
            effectiveSelectedDateKey
              ? formatDayEyebrow(effectiveSelectedDateKey, i18n.language)
              : undefined
          }
        >
          <View style={styles.dayRow}>
            <View style={styles.dayCopy}>
              <Text style={[styles.dayEyebrow, displayFont.regular]}>
                {effectiveSelectedDateKey
                  ? formatDayEyebrow(effectiveSelectedDateKey, i18n.language)
                  : t('readingActivity.legendToday')}
              </Text>
              {selectedDay ? (
                <>
                  <Text style={styles.daySummary}>
                    {t('readingActivity.dayChapters', {
                      count: selectedDay.chapterCount,
                      books: selectedBooks,
                    })}
                  </Text>
                  {sessionMinutes > 0 ? (
                    <Text style={styles.dayWindow}>
                      {t('readingActivity.sessionWindow', {
                        start: formatTime(selectedDay.firstReadAt, i18n.language),
                        end: formatTime(selectedDay.lastReadAt, i18n.language),
                        duration: formatListeningTime(sessionMinutes, t),
                      })}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.daySummary}>{t('readingActivity.noReading')}</Text>
                  <Text style={styles.dayWindow}>{t('readingActivity.noReadingHint')}</Text>
                </>
              )}
            </View>
            {selectedChapter ? (
              <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
            ) : null}
          </View>
        </AppCard>

        <Text style={[styles.footer, displayFont.regular]}>{syncStatus.sourceLabel}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface CalendarCellProps {
  cell: ReadingActivityGridCell;
  size: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  label: string;
  onPress: () => void;
}

// One square. Read days carry the accent fill, today is outlined in a dashed
// accent hairline, everything else is an inert `muted` well. The selection ring
// is drawn as two nested borders bleeding into the 6pt gutter so it never
// changes the cell's own size.
function CalendarCell({ cell, size, colors, styles, label, onPress }: CalendarCellProps) {
  const isRead = cell.state === 'read';
  const isToday = cell.state === 'today';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.cellSlot, { width: size, height: size }, !cell.inMonth && styles.cellLeading]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: cell.isSelected }}
    >
      <View
        style={[
          styles.cell,
          {
            backgroundColor: isRead ? colors.accentPrimary : isToday ? 'transparent' : colors.muted,
          },
          isToday && { borderColor: colors.accentPrimary },
          isToday && styles.cellToday,
        ]}
      >
        <Text
          style={[
            styles.cellLabel,
            {
              color: isRead
                ? colors.onAccent
                : isToday
                  ? colors.accentPrimary
                  : colors.textTertiary,
            },
          ]}
        >
          {cell.day}
        </Text>
      </View>
      {cell.isSelected ? (
        <>
          <View
            pointerEvents="none"
            style={[styles.selectionInnerRing, { borderColor: colors.cardBackground }]}
          />
          <View
            pointerEvents="none"
            style={[styles.selectionOuterRing, { borderColor: colors.primaryText }]}
          />
        </>
      ) : null}
    </Pressable>
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
    hero: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.primaryText,
      marginBottom: spacing.xl,
    },
    heroStreak: {
      flexShrink: 1,
    },
    heroEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginBottom: spacing.sm,
    },
    heroStreakRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    heroStreakNumber: {
      ...typography.numeralStreak,
      color: colors.primaryText,
    },
    heroStreakUnit: {
      ...typography.sectionHeading,
      fontSize: 20,
      lineHeight: 20,
      letterSpacing: -0.5,
      color: colors.secondaryText,
    },
    heroTotals: {
      alignItems: 'flex-end',
    },
    heroTotalValue: {
      ...typography.numeralRow,
      fontSize: 22,
      lineHeight: 22,
      letterSpacing: -0.88,
      color: colors.primaryText,
      textAlign: 'right',
    },
    heroTotalValueSpaced: {
      marginTop: spacing.md,
    },
    heroTotalLabel: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginTop: spacing.xs,
      textAlign: 'right',
    },
    calendarCard: {
      paddingTop: 14,
      paddingHorizontal: layout.cardPadding,
      paddingBottom: layout.cardPadding,
      marginBottom: layout.cardGap,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    monthTitle: {
      ...typography.sectionHeading,
      color: colors.primaryText,
      flexShrink: 1,
    },
    monthNav: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    weekdayRow: {
      flexDirection: 'row',
      gap: CELL_GAP,
      marginBottom: spacing.sm,
    },
    weekday: {
      ...typography.eyebrow,
      letterSpacing: 0,
      color: colors.secondaryText,
      textAlign: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: CELL_GAP,
    },
    cellSlot: {
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    cellLeading: {
      opacity: LEADING_DAY_OPACITY,
    },
    cell: {
      flex: 1,
      borderRadius: CELL_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellToday: {
      borderWidth: TODAY_BORDER_WIDTH,
      borderStyle: 'dashed',
    },
    cellLabel: {
      ...typography.mono,
      letterSpacing: 0,
    },
    selectionInnerRing: {
      position: 'absolute',
      top: -SELECTED_RING_GAP,
      left: -SELECTED_RING_GAP,
      right: -SELECTED_RING_GAP,
      bottom: -SELECTED_RING_GAP,
      borderWidth: SELECTED_RING_GAP,
      borderRadius: CELL_RADIUS + SELECTED_RING_GAP,
    },
    selectionOuterRing: {
      position: 'absolute',
      top: -(SELECTED_RING_GAP * 2),
      left: -(SELECTED_RING_GAP * 2),
      right: -(SELECTED_RING_GAP * 2),
      bottom: -(SELECTED_RING_GAP * 2),
      borderWidth: SELECTED_RING_WIDTH,
      borderRadius: CELL_RADIUS + SELECTED_RING_GAP * 2,
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: layout.cardPadding,
    },
    legendSwatch: {
      width: LEGEND_SWATCH,
      height: LEGEND_SWATCH,
      borderRadius: radius.xs,
    },
    legendSwatchToday: {
      borderWidth: TODAY_BORDER_WIDTH,
      borderStyle: 'dashed',
      borderColor: colors.accentPrimary,
    },
    legendSpacer: {
      marginLeft: spacing.sm,
    },
    legendLabel: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    legendProgress: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      marginLeft: 'auto',
      textAlign: 'right',
    },
    dayCard: {
      marginBottom: spacing.xl,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    dayCopy: {
      flex: 1,
      paddingLeft: spacing.sm,
      gap: spacing.xs,
    },
    dayEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    daySummary: {
      ...typography.bodyStrong,
      fontSize: 16,
      lineHeight: 21,
      color: colors.primaryText,
    },
    dayWindow: {
      ...typography.mono,
      color: colors.secondaryText,
    },
    footer: {
      ...typography.eyebrowPlain,
      color: colors.secondaryText,
      textAlign: 'center',
    },
  });
