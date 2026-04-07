import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import {
  enrollInPlan,
  getPlansByCategory,
  getPlanEntries,
  getSavedPlans,
  getUserPlanProgress,
  listReadingPlans,
  markDayComplete,
  savePlanForLater,
  unsavePlan,
} from '../../services/plans/readingPlanService';
import type { ReadingPlan, ReadingPlanEntry, UserReadingPlanProgress } from '../../services/supabase/types';
import type { PlanDetailScreenProps } from '../../navigation/types';
import { getBookById } from '../../constants';
import { openAuthFlow } from '../../navigation/rootNavigation';
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
  uri,
  width,
  height,
  borderRadius,
}: {
  uri: string | null;
  width: number;
  height: number;
  borderRadius: number;
}) {
  const { colors } = useTheme();
  if (!uri) {
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
      source={{ uri }}
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
// Progress ring (border trick, no SVG)
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
        {children ?? <Text style={[progressRingStyles.pctText, { color }]}>{pct}%</Text>}
      </View>
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
              <Text
                style={[progressCardStyles.completeBadgeText, { color: colors.cardBackground }]}
              >
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
            backgroundColor:
              isCompleted
                ? colors.accentPrimary
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

function MarkCompleteButton({
  disabled,
  loading,
  onPress,
  label,
  color,
  textColor,
}: MarkCompleteButtonProps) {
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
      <PlanCoverImage uri={plan.cover_image_url} width={120} height={80} borderRadius={radius.md} />
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
    width: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  info: {
    padding: spacing.sm,
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
  const scrollRef = useRef<ScrollView>(null);
  const dayListOffsetRef = useRef<number>(0);

  // Data state
  const [plan, setPlan] = useState<ReadingPlan | null>(null);
  const [entries, setEntries] = useState<ReadingPlanEntry[]>([]);
  const [progress, setProgress] = useState<UserReadingPlanProgress | null>(null);
  const [relatedPlans, setRelatedPlans] = useState<ReadingPlan[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [savingToggling, setSavingToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entriesByDay = React.useMemo(() => groupEntriesByDay(entries), [entries]);
  const sortedDays = React.useMemo(
    () => Array.from(entriesByDay.keys()).sort((a, b) => a - b),
    [entriesByDay]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [plansResult, entriesResult, progressResult, savedResult] = await Promise.all([
      listReadingPlans(),
      getPlanEntries(planId),
      getUserPlanProgress(planId),
      getSavedPlans(),
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

    if (progressResult.success) {
      setProgress((progressResult.data ?? [])[0] ?? null);
    }

    if (savedResult.success) {
      const savedIds = new Set((savedResult.data ?? []).map((p) => p.id));
      setIsSaved(savedIds.has(planId));
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

  const currentDay = progress?.current_day ?? 1;
  const isCurrentDayCompleted = progress
    ? String(currentDay) in progress.completed_entries
    : false;
  const isEnrolled = progress !== null;

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

  const handleStartPlan = useCallback(async () => {
    if (!progress) {
      // check auth by trying to enroll — service returns error if not signed in
      setEnrolling(true);
      const result = await enrollInPlan(planId);
      if (!result.success) {
        // Likely auth error — open sign in
        openAuthFlow('SignIn');
      } else if (result.data) {
        setProgress(result.data);
      }
      setEnrolling(false);
    }
  }, [planId, progress]);

  const handleToggleSave = useCallback(async () => {
    setSavingToggling(true);
    if (isSaved) {
      const result = await unsavePlan(planId);
      if (!result.success) {
        openAuthFlow('SignIn');
      } else {
        setIsSaved(false);
      }
    } else {
      const result = await savePlanForLater(planId);
      if (!result.success) {
        openAuthFlow('SignIn');
      } else {
        setIsSaved(true);
      }
    }
    setSavingToggling(false);
  }, [planId, isSaved]);

  const handleSample = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: dayListOffsetRef.current, animated: true });
    }
  }, []);

  const handleRelatedPlanPress = useCallback(
    (relatedPlanId: string) => {
      navigation.push('PlanDetail', { planId: relatedPlanId });
    },
    [navigation]
  );

  const planTitle = plan
    ? t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })
    : t('readingPlans.title');

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
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Cover image header                                                  */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.coverContainer}>
          {plan?.cover_image_url ? (
            <Image
              source={{ uri: plan.cover_image_url }}
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
        {/* Title, duration, and completion count                              */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.titleSection}>
          <Text style={[styles.planTitle, { color: colors.primaryText }]} numberOfLines={3}>
            {planTitle}
          </Text>

          <View style={styles.metaRow}>
            {/* Duration badge */}
            <View style={[styles.durationBadge, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
              <Text style={[styles.durationText, { color: colors.secondaryText }]}>
                {plan?.duration_days ?? 0} {t('engagement.days', { defaultValue: 'days' })}
              </Text>
            </View>

            {/* Completion count */}
            {plan && plan.completion_count > 0 ? (
              <View style={styles.completionsRow}>
                <Ionicons name="people-outline" size={14} color={colors.secondaryText} />
                <Text style={[styles.completionsText, { color: colors.secondaryText }]}>
                  {t('readingPlans.completions', { count: plan.completion_count })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* CTA row: Start Plan / Save For Later / Sample                      */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.ctaRow}>
          {/* Start Plan / Continue (only show if not enrolled or enrolled) */}
          {!isEnrolled ? (
            <TouchableOpacity
              onPress={handleStartPlan}
              disabled={enrolling}
              style={[styles.ctaPrimary, { backgroundColor: colors.accentPrimary, flex: 2 }]}
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
          ) : null}

          {/* Save For Later */}
          <TouchableOpacity
            onPress={handleToggleSave}
            disabled={savingToggling}
            style={[
              styles.ctaSecondary,
              {
                borderColor: colors.cardBorder,
                flex: isEnrolled ? 1 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t('readingPlans.unsave') : t('readingPlans.saveForLater')}
          >
            {savingToggling ? (
              <ActivityIndicator size="small" color={colors.primaryText} />
            ) : (
              <>
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={isSaved ? colors.accentPrimary : colors.primaryText}
                />
                <Text style={[styles.ctaSecondaryText, { color: isSaved ? colors.accentPrimary : colors.primaryText }]}>
                  {isSaved ? t('readingPlans.unsave') : t('readingPlans.saveForLater')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Sample — scrolls to day list */}
          <TouchableOpacity
            onPress={handleSample}
            style={[styles.ctaSecondary, { borderColor: colors.cardBorder, flex: 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('readingPlans.sample')}
          >
            <Ionicons name="eye-outline" size={16} color={colors.primaryText} />
            <Text style={[styles.ctaSecondaryText, { color: colors.primaryText }]}>
              {t('readingPlans.sample')}
            </Text>
          </TouchableOpacity>
        </View>

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
        <View
          style={styles.dayListSection}
          onLayout={(e) => {
            dayListOffsetRef.current = e.nativeEvent.layout.y;
          }}
        >
          {/* Progress card (only if enrolled) */}
          {plan && isEnrolled ? (
            <ProgressCard plan={plan} progress={progress} />
          ) : null}

          {/* Mark complete button (only if enrolled and day not complete) */}
          {isEnrolled && !isCurrentDayCompleted && !progress?.is_completed ? (
            <MarkCompleteButton
              disabled={isCurrentDayCompleted || !progress}
              loading={markingComplete}
              onPress={handleMarkComplete}
              label={t('readingPlans.markComplete')}
              color={colors.accentPrimary}
              textColor={colors.cardBackground}
            />
          ) : null}

          {/* Day rows */}
          {sortedDays.map((dayNumber) => {
            const dayEntries = entriesByDay.get(dayNumber) ?? [];
            const isCompleted = progress ? String(dayNumber) in progress.completed_entries : false;
            const isCurrent = dayNumber === currentDay;
            return (
              <DayRow
                key={dayNumber}
                dayNumber={dayNumber}
                entries={dayEntries}
                isCompleted={isCompleted}
                isCurrent={isCurrent && isEnrolled}
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
    height: 80,
  },
  floatingBack: {
    position: 'absolute',
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title section
  titleSection: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  planTitle: {
    ...typography.sectionTitle,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  durationBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  durationText: {
    ...typography.micro,
  },
  completionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  completionsText: {
    ...typography.micro,
  },

  // CTA row
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    minHeight: layout.minTouchTarget,
  },
  ctaPrimaryText: {
    ...typography.button,
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: layout.minTouchTarget,
  },
  ctaSecondaryText: {
    ...typography.label,
  },

  // Description
  description: {
    ...typography.body,
    marginVertical: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },

  // Day list section
  dayListSection: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },

  // Related plans
  relatedSection: {
    paddingTop: spacing.xl,
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
