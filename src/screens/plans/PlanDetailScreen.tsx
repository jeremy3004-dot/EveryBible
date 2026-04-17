import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { useBibleStore, useLibraryStore, useProgressStore, useReadingPlansStore } from '../../stores';
import {
  enrollInPlan,
  getPlansByCategory,
  getPlanEntries,
  listReadingPlans,
} from '../../services/plans/readingPlanService';
import {
  getCurrentPlanDaySummary,
  buildPlanDayPlaybackSequenceEntries,
  formatScheduledPlanDayLabel,
  resolvePlanDayPlaybackStartEntry,
  type CurrentPlanDaySummary,
} from '../../services/plans/readingPlanActivity';
import { getReadingPlanCoverSource } from '../../services/plans/readingPlanAssets';
import {
  getActivePlanDayNumber,
  getDaySessionEntries,
  getVisiblePlanDayNumbers,
  isRecurringPlan,
  isMultiSessionPlan,
} from '../../services/plans/readingPlanModel';
import type {
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from '../../services/plans/types';
import type { PlanDetailScreenProps } from '../../navigation/types';
import { getBookById } from '../../constants';
import { rootNavigationRef } from '../../navigation/rootNavigation';

// ---------------------------------------------------------------------------
// Helpers (duplicated from ReadingPlanDetailScreen to avoid cross-screen dep)
// ---------------------------------------------------------------------------

function formatChapterRef(entry: ReadingPlanEntry): string {
  const book = getBookById(entry.book);
  const bookName = book?.name ?? entry.book;
  if (entry.chapter_end && entry.chapter_end !== entry.chapter_start) {
    return `${bookName} ${entry.chapter_start}–${entry.chapter_end}`;
  }
  return `${bookName} ${entry.chapter_start}`;
}

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
// PlanCoverImage — full-width or thumbnail with graceful fallback
// ---------------------------------------------------------------------------

function PlanCoverImage({
  plan,
  width,
  height,
  borderRadius,
}: {
  plan: ReadingPlan;
  width: number;
  height: number;
  borderRadius: number;
}) {
  const { colors } = useTheme();
  const source = getReadingPlanCoverSource(plan);
  if (!source) {
    return (
      <View
        style={[
          coverImageStyles.fallback,
          { width, height, borderRadius, backgroundColor: colors.accentSecondary },
        ]}
      >
        <Ionicons name="book-outline" size={width * 0.3} color={colors.secondaryText} />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={{ width, height, borderRadius }}
      resizeMode="cover"
    />
  );
}

const coverImageStyles = StyleSheet.create({
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ---------------------------------------------------------------------------
// Progress ring
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
  const clamped = Math.min(1, Math.max(0, fraction));
  const pct = Math.round(clamped * 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - clamped * circumference;

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
      <Svg
        width={size}
        height={size}
        style={progressRingStyles.progressRing}
        viewBox={`0 0 ${size} ${size}`}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
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
        {children ?? <Text style={[progressRingStyles.pctText, { color }]}>{pct}%</Text>}
      </View>
    </View>
  );
}

const progressRingStyles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  pctText: {
    ...typography.cardTitle,
  },
  progressRing: {
    position: 'absolute',
  },
});

// ---------------------------------------------------------------------------
// Progress summary card
// ---------------------------------------------------------------------------

interface ProgressCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress | null;
  currentDaySummary: CurrentPlanDaySummary | null;
}

function ProgressCard({ plan, progress, currentDaySummary }: ProgressCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const totalDays = plan.duration_days;
  const isRecurringSchedulePlan = isRecurringPlan(plan);
  const currentDay = currentDaySummary?.dayNumber ?? getActivePlanDayNumber(plan, progress);
  const completedCount = progress ? Object.keys(progress.completed_entries).length : 0;
  const fraction =
    totalDays > 0 ? (isRecurringSchedulePlan ? currentDay / totalDays : completedCount / totalDays) : 0;
  const completionBadgeLabel = progress?.is_completed && !isRecurringSchedulePlan
    ? t('readingPlans.completed')
    : currentDaySummary?.isComplete
      ? t('readingPlans.dailyTargetCompleteTitle')
      : null;

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
          {!isRecurringSchedulePlan ? (
            <Text style={[progressCardStyles.subLabel, { color: colors.secondaryText }]}>
              {completedCount} / {totalDays}{' '}
              {t('engagement.days', { defaultValue: 'days' })}{' '}
              {t('readingPlans.completed').toLowerCase()}
            </Text>
          ) : null}
          {currentDaySummary ? (
            <Text style={[progressCardStyles.subLabel, { color: colors.secondaryText }]}>
              {t('readingPlans.todayTargetProgress', {
                completed: currentDaySummary.completedChapterCount,
                target: currentDaySummary.targetChapterCount,
                defaultValue: `Today's target: ${currentDaySummary.completedChapterCount}/${currentDaySummary.targetChapterCount} chapters`,
              })}
            </Text>
          ) : null}
          {completionBadgeLabel ? (
            <View style={[progressCardStyles.completeBadge, { backgroundColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.cardBackground} />
              <Text
                style={[progressCardStyles.completeBadgeText, { color: colors.cardBackground }]}
              >
                {completionBadgeLabel}
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
    padding: layout.cardPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  pct: {
    ...typography.cardTitle,
  },
  stats: {
    flex: 1,
    gap: spacing.sm,
  },
  dayLabel: {
    ...typography.bodyStrong,
  },
  subLabel: {
    ...typography.micro,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
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
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  sessionBadges?: Array<{ label: string; state: 'done' | 'next' | 'upcoming' | 'available' }>;
  sessionActions?: Array<{
    sessionKey: PlanSessionKey;
    label: string;
    state: 'done' | 'next' | 'upcoming' | 'available';
  }>;
  onPress: (dayNumber: number, sessionKey?: PlanSessionKey) => void;
}

export const CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row';

function DayRow({
  dayNumber,
  dateLabel,
  entries,
  launchSessionKey,
  isCompleted,
  isCurrent,
  sessionBadges = [],
  sessionActions = [],
  onPress,
}: DayRowProps) {
  const { colors } = useTheme();

  const refs = entries.map(formatChapterRef).join(', ');
  const accessibilityLabel = isCurrent
    ? `Current plan day ${dayNumber}${dateLabel ? `, ${dateLabel}` : ''}: ${refs}`
    : `Day ${dayNumber}${dateLabel ? `, ${dateLabel}` : ''}: ${refs}`;
  const surfaceStyle = {
    backgroundColor: colors.cardBackground,
    borderColor: isCurrent ? colors.accentPrimary : colors.cardBorder,
    borderWidth: isCurrent ? 1.5 : 1,
  } as const;
  const hasSessionActions = sessionActions.length > 0;

  return (
    <View style={[dayRowStyles.container, surfaceStyle]}>
      <TouchableOpacity
        testID={isCurrent ? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined}
        onPress={() => onPress(dayNumber, launchSessionKey)}
        activeOpacity={0.85}
        style={dayRowStyles.row}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View
          style={[
            dayRowStyles.badge,
            {
              backgroundColor:
                isCompleted
                  ? colors.accentPrimary
                  : colors.background,
              borderColor: isCurrent ? colors.accentPrimary : colors.cardBorder,
              borderWidth: isCompleted ? 0 : 1,
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
          {dateLabel ? (
            <Text style={[dayRowStyles.dateLabel, { color: colors.secondaryText }]}>
              {dateLabel}
            </Text>
          ) : null}
          <Text style={[dayRowStyles.refs, { color: colors.primaryText }]} numberOfLines={2}>
            {refs}
          </Text>
          {!hasSessionActions && sessionBadges.length > 0 ? (
            <View style={dayRowStyles.sessionBadgeRow}>
              {sessionBadges.map((badge) => {
                const palette =
                  badge.state === 'done'
                    ? {
                        backgroundColor: colors.accentPrimary,
                        borderColor: colors.accentPrimary,
                        textColor: colors.cardBackground,
                      }
                    : badge.state === 'next'
                      ? {
                          backgroundColor: colors.cardBackground,
                          borderColor: colors.accentPrimary,
                          textColor: colors.accentPrimary,
                        }
                      : {
                          backgroundColor: colors.background,
                          borderColor: colors.cardBorder,
                          textColor: colors.secondaryText,
                        };

                return (
                  <View
                    key={`${dayNumber}-${badge.label}`}
                    style={[
                      dayRowStyles.sessionBadge,
                      {
                        backgroundColor: palette.backgroundColor,
                        borderColor: palette.borderColor,
                      },
                    ]}
                  >
                    <Text style={[dayRowStyles.sessionBadgeText, { color: palette.textColor }]}>
                      {badge.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <Ionicons
          name={isCompleted ? 'chevron-forward' : 'chevron-forward-outline'}
          size={16}
          color={colors.secondaryText}
        />
      </TouchableOpacity>

      {hasSessionActions ? (
        <View style={dayRowStyles.sessionActionRow}>
          {sessionActions.map((action) => {
            const palette =
              action.state === 'done'
                ? {
                    backgroundColor: colors.accentPrimary,
                    borderColor: colors.accentPrimary,
                    textColor: colors.cardBackground,
                  }
                : action.state === 'next'
                  ? {
                      backgroundColor: colors.accentPrimary,
                      borderColor: colors.accentPrimary,
                      textColor: colors.cardBackground,
                    }
                  : {
                      backgroundColor: colors.background,
                      borderColor: colors.cardBorder,
                      textColor: colors.primaryText,
                    };

            return (
              <TouchableOpacity
                key={`${dayNumber}-${action.sessionKey}`}
                onPress={() => onPress(dayNumber, action.sessionKey)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${action.label} for day ${dayNumber}`}
                style={[
                  dayRowStyles.sessionActionButton,
                  {
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                  },
                ]}
              >
                <Text style={[dayRowStyles.sessionActionLabel, { color: palette.textColor }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const dayRowStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  badge: {
    width: 36,
    height: 36,
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
  dateLabel: {
    ...typography.micro,
  },
  refs: {
    ...typography.bodyStrong,
  },
  sessionBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sessionBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sessionBadgeText: {
    ...typography.micro,
  },
  sessionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sessionActionButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sessionActionLabel: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Related plan card
// ---------------------------------------------------------------------------

interface RelatedPlanCardProps {
  plan: ReadingPlan;
  onPress: (planId: string) => void;
}

function RelatedPlanCard({ plan, onPress }: RelatedPlanCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={() => onPress(plan.id)}
      activeOpacity={0.85}
      style={[relatedCardStyles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
      accessibilityRole="button"
    >
      <PlanCoverImage plan={plan} width={120} height={80} borderRadius={radius.md} />
      <View style={relatedCardStyles.info}>
        <Text style={[relatedCardStyles.title, { color: colors.primaryText }]} numberOfLines={2}>
          {t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })}
        </Text>
        <Text style={[relatedCardStyles.duration, { color: colors.secondaryText }]}>
          {plan.duration_days} {t('engagement.days', { defaultValue: 'days' })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const relatedCardStyles = StyleSheet.create({
  card: {
    width: 172,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  info: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
  },
  duration: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const COVER_HEIGHT = 220;

export function PlanDetailScreen({ route, navigation }: PlanDetailScreenProps) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const progress = useReadingPlansStore((state) => state.progressByPlanId[planId] ?? null);
  const getPlanDayResume = useReadingPlansStore((state) => state.getPlanDayResume);

  // Data state
  const [plan, setPlan] = useState<ReadingPlan | null>(null);
  const [entries, setEntries] = useState<ReadingPlanEntry[]>([]);
  const [relatedPlans, setRelatedPlans] = useState<ReadingPlan[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entriesByDay = React.useMemo(() => groupEntriesByDay(entries), [entries]);
  const today = React.useMemo(() => new Date(), []);
  const visibleDayNumbers = React.useMemo(
    () => getVisiblePlanDayNumbers(plan, entries, progress, today),
    [entries, plan, progress, today]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [plansResult, entriesResult] = await Promise.all([
      listReadingPlans(),
      getPlanEntries(planId),
    ]);

    let foundPlan: ReadingPlan | null = null;
    if (plansResult.success) {
      foundPlan = (plansResult.data ?? []).find((p) => p.id === planId) ?? null;
      setPlan(foundPlan);
    } else {
      setError(plansResult.error ?? t('common.error'));
    }

    if (entriesResult.success) {
      setEntries(entriesResult.data ?? []);
    }

    // Fetch related plans once we know the category
    if (foundPlan?.category) {
      const relatedResult = await getPlansByCategory(foundPlan.category);
      if (relatedResult.success) {
        const filtered = (relatedResult.data ?? [])
          .filter((p) => p.id !== planId)
          .slice(0, 5);
        setRelatedPlans(filtered);
      }
    }

    setLoading(false);
  }, [planId, t]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const currentDay = plan ? getActivePlanDayNumber(plan, progress, today) : progress?.current_day ?? 1;
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const currentDaySummary = React.useMemo(() => {
    if (!plan || !progress) {
      return null;
    }

    return getCurrentPlanDaySummary({
      plan,
      entries,
      progress,
      chaptersRead,
      listeningHistory,
      today,
    });
  }, [chaptersRead, entries, listeningHistory, plan, progress, today]);
  const isEnrolled = progress !== null;
  const multiSessionPlan = isMultiSessionPlan(plan);

  const handleOpenChapter = useCallback(async (dayNumber: number, sessionKey?: PlanSessionKey) => {
    if (!rootNavigationRef.isReady()) return;

    if (!progress) {
      const enrollResult = await enrollInPlan(planId);
      if (!enrollResult.success || !enrollResult.data) {
        return;
      }
    }

    const plannedDayEntries = entriesByDay.get(dayNumber) ?? [];
    const dayEntries =
      sessionKey && multiSessionPlan
        ? plannedDayEntries.filter((entry) => entry.session_key === sessionKey)
        : plannedDayEntries;
    const fallbackEntry = dayEntries[0] ?? plannedDayEntries[0];
    if (!fallbackEntry) {
      return;
    }

    const playbackSequenceEntries = buildPlanDayPlaybackSequenceEntries(dayEntries);
    const resumeTarget = getPlanDayResume(planId, dayNumber);
    const playbackStartEntry = resolvePlanDayPlaybackStartEntry(dayEntries, resumeTarget) ?? {
      bookId: fallbackEntry.book,
      chapter: fallbackEntry.chapter_start,
    };

    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: playbackStartEntry.bookId,
        chapter: playbackStartEntry.chapter,
        ...(preferredChapterLaunchMode === 'listen' ? { autoplayAudio: true } : {}),
        preferredMode: preferredChapterLaunchMode,
        playbackSequenceEntries,
        planId,
        planDayNumber: dayNumber,
        ...(sessionKey ? { planSessionKey: sessionKey } : {}),
        returnToPlanOnComplete: true,
      },
    });
  }, [entriesByDay, getPlanDayResume, multiSessionPlan, planId, preferredChapterLaunchMode, progress]);

  const handleStartPlan = useCallback(async () => {
    if (!progress) {
      setEnrolling(true);
      await enrollInPlan(planId);
      setEnrolling(false);
    }
  }, [planId, progress]);

  const handleRelatedPlanPress = useCallback(
    (relatedPlanId: string) => {
      navigation.push('PlanDetail', { planId: relatedPlanId });
    },
    [navigation]
  );

  const planTitle = plan
    ? t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })
    : t('readingPlans.title');
  const heroCoverSource = plan ? getReadingPlanCoverSource(plan) : null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingHeader, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingHeader, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity
            onPress={load}
            style={[styles.retryButton, { borderColor: colors.accentPrimary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: colors.accentPrimary }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Cover image header                                                  */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.coverContainer}>
          {heroCoverSource ? (
            <Image
              source={heroCoverSource}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.coverImage, { backgroundColor: colors.accentSecondary }]}>
              <Ionicons name="book-outline" size={60} color={colors.secondaryText} />
            </View>
          )}

          {/* Gradient overlay at bottom of cover for readability */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={styles.coverGradient}
          />

          <View style={styles.coverTitleWrap}>
            <Text style={styles.coverTitle} numberOfLines={3}>
              {planTitle}
            </Text>
          </View>

          {/* Floating back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[
              styles.floatingBack,
              {
                top: insets.top + spacing.sm,
                backgroundColor: 'rgba(0,0,0,0.4)',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* CTA row: Start Plan                                                 */}
        {/* ------------------------------------------------------------------ */}
        {!isEnrolled ? (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              onPress={handleStartPlan}
              disabled={enrolling}
              style={[styles.ctaPrimary, { backgroundColor: colors.accentPrimary }]}
              accessibilityRole="button"
              accessibilityLabel={t('readingPlans.startPlan')}
            >
              {enrolling ? (
                <ActivityIndicator size="small" color={colors.cardBackground} />
              ) : (
                <Text style={[styles.ctaPrimaryText, { color: colors.cardBackground }]}>
                  {t('readingPlans.startPlan')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Plan description                                                    */}
        {/* ------------------------------------------------------------------ */}
        {plan?.description_key ? (
          <Text style={[styles.description, { color: colors.secondaryText }]}>
            {t(plan.description_key as Parameters<typeof t>[0], { defaultValue: plan.description_key })}
          </Text>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Day list                                                            */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.dayListSection}>
          {/* Progress card (only if enrolled) */}
          {plan && isEnrolled ? (
            <ProgressCard
              plan={plan}
              progress={progress}
              currentDaySummary={currentDaySummary}
            />
          ) : null}

          {/* Day rows */}
          {visibleDayNumbers.map((dayNumber) => {
            const dayEntries = entriesByDay.get(dayNumber) ?? [];
            const daySessionGroups = multiSessionPlan ? getDaySessionEntries(entries, dayNumber) : [];
            const isCompleted = progress
              ? isRecurringPlan(plan)
                ? dayNumber === currentDay &&
                  Boolean(
                    (currentDaySummary?.dateKey &&
                      currentDaySummary.dateKey in progress.completed_entries) ||
                      currentDaySummary?.isComplete
                  )
                : String(dayNumber) in progress.completed_entries ||
                  (dayNumber === currentDay && Boolean(currentDaySummary?.isComplete))
              : false;
            const isCurrent = dayNumber === currentDay;
            const dateLabel =
              progress && !isRecurringPlan(plan)
                ? formatScheduledPlanDayLabel(progress.started_at, dayNumber)
                : null;
            const launchSessionKey = multiSessionPlan
              ? isCurrent && isEnrolled
                ? currentDaySummary?.nextIncompleteSessionKey ?? daySessionGroups[0]?.sessionKey
                : daySessionGroups[0]?.sessionKey
              : undefined;
            const sessionBadges = daySessionGroups.map((group) => {
              const matchingSummary =
                isCurrent && isEnrolled
                  ? currentDaySummary?.sessionSummaries.find(
                      (session) => session.sessionKey === group.sessionKey
                    ) ?? null
                  : null;
              const state =
                !isCurrent || !isEnrolled
                  ? 'available'
                  : matchingSummary?.isComplete
                    ? 'done'
                    : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                      ? 'next'
                      : 'upcoming';

              return {
                label: group.title,
                state,
              } as const;
            });
            const sessionActions = daySessionGroups.map((group) => {
              const matchingSummary =
                isCurrent && isEnrolled
                  ? currentDaySummary?.sessionSummaries.find(
                      (session) => session.sessionKey === group.sessionKey
                    ) ?? null
                  : null;
              const state =
                !isCurrent || !isEnrolled
                  ? 'available'
                  : matchingSummary?.isComplete
                    ? 'done'
                    : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                      ? 'next'
                      : 'upcoming';

              return {
                sessionKey: group.sessionKey,
                label: group.title,
                state,
              } as const;
            });
            return (
              <DayRow
                key={dayNumber}
                dayNumber={dayNumber}
                dateLabel={dateLabel}
                entries={dayEntries}
                launchSessionKey={launchSessionKey}
                isCompleted={isCompleted}
                isCurrent={isCurrent && isEnrolled}
                sessionBadges={sessionBadges}
                sessionActions={sessionActions}
                onPress={handleOpenChapter}
              />
            );
          })}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Related Plans                                                       */}
        {/* ------------------------------------------------------------------ */}
        {relatedPlans.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={[styles.relatedTitle, { color: colors.primaryText }]}>
              {t('readingPlans.relatedPlans')}
            </Text>
            <FlatList
              data={relatedPlans}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.relatedList}
              ItemSeparatorComponent={() => <View style={styles.relatedSeparator} />}
              renderItem={({ item }) => (
                <RelatedPlanCard plan={item} onPress={handleRelatedPlanPress} />
              )}
            />
          </View>
        ) : null}

        {/* Bottom breathing room */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // No horizontal padding here — cover image is edge-to-edge
  },

  // Loading / error states
  loadingHeader: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
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

  // Cover image
  coverContainer: {
    height: COVER_HEIGHT,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: COVER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  coverTitleWrap: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: spacing.lg,
  },
  coverTitle: {
    ...typography.pageTitle,
    color: '#ffffff',
  },
  floatingBack: {
    position: 'absolute',
    left: spacing.lg,
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: layout.minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // CTA row
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    minHeight: layout.minTouchTarget,
  },
  ctaPrimaryText: {
    ...typography.button,
  },

  // Description
  description: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },

  // Day list section
  dayListSection: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },

  // Related plans
  relatedSection: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  relatedTitle: {
    ...typography.sectionTitle,
    paddingHorizontal: layout.screenPadding,
  },
  relatedList: {
    paddingHorizontal: layout.screenPadding,
  },
  relatedSeparator: {
    width: spacing.sm,
  },

  // Back button (loading/error states only)
  backButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
});
