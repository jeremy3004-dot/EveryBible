import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import type { PlansStackParamList } from '../../navigation/types';
import {
  listReadingPlans,
  getUserPlanProgress,
  getCompletedPlans,
  unenrollFromPlan,
} from '../../services/plans/readingPlanService';
import { getReadingPlanCoverSource } from '../../services/plans/readingPlanAssets';
import type {
  ReadingPlan,
  ReadingPlanRhythm,
  UserReadingPlanProgress,
} from '../../services/plans/types';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { useProgressStore } from '../../stores/progressStore';
import {
  summarizeReadingActivity,
  formatLocalDateKey,
} from '../../services/progress/readingActivity';

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
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Ionicons name="trash-outline" size={18} color={colors.cardBackground} />
            <Text style={[swipeableStyles.deleteText, { color: colors.cardBackground }]}>
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
}: {
  plan: ReadingPlan;
  width: number;
  height: number;
  colors: ThemeColors;
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
  rhythms: ReadingPlanRhythm[];
  onAddPlan: () => void;
  onRhythmPress: (rhythmId: string) => void;
  onCreateRhythm: () => void;
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  colors: ThemeColors;
}

interface RhythmsSectionProps {
  rhythms: ReadingPlanRhythm[];
  allPlans: ReadingPlan[];
  onRhythmPress: (rhythmId: string) => void;
  onCreateRhythm: () => void;
  colors: ThemeColors;
}

function RhythmsSection({
  rhythms,
  allPlans,
  onRhythmPress,
  onCreateRhythm,
  colors,
}: RhythmsSectionProps) {
  const { t } = useTranslation();
  const styles = createRhythmsStyles(colors);
  const planTitleById = Object.fromEntries(
    allPlans.map((plan) => [plan.id, t(plan.title_key as Parameters<typeof t>[0])])
  );

  return (
    <View style={styles.section}>
      <View style={styles.headerContent}>
        <Text style={styles.sectionTitle}>{t('readingPlans.rhythms')}</Text>
        <TouchableOpacity
          onPress={onCreateRhythm}
          activeOpacity={0.8}
          style={styles.createButton}
        >
          <Ionicons name="add" size={16} color={colors.cardBackground} />
          <Text style={styles.createButtonLabel}>{t('readingPlans.createRhythm')}</Text>
        </TouchableOpacity>
      </View>

      {rhythms.length === 0 ? (
        <TouchableOpacity
          onPress={onCreateRhythm}
          activeOpacity={0.85}
          style={styles.emptyCard}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="layers-outline" size={20} color={colors.accentPrimary} />
          </View>
          <View style={styles.emptyBody}>
            <Text style={styles.emptyTitle}>{t('readingPlans.noRhythms')}</Text>
            <Text style={styles.emptyText}>{t('readingPlans.noRhythmsBody')}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        rhythms.map((rhythm) => {
          const previewTitles = rhythm.planIds
            .slice(0, 2)
            .map((planId) => planTitleById[planId] ?? planId)
            .join(' • ');

          return (
            <TouchableOpacity
              key={rhythm.id}
              style={styles.card}
              onPress={() => onRhythmPress(rhythm.id)}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardBadge}>
                  <Ionicons name="layers-outline" size={18} color={colors.accentPrimary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {rhythm.title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {t('readingPlans.rhythmPlanCount', { count: rhythm.planIds.length })}
                  </Text>
                  {previewTitles ? (
                    <Text style={styles.cardPreview} numberOfLines={2}>
                      {previewTitles}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

function MyPlansSection({
  allPlans,
  userProgress,
  rhythms,
  onAddPlan,
  onRhythmPress,
  onCreateRhythm,
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
    .filter((item): item is { progress: UserReadingPlanProgress; plan: ReadingPlan } => item !== null);

  const styles = createMyPlansStyles(colors);

  return (
    <View style={styles.content}>
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('readingPlans.plans')}</Text>
          {activePlans.length === 0 ? (
            <TouchableOpacity
              onPress={onAddPlan}
              activeOpacity={0.8}
              style={styles.primaryButton}
            >
              <Ionicons name="add" size={16} color={colors.cardBackground} />
              <Text style={styles.primaryButtonLabel}>{t('readingPlans.addFirstPlan')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

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
              <SwipeablePlanRow
                key={plan.id}
                onDelete={() => onDeletePlan(plan.id)}
              >
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => onPlanPress(plan.id)}
                  activeOpacity={0.7}
                >
                  <CoverImage plan={plan} width={68} height={68} colors={colors} />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {t(plan.title_key as Parameters<typeof t>[0])}
                    </Text>
                    <View style={styles.progressBlock}>
                      <Text style={styles.dayCounter}>
                        {t('readingPlans.dayOf', {
                          current: progress.current_day,
                          total: plan.duration_days,
                        })}
                      </Text>
                      <ProgressBar progress={progressRatio} colors={colors} />
                    </View>
                  </View>
                </TouchableOpacity>
              </SwipeablePlanRow>
            );
          })
        )}
      </View>

      <View style={styles.rhythmsSection}>
        <RhythmsSection
          rhythms={rhythms}
          allPlans={allPlans}
          onRhythmPress={onRhythmPress}
          onCreateRhythm={onCreateRhythm}
          colors={colors}
        />
      </View>
      {/* ActivityStreakStrip hidden for now */}
    </View>
  );
}

const createMyPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      gap: spacing.xl,
    },
    sectionBlock: {
      gap: spacing.md,
    },
    sectionHeader: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    primaryButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.accentPrimary,
      minHeight: layout.minTouchTarget,
      paddingHorizontal: spacing.md,
    },
    primaryButtonLabel: {
      ...typography.label,
      color: colors.cardBackground,
    },
    rhythmsSection: {
      paddingTop: spacing.lg,
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
      alignItems: 'flex-start',
      gap: spacing.lg,
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      minHeight: 108,
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
    progressBlock: {
      gap: spacing.sm,
    },
    dayCounter: {
      ...typography.micro,
      color: colors.secondaryText,
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

const createRhythmsStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: spacing.md,
    },
    headerContent: {
      gap: spacing.md,
    },
    sectionTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    createButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.accentPrimary,
      minHeight: layout.minTouchTarget,
      paddingHorizontal: spacing.md,
    },
    createButtonLabel: {
      ...typography.label,
      color: colors.cardBackground,
    },
    emptyCard: {
      flexDirection: 'row',
      gap: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      padding: layout.cardPadding,
    },
    emptyIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    emptyBody: {
      flex: 1,
      gap: spacing.xs,
    },
    emptyTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    emptyText: {
      ...typography.body,
      color: colors.secondaryText,
    },
    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      padding: layout.cardPadding,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    cardBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
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
      ...typography.micro,
      color: colors.secondaryText,
    },
    cardPreview: {
      ...typography.body,
      color: colors.secondaryText,
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


function FindPlansSection({
  allPlans,
  userProgress,
  onPlanPress,
  colors,
}: FindPlansSectionProps) {
  const { t } = useTranslation();
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
    <View style={styles.content}>
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
                    <CoverImage plan={plan} width={140} height={88} colors={colors} />
                    <View style={styles.planCardBody}>
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
    </View>
  );
}

const createFindPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.md,
      gap: spacing.xl,
    },
    categorySection: {
      gap: spacing.md,
    },
    categoryHeader: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    categoryList: {
      gap: spacing.lg,
      paddingRight: spacing.lg,
    },
    planCard: {
      width: 156,
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
      ...typography.label,
      color: colors.primaryText,
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
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      minHeight: 32,
      justifyContent: 'center',
      flexShrink: 0,
    },
    durationBadgeText: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    enrollBadge: {
      borderRadius: radius.pill,
      minHeight: 32,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
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
          <SwipeablePlanRow
            key={item.id}
            onDelete={() => onDeletePlan(item.plan.id)}
          >
            <TouchableOpacity
              style={styles.card}
              onPress={() => onPlanPress(item.plan.id)}
              activeOpacity={0.7}
            >
              <CoverImage plan={item.plan} width={64} height={64} colors={colors} />
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
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');
  const { rhythmOrder, rhythmsById } = useReadingPlansStore(
    useShallow((state) => ({
      rhythmOrder: state.rhythmOrder,
      rhythmsById: state.rhythmsById,
    }))
  );
  const rhythms = useMemo(
    () =>
      rhythmOrder
        .map((rhythmId) => rhythmsById[rhythmId] ?? null)
        .filter((rhythm): rhythm is ReadingPlanRhythm => rhythm !== null),
    [rhythmOrder, rhythmsById]
  );

  // Data state
  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [userProgress, setUserProgress] = useState<UserReadingPlanProgress[]>([]);
  const [completedPlans, setCompletedPlans] = useState<CompletedPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: { key: PlanTab; labelKey: string }[] = [
    { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
    { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
    { key: 'completed', labelKey: 'readingPlans.completed' },
  ];

  const loadAllData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);

    const [allPlansResult, progressResult, completedResult] = await Promise.all([
      listReadingPlans(),
      getUserPlanProgress(),
      getCompletedPlans(),
    ]);

    if (allPlansResult.success && allPlansResult.data) {
      setAllPlans(allPlansResult.data);
    }
    if (progressResult.success && progressResult.data) {
      setUserProgress(progressResult.data);
    }
    if (completedResult.success && completedResult.data) {
      setCompletedPlans(completedResult.data);
    }
    if (!quiet) setLoading(false);
  }, []);

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
      navigation.navigate('PlanDetail', { planId });
    },
    [navigation]
  );

  const handleDeletePlan = useCallback(async (planId: string) => {
    const result = await unenrollFromPlan(planId);
    if (result.success) {
      setUserProgress((prev) => prev.filter((progress) => progress.plan_id !== planId));
      setCompletedPlans((prev) => prev.filter((item) => item.plan.id !== planId));
    } else if (result.error) {
      Alert.alert(t('common.error'), result.error);
    }
  }, [t]);

  const handleRhythmPress = useCallback(
    (rhythmId: string) => {
      navigation.navigate('RhythmDetail', { rhythmId });
    },
    [navigation]
  );

  const handleCreateRhythm = useCallback(() => {
    navigation.navigate('RhythmComposer', {});
  }, [navigation]);

  const handleAddPlan = useCallback(() => {
    setActiveTab('find-plans');
  }, []);

  const styles = createMainStyles(colors);

  const tabStrip = (
    <View style={styles.tabSticky}>
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
                ? { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }
                : { borderColor: colors.cardBorder },
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? colors.cardBackground : colors.secondaryText },
              ]}
              numberOfLines={1}
            >
              {t(tab.labelKey as Parameters<typeof t>[0])}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accentPrimary} />
        }
      >
        <Text style={styles.title}>{t('readingPlans.title')}</Text>
        {tabStrip}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
          </View>
        ) : (
          <>
            {activeTab === 'my-plans' && (
              <MyPlansSection
                allPlans={allPlans}
                userProgress={userProgress}
                rhythms={rhythms}
                onAddPlan={handleAddPlan}
                onRhythmPress={handleRhythmPress}
                onCreateRhythm={handleCreateRhythm}
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
      ...typography.screenTitle,
      color: colors.primaryText,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    tabSticky: {
      backgroundColor: colors.background,
      paddingBottom: spacing.md,
    },
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: layout.screenPadding,
      gap: spacing.sm,
      paddingBottom: spacing.md,
      alignItems: 'center',
    },
    tabPill: {
      paddingHorizontal: spacing.md,
      minHeight: layout.minTouchTarget,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    tabLabel: {
      ...typography.tabLabel,
    },
    loadingContainer: {
      minHeight: 240,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingBottom: layout.tabBarBaseHeight + spacing.xl,
    },
  });
