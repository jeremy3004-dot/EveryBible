import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import {
  getPlanEntries,
  getUserPlanProgress,
  listReadingPlans,
  markDayComplete,
} from '../../services/plans/readingPlanService';
import type { ReadingPlan, ReadingPlanEntry, UserReadingPlanProgress } from '../../services/plans/types';
import type { PlansStackParamList } from '../../navigation/types';
import { getBookById } from '../../constants';
import { rootNavigationRef } from '../../navigation/rootNavigation';

type NavProp = NativeStackNavigationProp<PlansStackParamList>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatChapterRef(entry: ReadingPlanEntry): string {
  const book = getBookById(entry.book);
  const bookName = book?.name ?? entry.book;
  if (entry.chapter_end && entry.chapter_end !== entry.chapter_start) {
    return `${bookName} ${entry.chapter_start}–${entry.chapter_end}`;
  }
  return `${bookName} ${entry.chapter_start}`;
}

// Group entries by day_number into a map
function groupEntriesByDay(entries: ReadingPlanEntry[]): Map<number, ReadingPlanEntry[]> {
  const map = new Map<number, ReadingPlanEntry[]>();
  entries.forEach((entry) => {
    const existing = map.get(entry.day_number) ?? [];
    existing.push(entry);
    map.set(entry.day_number, existing);
  });
  return map;
}

// ---------------------------------------------------------------------------
// Circular progress ring (SVG-free, drawn with border trick)
// ---------------------------------------------------------------------------

function ProgressRing({
  fraction,
  size,
  strokeWidth,
  color,
  trackColor,
  children,
}: {
  fraction: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  // Simple border-based approximation: inner content + outer ring indicator
  const clamped = Math.min(1, Math.max(0, fraction));
  const pct = Math.round(clamped * 100);

  return (
    <View
      style={[
        progressRingStyles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        },
      ]}
    >
      <View
        style={[
          progressRingStyles.inner,
          {
            width: size - strokeWidth * 2,
            height: size - strokeWidth * 2,
            borderRadius: (size - strokeWidth * 2) / 2,
          },
        ]}
      >
        {children ?? (
          <Text style={[progressRingStyles.pctText, { color }]}>{pct}%</Text>
        )}
      </View>
      {/* Accent arc indicator positioned at top */}
      {pct > 0 ? (
        <View
          style={[
            progressRingStyles.accentArc,
            {
              width: strokeWidth * 2,
              height: strokeWidth * 2,
              borderRadius: strokeWidth,
              backgroundColor: color,
              top: -strokeWidth,
              left: size / 2 - strokeWidth,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const progressRingStyles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctText: {
    ...typography.cardTitle,
  },
  accentArc: {
    position: 'absolute',
  },
});

// ---------------------------------------------------------------------------
// Progress summary card
// ---------------------------------------------------------------------------

interface ProgressCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress | null;
}

function ProgressCard({ plan, progress }: ProgressCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const totalDays = plan.duration_days;
  const currentDay = progress?.current_day ?? 1;
  const completedCount = progress ? Object.keys(progress.completed_entries).length : 0;
  const fraction = totalDays > 0 ? completedCount / totalDays : 0;

  return (
    <View
      style={[
        progressCardStyles.card,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <View style={progressCardStyles.row}>
        <ProgressRing
          fraction={fraction}
          size={72}
          strokeWidth={5}
          color={colors.accentPrimary}
          trackColor={colors.cardBorder}
        >
          <Text style={[progressCardStyles.pct, { color: colors.accentPrimary }]}>
            {Math.round(fraction * 100)}%
          </Text>
        </ProgressRing>

        <View style={progressCardStyles.stats}>
          <Text style={[progressCardStyles.dayLabel, { color: colors.primaryText }]}>
            {t('readingPlans.dayOf', { current: currentDay, total: totalDays })}
          </Text>
          <Text style={[progressCardStyles.subLabel, { color: colors.secondaryText }]}>
            {completedCount} / {totalDays}{' '}
            {t('engagement.days', { defaultValue: 'days' })}{' '}
            {t('readingPlans.completed').toLowerCase()}
          </Text>
          {progress?.is_completed ? (
            <View style={[progressCardStyles.completeBadge, { backgroundColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.cardBackground} />
              <Text style={[progressCardStyles.completeBadgeText, { color: colors.cardBackground }]}>
                {t('readingPlans.completed')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const progressCardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  pct: {
    ...typography.cardTitle,
  },
  stats: {
    flex: 1,
    gap: spacing.xs,
  },
  dayLabel: {
    ...typography.bodyStrong,
  },
  subLabel: {
    ...typography.body,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  completeBadgeText: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Day row
// ---------------------------------------------------------------------------

interface DayRowProps {
  dayNumber: number;
  entries: ReadingPlanEntry[];
  isCompleted: boolean;
  isCurrent: boolean;
  onPress: (entry: ReadingPlanEntry) => void;
}

function DayRow({ dayNumber, entries, isCompleted, isCurrent, onPress }: DayRowProps) {
  const { colors } = useTheme();

  const refs = entries.map(formatChapterRef).join(', ');
  const firstEntry = entries[0];

  return (
    <TouchableOpacity
      onPress={() => firstEntry && onPress(firstEntry)}
      activeOpacity={0.85}
      style={[
        dayRowStyles.row,
        {
          backgroundColor: colors.background,
          borderColor: isCurrent ? colors.accentPrimary : colors.cardBorder,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Day ${dayNumber}: ${refs}`}
    >
      <View
        style={[
          dayRowStyles.badge,
          {
            backgroundColor: isCompleted
              ? colors.accentPrimary
              : isCurrent
              ? colors.cardBackground
              : colors.cardBackground,
            borderColor: isCurrent ? colors.accentPrimary : colors.cardBorder,
            borderWidth: isCurrent && !isCompleted ? 1 : 0,
          },
        ]}
      >
        {isCompleted ? (
          <Ionicons name="checkmark" size={14} color={colors.cardBackground} />
        ) : (
          <Text
            style={[
              dayRowStyles.badgeText,
              { color: isCurrent ? colors.accentPrimary : colors.secondaryText },
            ]}
          >
            {dayNumber}
          </Text>
        )}
      </View>

      <View style={dayRowStyles.content}>
        <Text style={[dayRowStyles.refs, { color: colors.primaryText }]} numberOfLines={2}>
          {refs}
        </Text>
      </View>

      <Ionicons
        name={isCompleted ? 'chevron-forward' : 'chevron-forward-outline'}
        size={16}
        color={colors.secondaryText}
      />
    </TouchableOpacity>
  );
}

const dayRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.label,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  refs: {
    ...typography.bodyStrong,
  },
});

// ---------------------------------------------------------------------------
// Mark complete button
// ---------------------------------------------------------------------------

interface MarkCompleteButtonProps {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  label: string;
  color: string;
  textColor: string;
}

function MarkCompleteButton({ disabled, loading, onPress, label, color, textColor }: MarkCompleteButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        markCompleteStyles.button,
        { backgroundColor: disabled ? `${color}55` : color },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={18} color={textColor} />
          <Text style={[markCompleteStyles.label, { color: textColor }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const markCompleteStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: layout.minTouchTarget,
  },
  label: {
    ...typography.button,
  },
});

// ---------------------------------------------------------------------------
// List item types
// ---------------------------------------------------------------------------

type DetailItem =
  | { kind: 'progress-card' }
  | { kind: 'mark-complete' }
  | { kind: 'day-row'; dayNumber: number; entries: ReadingPlanEntry[] };

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface ReadingPlanDetailScreenProps {
  planId: string;
  navigation: NavProp;
}

export function ReadingPlanDetailScreen({ planId, navigation }: ReadingPlanDetailScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [plan, setPlan] = useState<ReadingPlan | null>(null);
  const [entries, setEntries] = useState<ReadingPlanEntry[]>([]);
  const [progress, setProgress] = useState<UserReadingPlanProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entriesByDay = React.useMemo(() => groupEntriesByDay(entries), [entries]);
  const sortedDays = React.useMemo(
    () => Array.from(entriesByDay.keys()).sort((a, b) => a - b),
    [entriesByDay]
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);

    const [plansResult, entriesResult, progressResult] = await Promise.all([
      listReadingPlans(),
      getPlanEntries(planId),
      getUserPlanProgress(planId),
    ]);

    if (plansResult.success) {
      const found = (plansResult.data ?? []).find((p) => p.id === planId) ?? null;
      setPlan(found);
    } else {
      setError(plansResult.error ?? t('common.error'));
    }

    if (entriesResult.success) {
      setEntries(entriesResult.data ?? []);
    } else {
      setError(entriesResult.error ?? t('common.error'));
    }

    if (progressResult.success) {
      setProgress((progressResult.data ?? [])[0] ?? null);
    }

    if (!quiet) setLoading(false);
  }, [planId, t]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const currentDay = progress?.current_day ?? 1;
  const isCurrentDayCompleted = progress
    ? String(currentDay) in progress.completed_entries
    : false;

  const handleMarkComplete = useCallback(async () => {
    setMarkingComplete(true);
    const result = await markDayComplete(planId, currentDay);
    if (result.success && result.data) {
      setProgress(result.data);
    }
    setMarkingComplete(false);
  }, [planId, currentDay]);

  const handleOpenChapter = useCallback((entry: ReadingPlanEntry) => {
    if (!rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: entry.book,
        chapter: entry.chapter_start,
      },
    });
  }, []);

  // Build flat list items
  const items = React.useMemo<DetailItem[]>(() => {
    const result: DetailItem[] = [];
    result.push({ kind: 'progress-card' });
    if (progress && !isCurrentDayCompleted && !progress.is_completed) {
      result.push({ kind: 'mark-complete' });
    }
    sortedDays.forEach((dayNumber) => {
      result.push({ kind: 'day-row', dayNumber, entries: entriesByDay.get(dayNumber) ?? [] });
    });
    return result;
  }, [sortedDays, entriesByDay, progress, isCurrentDayCompleted]);

  const renderItem = useCallback(
    ({ item }: { item: DetailItem }) => {
      switch (item.kind) {
        case 'progress-card':
          return plan ? <ProgressCard plan={plan} progress={progress} /> : null;
        case 'mark-complete':
          return (
            <MarkCompleteButton
              disabled={isCurrentDayCompleted || !progress}
              loading={markingComplete}
              onPress={handleMarkComplete}
              label={t('readingPlans.markComplete')}
              color={colors.accentPrimary}
              textColor={colors.cardBackground}
            />
          );
        case 'day-row': {
          const isCompleted = progress
            ? String(item.dayNumber) in progress.completed_entries
            : false;
          const isCurrent = item.dayNumber === currentDay;
          return (
            <DayRow
              dayNumber={item.dayNumber}
              entries={item.entries}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              onPress={handleOpenChapter}
            />
          );
        }
      }
    },
    [
      plan,
      progress,
      isCurrentDayCompleted,
      markingComplete,
      handleMarkComplete,
      t,
      colors,
      currentDay,
      handleOpenChapter,
    ]
  );

  const keyExtractor = useCallback((_item: DetailItem, index: number) => String(index), []);

  const planTitle = plan
    ? t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })
    : t('readingPlans.title');

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]} numberOfLines={1}>
            {t('readingPlans.title')}
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]} numberOfLines={1}>
          {planTitle}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => load()}
            style={[styles.retryButton, { borderColor: colors.accentPrimary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: colors.accentPrimary }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accentPrimary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  backButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    ...typography.pageTitle,
    flex: 1,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarBaseHeight + spacing.xl,
    gap: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  retryText: {
    ...typography.label,
  },
});
