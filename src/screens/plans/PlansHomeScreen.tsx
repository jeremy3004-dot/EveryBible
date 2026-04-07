import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import type { PlansStackParamList } from '../../navigation/types';
import {
  listReadingPlans,
  getUserPlanProgress,
  getSavedPlans,
  getCompletedPlans,
  getFeaturedPlans,
} from '../../services/plans/readingPlanService';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/supabase/types';
import { useProgressStore } from '../../stores/progressStore';
import {
  summarizeReadingActivity,
  formatLocalDateKey,
} from '../../services/progress/readingActivity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanTab = 'my-plans' | 'find-plans' | 'saved' | 'completed';
type NavigationProp = NativeStackNavigationProp<PlansStackParamList>;

type CompletedPlanRow = UserReadingPlanProgress & { plan: ReadingPlan };

// ---------------------------------------------------------------------------
// Cover image fallback (shared by multiple sections)
// ---------------------------------------------------------------------------

function CoverImage({
  uri,
  width,
  height,
  colors,
}: {
  uri: string | null;
  width: number;
  height: number;
  colors: ThemeColors;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width, height, borderRadius: radius.md }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.md,
        backgroundColor: colors.accentSecondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="book-outline" size={Math.floor(height * 0.4)} color={colors.cardBackground} />
    </View>
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

const inlineStyles = StyleSheet.create({
  progressTrack: {
    height: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: radius.pill,
  },
});

// ---------------------------------------------------------------------------
// Activity streak strip (14 days)
// ---------------------------------------------------------------------------

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
  onPlanPress: (planId: string) => void;
  colors: ThemeColors;
  refreshing: boolean;
  onRefresh: () => void;
}

function MyPlansSection({
  allPlans,
  userProgress,
  onPlanPress,
  colors,
  refreshing,
  onRefresh,
}: MyPlansSectionProps) {
  const { t } = useTranslation();

  const activePlans = userProgress
    .filter((p) => !p.is_completed)
    .map((p) => {
      const plan = allPlans.find((pl) => pl.id === p.plan_id);
      return plan ? { progress: p, plan } : null;
    })
    .filter((item): item is { progress: UserReadingPlanProgress; plan: ReadingPlan } => item !== null);

  const styles = createMyPlansStyles(colors);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
    >
      {activePlans.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={48} color={colors.secondaryText} />
          <Text style={styles.emptyTitle}>{t('readingPlans.noActivePlans')}</Text>
          <Text style={styles.emptyBody}>{t('readingPlans.findPlans')}</Text>
        </View>
      ) : (
        activePlans.map(({ progress, plan }) => {
          const progressRatio =
            plan.duration_days > 0 ? (progress.current_day - 1) / plan.duration_days : 0;
          return (
            <TouchableOpacity
              key={plan.id}
              style={styles.card}
              onPress={() => onPlanPress(plan.id)}
              activeOpacity={0.7}
            >
              <CoverImage
                uri={plan.cover_image_url}
                width={60}
                height={60}
                colors={colors}
              />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {t(plan.title_key as Parameters<typeof t>[0])}
                </Text>
                <Text style={styles.dayCounter}>
                  {t('readingPlans.dayOf', {
                    current: progress.current_day,
                    total: plan.duration_days,
                  })}
                </Text>
                <ProgressBar progress={progressRatio} colors={colors} />
              </View>
            </TouchableOpacity>
          );
        })
      )}
      <ActivityStreakStrip colors={colors} />
    </ScrollView>
  );
}

const createMyPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xxxl,
      gap: spacing.md,
    },
    emptyTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
      textAlign: 'center',
    },
    emptyBody: {
      ...typography.body,
      color: colors.secondaryText,
      textAlign: 'center',
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: layout.denseCardPadding,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    dayCounter: {
      ...typography.micro,
      color: colors.secondaryText,
    },
  });

// ---------------------------------------------------------------------------
// Find Plans section
// ---------------------------------------------------------------------------

interface FindPlansSectionProps {
  allPlans: ReadingPlan[];
  featuredPlans: ReadingPlan[];
  userProgress: UserReadingPlanProgress[];
  onPlanPress: (planId: string) => void;
  colors: ThemeColors;
  refreshing: boolean;
  onRefresh: () => void;
}

const TOPIC_CHIPS = [
  'Love',
  'Healing',
  'Hope',
  'Anxiety',
  'Anger',
  'Depression',
  'Faith',
  'Prayer',
] as const;

// Opacity values for chip backgrounds (applied on top of accentPrimary)
const CHIP_OPACITIES = [1, 0.85, 0.75, 0.9, 0.8, 0.7, 0.95, 0.65] as const;

function FindPlansSection({
  allPlans,
  featuredPlans,
  userProgress,
  onPlanPress,
  colors,
  refreshing,
  onRefresh,
}: FindPlansSectionProps) {
  const { t } = useTranslation();
  const featuredPlan = featuredPlans[0] ?? null;
  const enrolledPlanIds = new Set(userProgress.map((p) => p.plan_id));

  // Group allPlans by category
  const plansByCategory = allPlans.reduce<Record<string, ReadingPlan[]>>((acc, plan) => {
    const cat = plan.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(plan);
    return acc;
  }, {});

  const categories = Object.keys(plansByCategory);

  const styles = createFindPlansStyles(colors);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
    >
      {/* Featured hero card */}
      {featuredPlan && (
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => onPlanPress(featuredPlan.id)}
          activeOpacity={0.8}
        >
          {featuredPlan.cover_image_url ? (
            <Image
              source={{ uri: featuredPlan.cover_image_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: colors.accentSecondary }]}>
              <Ionicons name="book-outline" size={64} color={colors.cardBackground} />
            </View>
          )}
          <View style={styles.heroDurationBadge}>
            <Text style={styles.heroDurationText}>
              {featuredPlan.duration_days}-DAY PLAN
            </Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {t(featuredPlan.title_key as Parameters<typeof t>[0])}
          </Text>
          {featuredPlan.description_key && (
            <Text style={styles.heroDesc} numberOfLines={3}>
              {t(featuredPlan.description_key as Parameters<typeof t>[0]).slice(0, 100)}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Topic category chips */}
      <View style={styles.chipGrid}>
        {TOPIC_CHIPS.map((topic, index) => (
          <TouchableOpacity
            key={topic}
            style={[
              styles.chip,
              {
                backgroundColor: colors.accentPrimary,
                opacity: CHIP_OPACITIES[index % CHIP_OPACITIES.length],
              },
            ]}
            activeOpacity={0.7}
            // TODO: filter by tag
          >
            <Text style={styles.chipText}>{topic}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Plan cards by category */}
      {categories.map((category) => {
        const plans = plansByCategory[category];
        if (!plans || plans.length === 0) return null;

        const label = category
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
              renderItem={({ item: plan }) => {
                const isEnrolled = enrolledPlanIds.has(plan.id);
                return (
                  <TouchableOpacity
                    style={styles.planCard}
                    onPress={() => onPlanPress(plan.id)}
                    activeOpacity={0.7}
                  >
                    <CoverImage uri={plan.cover_image_url} width={120} height={80} colors={colors} />
                    <Text style={styles.planCardTitle} numberOfLines={2}>
                      {t(plan.title_key as Parameters<typeof t>[0])}
                    </Text>
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
                            { color: isEnrolled ? colors.cardBackground : colors.accentPrimary },
                          ]}
                        >
                          {isEnrolled ? t('readingPlans.enrolled') : t('readingPlans.startPlan')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        );
      })}

      {allPlans.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('readingPlans.noPlans')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const createFindPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      gap: spacing.xl,
    },
    heroCard: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      gap: spacing.sm,
    },
    heroImage: {
      width: '100%',
      height: 200,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroDurationBadge: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    heroDurationText: {
      ...typography.eyebrow,
      color: colors.cardBackground,
      fontSize: 10,
    },
    heroTitle: {
      ...typography.sectionTitle,
      color: colors.primaryText,
      paddingHorizontal: layout.denseCardPadding,
    },
    heroDesc: {
      ...typography.body,
      color: colors.secondaryText,
      paddingHorizontal: layout.denseCardPadding,
      paddingBottom: layout.denseCardPadding,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    chipText: {
      ...typography.label,
      color: colors.cardBackground,
    },
    categorySection: {
      gap: spacing.md,
    },
    categoryHeader: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    categoryList: {
      gap: spacing.md,
      paddingRight: spacing.sm,
    },
    planCard: {
      width: 140,
      gap: spacing.xs,
    },
    planCardTitle: {
      ...typography.label,
      color: colors.primaryText,
    },
    planCardMeta: {
      flexDirection: 'row',
      gap: spacing.xs,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    durationBadge: {
      backgroundColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    durationBadgeText: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    enrollBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    enrollBadgeText: {
      ...typography.micro,
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
// Saved Plans section
// ---------------------------------------------------------------------------

interface SavedPlansSectionProps {
  savedPlans: ReadingPlan[];
  onPlanPress: (planId: string) => void;
  colors: ThemeColors;
  refreshing: boolean;
  onRefresh: () => void;
}

function SavedPlansSection({
  savedPlans,
  onPlanPress,
  colors,
  refreshing,
  onRefresh,
}: SavedPlansSectionProps) {
  const { t } = useTranslation();
  const styles = createSavedStyles(colors);

  if (savedPlans.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="bookmark-outline" size={48} color={colors.secondaryText} />
        <Text style={styles.emptyTitle}>{t('readingPlans.noSavedPlans')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={savedPlans}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
      renderItem={({ item: plan }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onPlanPress(plan.id)}
          activeOpacity={0.7}
        >
          <CoverImage uri={plan.cover_image_url} width={60} height={60} colors={colors} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {t(plan.title_key as Parameters<typeof t>[0])}
            </Text>
            <View style={styles.cardMeta}>
              <Text style={styles.duration}>{plan.duration_days}d</Text>
              {plan.category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>
                    {plan.category
                      .split('-')
                      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const createSavedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.screenPadding,
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
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: layout.denseCardPadding,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
    },
    cardTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    cardMeta: {
      flexDirection: 'row',
      gap: spacing.xs,
      alignItems: 'center',
    },
    duration: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    categoryBadge: {
      backgroundColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    categoryText: {
      ...typography.micro,
      color: colors.secondaryText,
    },
  });

// ---------------------------------------------------------------------------
// Completed Plans section
// ---------------------------------------------------------------------------

interface CompletedPlansSectionProps {
  completedPlans: CompletedPlanRow[];
  onPlanPress: (planId: string) => void;
  colors: ThemeColors;
  refreshing: boolean;
  onRefresh: () => void;
}

function CompletedPlansSection({
  completedPlans,
  onPlanPress,
  colors,
  refreshing,
  onRefresh,
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
    <FlatList
      data={completedPlans}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
      renderItem={({ item }) => {
        const completedDate = item.completed_at
          ? new Date(item.completed_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null;
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => onPlanPress(item.plan.id)}
            activeOpacity={0.7}
          >
            <CoverImage uri={item.plan.cover_image_url} width={60} height={60} colors={colors} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {t(item.plan.title_key as Parameters<typeof t>[0])}
              </Text>
              {completedDate && (
                <Text style={styles.completedDate}>{completedDate}</Text>
              )}
            </View>
            <Ionicons name="checkmark-circle" size={24} color={colors.accentPrimary} />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const createCompletedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.screenPadding,
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
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: layout.denseCardPadding,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
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
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');

  // Data state
  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [userProgress, setUserProgress] = useState<UserReadingPlanProgress[]>([]);
  const [savedPlans, setSavedPlans] = useState<ReadingPlan[]>([]);
  const [completedPlans, setCompletedPlans] = useState<CompletedPlanRow[]>([]);
  const [featuredPlans, setFeaturedPlans] = useState<ReadingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: { key: PlanTab; labelKey: string }[] = [
    { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
    { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
    { key: 'saved', labelKey: 'readingPlans.saved' },
    { key: 'completed', labelKey: 'readingPlans.completed' },
  ];

  const loadAllData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);

    const [allPlansResult, progressResult, savedResult, completedResult, featuredResult] =
      await Promise.all([
        listReadingPlans(),
        getUserPlanProgress(),
        getSavedPlans(),
        getCompletedPlans(),
        getFeaturedPlans(),
      ]);

    if (allPlansResult.success && allPlansResult.data) {
      setAllPlans(allPlansResult.data);
    }
    if (progressResult.success && progressResult.data) {
      setUserProgress(progressResult.data);
    }
    if (savedResult.success && savedResult.data) {
      setSavedPlans(savedResult.data);
    }
    if (completedResult.success && completedResult.data) {
      setCompletedPlans(completedResult.data);
    }
    if (featuredResult.success && featuredResult.data) {
      setFeaturedPlans(featuredResult.data);
    }

    if (!quiet) setLoading(false);
  }, []);

  useEffect(() => {
    loadAllData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true).catch(() => {});
    setRefreshing(false);
  }, [loadAllData]);

  const handlePlanPress = useCallback(
    (planId: string) => {
      navigation.navigate('PlanDetail', { planId });
    },
    [navigation]
  );

  const styles = createMainStyles(colors);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.title}>{t('readingPlans.title')}</Text>

      {/* Segmented tab control */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tabPill,
              activeTab === tab.key
                ? { backgroundColor: colors.accentPrimary }
                : { borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? colors.cardBackground : colors.secondaryText },
              ]}
            >
              {t(tab.labelKey as Parameters<typeof t>[0])}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      ) : (
        <View style={styles.contentArea}>
          {activeTab === 'my-plans' && (
            <MyPlansSection
              allPlans={allPlans}
              userProgress={userProgress}
              onPlanPress={handlePlanPress}
              colors={colors}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
          {activeTab === 'find-plans' && (
            <FindPlansSection
              allPlans={allPlans}
              featuredPlans={featuredPlans}
              userProgress={userProgress}
              onPlanPress={handlePlanPress}
              colors={colors}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
          {activeTab === 'saved' && (
            <SavedPlansSection
              savedPlans={savedPlans}
              onPlanPress={handlePlanPress}
              colors={colors}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
          {activeTab === 'completed' && (
            <CompletedPlansSection
              completedPlans={completedPlans}
              onPlanPress={handlePlanPress}
              colors={colors}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
        </View>
      )}
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
      ...typography.screenTitle,
      color: colors.primaryText,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    tabRow: {
      paddingHorizontal: layout.screenPadding,
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    tabPill: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    tabLabel: {
      ...typography.label,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contentArea: {
      flex: 1,
    },
  });
