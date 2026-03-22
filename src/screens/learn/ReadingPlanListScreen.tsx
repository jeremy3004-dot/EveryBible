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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import {
  enrollInPlan,
  getUserPlanProgress,
  listReadingPlans,
} from '../../services/plans/readingPlanService';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/supabase/types';
import type { LearnStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<LearnStackParamList, 'ReadingPlanList'>;

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({
  progress,
  color,
  backgroundColor,
}: {
  progress: number;
  color: string;
  backgroundColor: string;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={[progressBarStyles.track, { backgroundColor }]}>
      <View style={[progressBarStyles.fill, { width: `${clamped * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const progressBarStyles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: radius.pill,
  },
});

// ---------------------------------------------------------------------------
// Category chip
// ---------------------------------------------------------------------------

function CategoryChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: color }]}>
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

// ---------------------------------------------------------------------------
// Active plan card (enrolled plans with progress)
// ---------------------------------------------------------------------------

interface ActivePlanCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress;
  onPress: () => void;
}

function ActivePlanCard({ plan, progress, onPress }: ActivePlanCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const totalDays = plan.duration_days;
  const currentDay = progress.current_day;
  const completedCount = Object.keys(progress.completed_entries).length;
  const fraction = totalDays > 0 ? completedCount / totalDays : 0;

  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        activePlanStyles.card,
        { backgroundColor: colors.cardBackground, borderColor: colors.accentPrimary },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('readingPlans.dayOf', { current: currentDay, total: totalDays })}
    >
      <View style={activePlanStyles.row}>
        <Text style={[activePlanStyles.title, { color: colors.primaryText }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={[activePlanStyles.dayBadge, { backgroundColor: colors.accentPrimary }]}>
          <Text style={[activePlanStyles.dayBadgeText, { color: colors.cardBackground }]}>
            {t('readingPlans.dayOf', { current: currentDay, total: totalDays })}
          </Text>
        </View>
      </View>
      <ProgressBar
        progress={fraction}
        color={colors.accentPrimary}
        backgroundColor={colors.cardBorder}
      />
      <Text style={[activePlanStyles.percent, { color: colors.secondaryText }]}>
        {Math.round(fraction * 100)}%{' '}
        {progress.is_completed ? t('readingPlans.completed') : t('readingPlans.progress')}
      </Text>
    </TouchableOpacity>
  );
}

const activePlanStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    flex: 1,
  },
  dayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  dayBadgeText: {
    ...typography.micro,
  },
  percent: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Browse plan card
// ---------------------------------------------------------------------------

interface BrowsePlanCardProps {
  plan: ReadingPlan;
  isEnrolled: boolean;
  enrolling: boolean;
  onEnroll: () => void;
  onPress: () => void;
}

function BrowsePlanCard({ plan, isEnrolled, enrolling, onEnroll, onPress }: BrowsePlanCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
  const description = plan.description_key
    ? t(plan.description_key as Parameters<typeof t>[0], { defaultValue: plan.description_key })
    : null;

  const categoryLabel = plan.category
    ? plan.category.replace('-', ' ')
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        browsePlanStyles.card,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={browsePlanStyles.header}>
        <Text style={[browsePlanStyles.title, { color: colors.primaryText }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={[browsePlanStyles.durationBadge, { backgroundColor: colors.accentPrimary }]}>
          <Text style={[browsePlanStyles.durationText, { color: colors.cardBackground }]}>
            {plan.duration_days}{' '}
            {t('engagement.days', { defaultValue: 'days' })}
          </Text>
        </View>
      </View>

      {description ? (
        <Text
          style={[browsePlanStyles.description, { color: colors.secondaryText }]}
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}

      <View style={browsePlanStyles.footer}>
        {categoryLabel ? (
          <CategoryChip label={categoryLabel} color={colors.accentTertiary} />
        ) : (
          <View />
        )}

        {isEnrolled ? (
          <View style={[browsePlanStyles.enrolledBadge, { borderColor: colors.success }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={[browsePlanStyles.enrolledText, { color: colors.success }]}>
              {t('readingPlans.enrolled')}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onEnroll}
            disabled={enrolling}
            style={[browsePlanStyles.ctaButton, { backgroundColor: colors.accentPrimary }]}
            accessibilityRole="button"
            accessibilityLabel={t('readingPlans.startPlan')}
          >
            {enrolling ? (
              <ActivityIndicator size="small" color={colors.cardBackground} />
            ) : (
              <Text style={[browsePlanStyles.ctaText, { color: colors.cardBackground }]}>
                {t('readingPlans.startPlan')}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const browsePlanStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: layout.denseCardPadding,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    ...typography.cardTitle,
    flex: 1,
  },
  durationBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  durationText: {
    ...typography.micro,
  },
  description: {
    ...typography.body,
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ctaButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 90,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...typography.label,
  },
  enrolledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  enrolledText: {
    ...typography.micro,
  },
});

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label, color }: { label: string; color: string }) {
  return <Text style={[sectionHeaderStyles.label, { color }]}>{label}</Text>;
}

const sectionHeaderStyles = StyleSheet.create({
  label: {
    ...typography.eyebrow,
    marginBottom: spacing.xs,
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyMyPlans({ label, color }: { label: string; color: string }) {
  return (
    <View style={emptyStyles.container}>
      <Text style={[emptyStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    paddingVertical: spacing.lg,
    paddingHorizontal: layout.screenPadding,
    alignItems: 'center',
  },
  text: {
    ...typography.body,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// List item discriminated union
// ---------------------------------------------------------------------------

type ListItem =
  | { kind: 'header-my-plans' }
  | { kind: 'active-plan'; plan: ReadingPlan; progress: UserReadingPlanProgress }
  | { kind: 'my-plans-empty' }
  | { kind: 'header-browse' }
  | { kind: 'browse-plan'; plan: ReadingPlan };

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ReadingPlanListScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();

  const [plans, setPlans] = useState<ReadingPlan[]>([]);
  const [progressList, setProgressList] = useState<UserReadingPlanProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progressByPlanId = React.useMemo(() => {
    const map = new Map<string, UserReadingPlanProgress>();
    progressList.forEach((p) => map.set(p.plan_id, p));
    return map;
  }, [progressList]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);

    const [plansResult, progressResult] = await Promise.all([
      listReadingPlans(),
      getUserPlanProgress(),
    ]);

    if (plansResult.success) {
      setPlans(plansResult.data ?? []);
    } else {
      setError(plansResult.error ?? t('common.error'));
    }

    if (progressResult.success) {
      setProgressList(progressResult.data ?? []);
    }
    // Progress fetch failing (e.g. not signed in) is non-fatal — we just show no active plans.

    if (!quiet) setLoading(false);
  }, [t]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const handleEnroll = useCallback(
    async (plan: ReadingPlan) => {
      setEnrollingId(plan.id);
      const result = await enrollInPlan(plan.id);
      if (result.success && result.data) {
        setProgressList((prev) => {
          const without = prev.filter((p) => p.plan_id !== plan.id);
          return [...without, result.data!];
        });
        navigation.navigate('ReadingPlanDetail', { planId: plan.id });
      }
      setEnrollingId(null);
    },
    [navigation]
  );

  const handleOpenPlan = useCallback(
    (planId: string) => {
      navigation.navigate('ReadingPlanDetail', { planId });
    },
    [navigation]
  );

  // Build flat list items
  const items = React.useMemo<ListItem[]>(() => {
    const activePlans = plans.filter((p) => progressByPlanId.has(p.id));
    const browsePlans = plans;

    const result: ListItem[] = [];

    result.push({ kind: 'header-my-plans' });
    if (activePlans.length === 0) {
      result.push({ kind: 'my-plans-empty' });
    } else {
      activePlans.forEach((plan) => {
        result.push({ kind: 'active-plan', plan, progress: progressByPlanId.get(plan.id)! });
      });
    }

    result.push({ kind: 'header-browse' });
    browsePlans.forEach((plan) => {
      result.push({ kind: 'browse-plan', plan });
    });

    return result;
  }, [plans, progressByPlanId]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.kind) {
        case 'header-my-plans':
          return (
            <SectionHeader label={t('readingPlans.myPlans')} color={colors.secondaryText} />
          );
        case 'active-plan':
          return (
            <ActivePlanCard
              plan={item.plan}
              progress={item.progress}
              onPress={() => handleOpenPlan(item.plan.id)}
            />
          );
        case 'my-plans-empty':
          return (
            <EmptyMyPlans
              label={t('readingPlans.noActivePlans')}
              color={colors.secondaryText}
            />
          );
        case 'header-browse':
          return (
            <SectionHeader label={t('readingPlans.browsePlans')} color={colors.secondaryText} />
          );
        case 'browse-plan':
          return (
            <BrowsePlanCard
              plan={item.plan}
              isEnrolled={progressByPlanId.has(item.plan.id)}
              enrolling={enrollingId === item.plan.id}
              onEnroll={() => handleEnroll(item.plan)}
              onPress={() => handleOpenPlan(item.plan.id)}
            />
          );
      }
    },
    [t, colors, progressByPlanId, enrollingId, handleEnroll, handleOpenPlan]
  );

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    switch (item.kind) {
      case 'active-plan':
        return `active-${item.plan.id}`;
      case 'browse-plan':
        return `browse-${item.plan.id}`;
      default:
        return `${item.kind}-${index}`;
    }
  }, []);

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
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
          {t('readingPlans.title')}
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
          ListEmptyComponent={
            <EmptyMyPlans label={t('readingPlans.noPlans')} color={colors.secondaryText} />
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
    paddingBottom: layout.tabBarHeight + spacing.xl,
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
