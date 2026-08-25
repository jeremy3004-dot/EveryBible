import React, { useState, useCallback, useEffect } from 'react';
import {
  FlatList,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Fuse from 'fuse.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { serifFamily } from '../../design/fonts';
import { EmptyState } from '../../components/ui';
import { CardSkeleton } from '../../components/skeleton/CardSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { lightHaptic, successHaptic } from '../../utils';
import type { PlansStackParamList } from '../../navigation/types';
import {
  listReadingPlans,
  getUserPlanProgress,
  unenrollFromPlan,
} from '../../services/plans/readingPlanService';
import { getReadingPlanCoverSource } from '../../services/plans/readingPlanAssets';
import { getActivePlanDayNumber, isRecurringPlan } from '../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import { useProgressStore } from '../../stores/progressStore';
import {
  summarizeReadingActivity,
  formatLocalDateKey,
} from '../../services/progress/readingActivity';
import {
  getCurrentPlanDaySummary,
  type CurrentPlanDaySummary,
} from '../../services/plans/readingPlanActivity';
import { readingPlanEntriesByPlanId } from '../../data/readingPlans.generated';
import { useLibraryStore } from '../../stores';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { isMultiSessionPlan } from '../../services/plans/readingPlanModel';
import type { ListeningHistoryEntry } from '../../stores/libraryModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanTab = 'my-plans' | 'find-plans' | 'completed';
type NavigationProp = NativeStackNavigationProp<PlansStackParamList>;

type CompletedPlanRow = UserReadingPlanProgress & { plan: ReadingPlan };

interface SwipeablePlanRowProps {
  onDelete: () => void;
  children: React.ReactNode;
}

function SwipeablePlanRow({ onDelete, children }: SwipeablePlanRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Swipeable
      enableTrackpadTwoFingerGesture
      overshootRight={false}
      rightThreshold={48}
      renderRightActions={(_, __, swipeableMethods) => (
        <View style={swipeableStyles.actions}>
          <TouchableOpacity
            onPress={() => {
              swipeableMethods.close();
              onDelete();
            }}
            style={[swipeableStyles.deleteButton, { backgroundColor: colors.error }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Ionicons name="trash-outline" size={18} color={colors.onAccent} />
            <Text style={[swipeableStyles.deleteText, { color: colors.onAccent }]}>
              {t('common.delete')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Cover image fallback (shared by multiple sections)
// ---------------------------------------------------------------------------

function CoverImage({
  plan,
  width,
  height,
  colors,
  t,
}: {
  plan: ReadingPlan;
  width: number;
  height: number;
  colors: ThemeColors;
  t: TFunction;
}) {
  const source = getReadingPlanCoverSource(plan);
  if (source) {
    return (
      <Image
        source={source}
        style={{ width, height, borderRadius: radius.md }}
        resizeMode="cover"
      />
    );
  }
  // No artwork: a warm accent gradient with the plan's serif initial — a cover,
  // distinct from the icon-led empty state.
  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
  const initial = title.trim().charAt(0).toUpperCase() || '✦';
  return (
    <LinearGradient
      colors={[colors.accentSecondary, colors.accentPrimary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width,
        height,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: serifFamily(600),
          fontSize: Math.floor(height * 0.42),
          color: colors.onAccent,
        }}
      >
        {initial}
      </Text>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Progress bar (inline, no external dependency needed)
// ---------------------------------------------------------------------------

function ProgressBar({
  progress,
  colors,
}: {
  progress: number; // 0-1
  colors: ThemeColors;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[inlineStyles.progressTrack, { backgroundColor: colors.cardBorder }]}>
      <View
        style={[
          inlineStyles.progressFill,
          { backgroundColor: colors.accentPrimary, width: `${clamped * 100}%` },
        ]}
      />
    </View>
  );
}

function formatProgressPercent(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

const inlineStyles = StyleSheet.create({
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: radius.pill,
  },
});

type SessionStatusTone = 'done' | 'next' | 'upcoming';

function getLocalizedSessionLabel(
  sessionKey: 'morning' | 'midday' | 'evening',
  t: ReturnType<typeof useTranslation>['t']
): string {
  const labelKey =
    sessionKey === 'morning'
      ? 'readingPlans.morningLabel'
      : sessionKey === 'midday'
        ? 'readingPlans.middayLabel'
        : 'readingPlans.eveningLabel';

  return t(labelKey, {
    defaultValue: sessionKey.charAt(0).toUpperCase() + sessionKey.slice(1),
  });
}

function formatPlanCadenceLabel(
  plan: ReadingPlan,
  t: ReturnType<typeof useTranslation>['t']
): string | null {
  if (!isMultiSessionPlan(plan) || !plan.sessionOrder?.length) {
    return null;
  }

  return plan.sessionOrder.map((sessionKey) => getLocalizedSessionLabel(sessionKey, t)).join(' + ');
}

function formatSessionStatusSummary(
  summary: CurrentPlanDaySummary | null,
  t: ReturnType<typeof useTranslation>['t']
): string | null {
  if (!summary?.sessionSummaries.length) {
    return null;
  }

  return summary.sessionSummaries
    .map((session) => {
      const tone: SessionStatusTone = session.isComplete
        ? 'done'
        : summary.nextIncompleteSessionKey === session.sessionKey
          ? 'next'
          : 'upcoming';
      const toneLabel =
        tone === 'done'
          ? t('readingPlans.sessionDone')
          : tone === 'next'
            ? t('readingPlans.sessionNext')
            : t('readingPlans.sessionUpcoming');

      return `${getLocalizedSessionLabel(session.sessionKey, t)} ${toneLabel}`;
    })
    .join(' • ');
}

// ---------------------------------------------------------------------------
// Activity streak strip (14 days)
// ---------------------------------------------------------------------------

// Kept for quick re-enable later while the plans tab iterates on layout.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActivityStreakStrip({ colors }: { colors: ThemeColors }) {
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const { t } = useTranslation();
  const summary = summarizeReadingActivity(chaptersRead);

  // Build last 14 day keys
  const dayKeys: string[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dayKeys.push(formatLocalDateKey(d));
  }

  // Calculate current streak
  let currentStreak = 0;
  const todayKey = formatLocalDateKey(today);
  const checkDate = new Date(today);

  while (true) {
    const key = formatLocalDateKey(checkDate);
    if (summary.daysByDateKey[key]) {
      currentStreak += 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (key === todayKey) {
      // Today has no activity yet — look at yesterday before breaking
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayKey = formatLocalDateKey(checkDate);
      if (summary.daysByDateKey[yesterdayKey]) {
        currentStreak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    } else {
      break;
    }
  }

  const styles = createStreakStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {dayKeys.map((key) => {
          const hasActivity = Boolean(summary.daysByDateKey[key]);
          return (
            <View
              key={key}
              style={[
                styles.dot,
                hasActivity
                  ? { backgroundColor: colors.accentPrimary }
                  : { borderWidth: 1.5, borderColor: colors.cardBorder },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.streakLabel}>
        {currentStreak} {t('profile.streak').toLowerCase()}
      </Text>
    </View>
  );
}

const createStreakStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingTop: spacing.lg,
      gap: spacing.sm,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      alignItems: 'center',
    },
    dot: {
      width: 28,
      height: 28,
      borderRadius: radius.pill,
    },
    streakLabel: {
      ...typography.micro,
      color: colors.secondaryText,
    },
  });

// ---------------------------------------------------------------------------
// My Plans section
// ---------------------------------------------------------------------------

interface MyPlansSectionProps {
  allPlans: ReadingPlan[];
  userProgress: UserReadingPlanProgress[];
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  onAddPlan: () => void;
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  colors: ThemeColors;
}

type ActivePlanRow = { progress: UserReadingPlanProgress; plan: ReadingPlan };

function MyPlansSection({
  allPlans,
  userProgress,
  chaptersRead,
  listeningHistory,
  onAddPlan,
  onPlanPress,
  onDeletePlan,
  colors,
}: MyPlansSectionProps) {
  const { t } = useTranslation();

  const activePlans = userProgress
    .filter((p) => !p.is_completed)
    .map((p) => {
      const plan = allPlans.find((pl) => pl.id === p.plan_id);
      return plan ? { progress: p, plan } : null;
    })
    .filter((item): item is ActivePlanRow => item !== null);

  const dailyReadingPlans = activePlans.filter(({ plan }) => !isRecurringPlan(plan));
  const dailyRhythmPlans = activePlans.filter(({ plan }) => isRecurringPlan(plan));

  const styles = createMyPlansStyles(colors);

  const renderPlanCard = ({ progress, plan }: ActivePlanRow) => {
    const currentDay = getActivePlanDayNumber(plan, progress);
    const currentDaySummary = getCurrentPlanDaySummary({
      plan,
      entries: readingPlanEntriesByPlanId[plan.id] ?? [],
      progress,
      chaptersRead,
      listeningHistory,
    });
    const progressRatio =
      plan.duration_days > 0
        ? isRecurringPlan(plan)
          ? currentDay / plan.duration_days
          : (currentDay - 1) / plan.duration_days
        : 0;
    const sessionStatus = isMultiSessionPlan(plan)
      ? formatSessionStatusSummary(currentDaySummary, t)
      : null;
    const ctaLabel =
      isRecurringPlan(plan) && currentDaySummary?.nextIncompleteSessionKey
        ? getLocalizedSessionLabel(currentDaySummary.nextIncompleteSessionKey, t)
        : t('common.continue');

    return (
      <SwipeablePlanRow key={plan.id} onDelete={() => onDeletePlan(plan.id)}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => onPlanPress(plan.id)}
          activeOpacity={0.7}
        >
          <View style={styles.coverFrame}>
            <CoverImage plan={plan} width={88} height={88} colors={colors} t={t} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {t(plan.title_key as Parameters<typeof t>[0])}
              </Text>
              <Ionicons name="chevron-forward" size={22} color={colors.secondaryText} />
            </View>
            <View style={styles.progressBlock}>
              <Text style={styles.dayCounter}>
                {t('readingPlans.dayOf', {
                  current: currentDay,
                  total: plan.duration_days,
                })}
              </Text>
              {sessionStatus ? (
                <View style={styles.sessionRow}>
                  <View style={styles.sessionDot}>
                    <Ionicons name="checkmark" size={12} color={colors.onAccent} />
                  </View>
                  <Text style={styles.sessionSummary} numberOfLines={1}>
                    {sessionStatus}
                  </Text>
                </View>
              ) : null}
              <ProgressBar progress={progressRatio} colors={colors} />
              <View style={styles.cardFooter}>
                <Text style={styles.percentText}>{formatProgressPercent(progressRatio)}</Text>
                <View
                  style={[
                    styles.actionPill,
                    isRecurringPlan(plan)
                      ? { borderColor: colors.accentPrimary }
                      : {
                          backgroundColor: colors.accentPrimary,
                          borderColor: colors.accentPrimary,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionPillText,
                      {
                        color: isRecurringPlan(plan) ? colors.accentPrimary : colors.onAccent,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {ctaLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </SwipeablePlanRow>
    );
  };

  return (
    <View style={styles.content}>
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('readingPlans.dailyReadings')}</Text>
        </View>

        {activePlans.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title={t('readingPlans.noActivePlans')}
            body={t('readingPlans.findPlans')}
            cta={{ label: t('readingPlans.addFirstPlan'), onPress: onAddPlan }}
          />
        ) : (
          dailyReadingPlans.map(renderPlanCard)
        )}
      </View>

      {dailyRhythmPlans.length > 0 ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('readingPlans.dailyRhythms')}</Text>
          </View>
          {dailyRhythmPlans.map(renderPlanCard)}
        </View>
      ) : null}

      {/* ActivityStreakStrip hidden for now */}
    </View>
  );
}

const createMyPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      gap: spacing.xl,
    },
    sectionBlock: {
      gap: spacing.md,
    },
    sectionHeader: {
      minHeight: layout.minTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    sectionTitle: {
      ...typography.cardTitle,
      fontSize: 20,
      lineHeight: 26,
      color: colors.primaryText,
    },
    primaryButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.accentPrimary,
      minHeight: layout.minTouchTarget,
      paddingHorizontal: spacing.md,
    },
    primaryButtonLabel: {
      ...typography.label,
      color: colors.cardBackground,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      minHeight: 132,
      paddingHorizontal: layout.cardPadding,
      paddingVertical: spacing.lg,
    },
    coverFrame: {
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.cardBorder,
    },
    cardBody: {
      flex: 1,
      gap: spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cardTitle: {
      ...typography.cardTitle,
      fontSize: 21,
      lineHeight: 26,
      color: colors.primaryText,
      flex: 1,
    },
    progressBlock: {
      gap: spacing.sm,
    },
    dayCounter: {
      ...typography.body,
      lineHeight: 20,
      color: colors.secondaryText,
      fontVariant: ['tabular-nums'],
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sessionDot: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentPrimary,
    },
    sessionSummary: {
      ...typography.body,
      lineHeight: 20,
      color: colors.secondaryText,
      flex: 1,
    },
    cardFooter: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    percentText: {
      ...typography.bodyStrong,
      color: colors.secondaryText,
      fontVariant: ['tabular-nums'],
    },
    actionPill: {
      minHeight: 36,
      minWidth: 104,
      borderRadius: radius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    actionPillText: {
      ...typography.bodyStrong,
    },
  });

const swipeableStyles = StyleSheet.create({
  actions: {
    width: 92,
    marginVertical: spacing.xs / 2,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  deleteText: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Find Plans section
// ---------------------------------------------------------------------------

interface FindPlansSectionProps {
  allPlans: ReadingPlan[];
  userProgress: UserReadingPlanProgress[];
  onPlanPress: (planId: string) => void;
  colors: ThemeColors;
}

function FindPlansSection({ allPlans, userProgress, onPlanPress, colors }: FindPlansSectionProps) {
  const { t } = useTranslation();
  const enrolledPlanIds = new Set(userProgress.map((p) => p.plan_id));
  const [searchQuery, setSearchQuery] = useState('');
  const cardWidth = 156;
  const coverWidth = cardWidth - spacing.sm * 2;
  const coverHeight = 112;

  const searchablePlans = React.useMemo(
    () =>
      allPlans.map((plan) => ({
        plan,
        title: t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key }),
        description: plan.description_key
          ? t(plan.description_key as Parameters<typeof t>[0], {
              defaultValue: plan.description_key,
            })
          : '',
        cadence: formatPlanCadenceLabel(plan, t) ?? '',
        category: plan.category ?? 'other',
      })),
    [allPlans, t]
  );
  const planSearch = React.useMemo(
    () =>
      new Fuse(searchablePlans, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.35,
        keys: ['title', 'description', 'cadence', 'category', 'plan.slug'],
      }),
    [searchablePlans]
  );
  const filteredPlans = React.useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return allPlans;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const prefixMatches = searchablePlans
      .filter(({ title, description, cadence, plan }) =>
        [title, description, cadence, plan.slug].some((value) =>
          value.toLowerCase().includes(normalizedQuery)
        )
      )
      .map(({ plan }) => plan);
    const fuzzyMatches = planSearch.search(trimmedQuery).map((result) => result.item.plan);

    return [
      ...new Map([...prefixMatches, ...fuzzyMatches].map((plan) => [plan.id, plan])).values(),
    ];
  }, [allPlans, planSearch, searchQuery, searchablePlans]);

  const dailyRhythmPlans = filteredPlans.filter((plan) => isRecurringPlan(plan));
  const categoryPlans = filteredPlans.filter((plan) => !isRecurringPlan(plan));

  // Group non-recurring plans by category
  const plansByCategory = categoryPlans.reduce<Record<string, ReadingPlan[]>>((acc, plan) => {
    const cat = plan.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(plan);
    return acc;
  }, {});

  const categories = Object.keys(plansByCategory);

  const styles = createFindPlansStyles(colors);

  const renderBrowsePlanCard = (plan: ReadingPlan) => {
    const isEnrolled = enrolledPlanIds.has(plan.id);
    const actionLabel = isEnrolled
      ? t('readingPlans.enrolled')
      : t('readingPlans.startPlan', { defaultValue: 'Start Plan' }).replace(/\s+Plan$/i, '');

    return (
      <TouchableOpacity
        style={[styles.planCard, { width: cardWidth }]}
        onPress={() => onPlanPress(plan.id)}
        activeOpacity={0.85}
      >
        <CoverImage plan={plan} width={coverWidth} height={coverHeight} colors={colors} t={t} />
        <View style={styles.planCardBody}>
          <Text style={styles.planCardTitle} numberOfLines={2}>
            {t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })}
          </Text>
          {formatPlanCadenceLabel(plan, t) ? (
            <Text style={styles.planCadence} numberOfLines={1}>
              {formatPlanCadenceLabel(plan, t)}
            </Text>
          ) : null}
          <View style={styles.planCardMeta}>
            <View style={styles.durationBadge}>
              <Text style={styles.durationBadgeText}>{plan.duration_days}d</Text>
            </View>
            <View
              style={[
                styles.enrollBadge,
                isEnrolled
                  ? { backgroundColor: colors.accentPrimary }
                  : { borderWidth: 1, borderColor: colors.accentPrimary },
              ]}
            >
              <Text
                style={[
                  styles.enrollBadgeText,
                  { color: isEnrolled ? colors.onAccent : colors.accentPrimary },
                ]}
              >
                {actionLabel}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.content}>
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchWrap,
            { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
          ]}
        >
          <Ionicons name="search" size={24} color={colors.secondaryText} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('readingPlans.searchPlansPlaceholder')}
            placeholderTextColor={colors.secondaryText}
            style={[styles.searchInput, { color: colors.primaryText }]}
            accessibilityLabel={t('readingPlans.searchPlansPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {dailyRhythmPlans.length > 0 ? (
        <View style={styles.categorySection}>
          <Text style={styles.categoryHeader}>{t('readingPlans.dailyRhythms')}</Text>
          <FlatList
            horizontal
            data={dailyRhythmPlans}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
            renderItem={({ item: plan }) => renderBrowsePlanCard(plan)}
          />
        </View>
      ) : null}

      {/* Plan cards by category */}
      {categories.map((category) => {
        const plans = plansByCategory[category];
        if (!plans || plans.length === 0) return null;

        const categoryKeyMap: Record<string, Parameters<typeof t>[0]> = {
          chronological: 'readingPlans.categoryChronological',
          'book-study': 'readingPlans.categoryBookStudy',
          topical: 'readingPlans.categoryTopical',
          devotional: 'readingPlans.categoryDevotional',
        };
        const categoryKey = categoryKeyMap[category];
        const label = categoryKey
          ? t(categoryKey)
          : category
              .split('-')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');

        return (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryHeader}>{label}</Text>
            <FlatList
              horizontal
              data={plans}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
              renderItem={({ item: plan }) => renderBrowsePlanCard(plan)}
            />
          </View>
        );
      })}

      {filteredPlans.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {searchQuery.trim() ? t('readingPlans.noPlanSearchResults') : t('readingPlans.noPlans')}
          </Text>
        </View>
      )}
    </View>
  );
}

const createFindPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.xxl,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      ...typography.body,
      fontWeight: '500',
      flex: 1,
      paddingVertical: spacing.sm,
    },
    categorySection: {
      gap: spacing.lg,
    },
    categoryHeader: {
      ...typography.cardTitle,
      fontSize: 22,
      lineHeight: 28,
      color: colors.primaryText,
    },
    categoryList: {
      gap: spacing.md,
      paddingRight: layout.screenPadding,
    },
    planCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.sm,
      minHeight: 228,
      gap: spacing.sm,
    },
    planCardBody: {
      flex: 1,
      gap: spacing.sm,
    },
    planCardTitle: {
      ...typography.cardTitle,
      fontSize: 18,
      lineHeight: 22,
      color: colors.primaryText,
    },
    planCadence: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    planCardMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'nowrap',
      marginTop: 'auto',
    },
    durationBadge: {
      backgroundColor: colors.cardBorder,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: 32,
      justifyContent: 'center',
      flexShrink: 0,
    },
    durationBadgeText: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    enrollBadge: {
      borderRadius: radius.lg,
      minHeight: 32,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    enrollBadgeText: {
      ...typography.label,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl,
    },
    emptyText: {
      ...typography.body,
      color: colors.secondaryText,
      textAlign: 'center',
    },
  });

// ---------------------------------------------------------------------------
// Completed Plans section
// ---------------------------------------------------------------------------

interface CompletedPlansSectionProps {
  completedPlans: CompletedPlanRow[];
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  colors: ThemeColors;
}

function CompletedPlansSection({
  completedPlans,
  onPlanPress,
  onDeletePlan,
  colors,
}: CompletedPlansSectionProps) {
  const { t } = useTranslation();
  const styles = createCompletedStyles(colors);

  if (completedPlans.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={48} color={colors.secondaryText} />
        <Text style={styles.emptyTitle}>{t('readingPlans.noCompletedPlans')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {completedPlans.map((item) => {
        const completedDate = item.completed_at
          ? new Date(item.completed_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null;
        return (
          <SwipeablePlanRow key={item.id} onDelete={() => onDeletePlan(item.plan.id)}>
            <TouchableOpacity
              style={styles.card}
              onPress={() => onPlanPress(item.plan.id)}
              activeOpacity={0.7}
            >
              <CoverImage plan={item.plan} width={64} height={64} colors={colors} t={t} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {t(item.plan.title_key as Parameters<typeof t>[0])}
                </Text>
                {completedDate && <Text style={styles.completedDate}>{completedDate}</Text>}
              </View>
              <Ionicons name="checkmark-circle" size={24} color={colors.accentPrimary} />
            </TouchableOpacity>
          </SwipeablePlanRow>
        );
      })}
    </View>
  );
}

const createCompletedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.xxxl,
    },
    emptyTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
      textAlign: 'center',
    },
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.lg,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      minHeight: 100,
      paddingHorizontal: layout.cardPadding,
      paddingVertical: spacing.lg,
    },
    cardBody: {
      flex: 1,
      gap: spacing.sm,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    completedDate: {
      ...typography.micro,
      color: colors.secondaryText,
    },
  });

// ---------------------------------------------------------------------------
// Main PlansHomeScreen
// ---------------------------------------------------------------------------

export function PlansHomeScreen() {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);

  // Data state
  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userProgress = React.useMemo(
    () =>
      Object.values(progressByPlanId).sort((left, right) =>
        right.started_at.localeCompare(left.started_at)
      ),
    [progressByPlanId]
  );
  const completedPlans = React.useMemo(
    () =>
      userProgress
        .filter((progress) => progress.is_completed)
        .map((progress) => {
          const plan = allPlans.find((item) => item.id === progress.plan_id);
          return plan ? { ...progress, plan } : null;
        })
        .filter((item): item is CompletedPlanRow => item !== null),
    [allPlans, userProgress]
  );

  const tabs: { key: PlanTab; labelKey: string }[] = [
    { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
    { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
    { key: 'completed', labelKey: 'readingPlans.completed' },
  ];

  const hydratePlanProgress = useCallback(async () => {
    await getUserPlanProgress().catch(() => {});
  }, []);

  const loadAllData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);

      const allPlansResult = await listReadingPlans();
      if (allPlansResult.success && allPlansResult.data) {
        setAllPlans(allPlansResult.data);
      }
      if (!quiet) setLoading(false);

      void hydratePlanProgress();
    },
    [hydratePlanProgress]
  );

  useEffect(() => {
    loadAllData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadAllData]);

  useFocusEffect(
    useCallback(() => {
      loadAllData(true).catch(() => {});
    }, [loadAllData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true).catch(() => {});
    setRefreshing(false);
  }, [loadAllData]);

  const handlePlanPress = useCallback(
    (planId: string) => {
      lightHaptic();
      navigation.navigate('PlanDetail', { planId });
    },
    [navigation]
  );

  const handleDeletePlan = useCallback(
    async (planId: string) => {
      const result = await unenrollFromPlan(planId);
      if (!result.success && result.error) {
        Alert.alert(t('common.error'), result.error);
        return;
      }
      successHaptic();
    },
    [t]
  );

  const handleAddPlan = useCallback(() => {
    lightHaptic();
    setActiveTab('find-plans');
  }, []);

  const styles = createMainStyles(colors);

  const tabStrip = (
    <View style={styles.tabSticky}>
      <View style={[styles.tabRow, { borderBottomColor: colors.cardBorder }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tab}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.primaryText : colors.tabInactive },
                  isActive ? styles.tabLabelActive : null,
                ]}
                numberOfLines={1}
              >
                {t(tab.labelKey as Parameters<typeof t>[0])}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  { backgroundColor: isActive ? colors.accentPrimary : 'transparent' },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPrimary}
          />
        }
      >
        <Text style={[styles.title, displayFont.bold]}>{t('readingPlans.title')}</Text>
        {tabStrip}

        {loading && allPlans.length === 0 ? (
          <View style={styles.loadingGrid}>
            <CardSkeleton showImage lines={2} />
            <CardSkeleton showImage lines={2} />
            <CardSkeleton showImage lines={2} />
          </View>
        ) : (
          <>
            {activeTab === 'my-plans' && (
              <MyPlansSection
                allPlans={allPlans}
                userProgress={userProgress}
                chaptersRead={chaptersRead}
                listeningHistory={listeningHistory}
                onAddPlan={handleAddPlan}
                onPlanPress={handlePlanPress}
                onDeletePlan={handleDeletePlan}
                colors={colors}
              />
            )}
            {activeTab === 'find-plans' && (
              <FindPlansSection
                allPlans={allPlans}
                userProgress={userProgress}
                onPlanPress={handlePlanPress}
                colors={colors}
              />
            )}
            {activeTab === 'completed' && (
              <CompletedPlansSection
                completedPlans={completedPlans}
                onPlanPress={handlePlanPress}
                onDeletePlan={handleDeletePlan}
                colors={colors}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createMainStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      // Screen title, not reading copy — the EL display face, matching Home,
      // More and Settings.
      ...typography.screenTitle,
      fontSize: 34,
      lineHeight: 42,
      color: colors.primaryText,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    tabSticky: {
      backgroundColor: colors.background,
      paddingBottom: spacing.sm,
    },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: layout.screenPadding,
      gap: spacing.xl,
      borderBottomWidth: 1,
    },
    tab: {
      alignItems: 'center',
      justifyContent: 'flex-end',
      minHeight: layout.minTouchTarget,
    },
    tabLabel: {
      ...typography.label,
      fontSize: 16,
      lineHeight: 21,
      paddingBottom: spacing.sm,
    },
    tabLabelActive: {
      ...typography.bodyStrong,
      fontSize: 16,
      lineHeight: 21,
    },
    tabUnderline: {
      height: 2,
      alignSelf: 'stretch',
      borderRadius: radius.pill,
    },
    loadingGrid: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      gap: spacing.lg,
    },
    scrollContent: {
      paddingBottom: layout.tabBarBaseHeight + spacing.xl,
    },
  });
