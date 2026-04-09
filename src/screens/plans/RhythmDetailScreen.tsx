import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { getTranslatedBookName } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import type { RhythmDetailScreenProps } from '../../navigation/types';
import { inferRhythmSlotFromTitle, RHYTHM_SLOT_META } from '../../services/plans/rhythmSlots';
import { useLibraryStore, useProgressStore, useReadingPlansStore } from '../../stores';
import { buildRhythmReaderSession, getCurrentPlanDaySummary } from '../../services/plans/readingPlanActivity';
import { getPlanEntries, listReadingPlans } from '../../services/plans/readingPlanService';
import type {
  ReadingPlan,
  ReadingPlanEntry,
  ReadingPlanRhythmSessionSegment,
  UserReadingPlanProgress,
} from '../../services/plans/types';

interface RhythmSegmentViewModel {
  segment: ReadingPlanRhythmSessionSegment;
  plan: ReadingPlan | null;
  entries: ReadingPlanEntry[];
  progress: UserReadingPlanProgress | null;
  currentDaySummary: ReturnType<typeof getCurrentPlanDaySummary> | null;
  title: string;
}

function StatusPill({
  label,
  colors,
  variant = 'neutral',
}: {
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  variant?: 'neutral' | 'accent' | 'success';
}) {
  const backgroundColor =
    variant === 'accent' ? colors.accentPrimary : variant === 'success' ? colors.success : colors.background;
  const textColor =
    variant === 'accent' || variant === 'success' ? colors.cardBackground : colors.secondaryText;

  return (
    <View style={[styles.pill, { backgroundColor, borderColor: colors.cardBorder }]}>
      <Text style={[styles.pillLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SegmentCard({
  item,
  colors,
  t,
}: {
  item: RhythmSegmentViewModel;
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const completedCount = item.currentDaySummary?.completedChapterCount ?? 0;
  const targetCount = item.currentDaySummary?.targetChapterCount ?? item.segment.chapterKeys.length;
  const progressLabel =
    item.segment.type === 'plan'
      ? item.progress?.is_completed
        ? t('readingPlans.completed')
        : t('readingPlans.todayTargetProgress', {
            completed: completedCount,
            target: targetCount,
            defaultValue: `${completedCount}/${targetCount} chapters`,
          })
      : t('readingPlans.chapterCount', {
          count: targetCount,
          defaultValue: `${targetCount} chapters`,
        });

  return (
    <View style={[styles.segmentCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      <View style={styles.segmentHeader}>
        <View style={[styles.segmentBadge, { backgroundColor: colors.background }]}>
          <Ionicons name="book-outline" size={18} color={colors.accentPrimary} />
        </View>
        <View style={styles.segmentHeaderCopy}>
          <Text style={[styles.segmentTitle, { color: colors.primaryText }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.segmentMeta, { color: colors.secondaryText }]}>
            {item.segment.type === 'plan'
              ? t('readingPlans.dayOf', {
                  current: item.segment.dayNumber,
                  total: item.plan?.duration_days ?? item.segment.dayNumber,
                })
              : t('readingPlans.repeatablePassage', { defaultValue: 'Repeatable passage' })}
          </Text>
        </View>
        <StatusPill
          label={
            item.segment.type === 'plan' && item.progress?.is_completed
              ? t('readingPlans.completed')
              : t('common.next', { defaultValue: 'Next' })
          }
          colors={colors}
          variant={item.segment.type === 'plan' && item.progress?.is_completed ? 'success' : 'accent'}
        />
      </View>

      <View style={styles.segmentMetaRow}>
        <StatusPill
          label={t('readingPlans.chapterCount', {
            count: item.segment.chapterKeys.length,
            defaultValue: `${item.segment.chapterKeys.length} chapters`,
          })}
          colors={colors}
        />
        <StatusPill label={progressLabel} colors={colors} />
      </View>

      {item.currentDaySummary ? (
        <Text style={[styles.segmentBody, { color: colors.secondaryText }]}>
          {t('readingPlans.todayTargetProgress', {
            completed: item.currentDaySummary.completedChapterCount,
            target: item.currentDaySummary.targetChapterCount,
            defaultValue: `Today's target: ${item.currentDaySummary.completedChapterCount}/${item.currentDaySummary.targetChapterCount} chapters`,
          })}
        </Text>
      ) : item.segment.type === 'passage' ? (
        <Text style={[styles.segmentBody, { color: colors.secondaryText }]}>
          {t('readingPlans.passageRangeSummary', {
            start: item.segment.startChapter ?? 1,
            end: item.segment.endChapter ?? item.segment.startChapter ?? 1,
            defaultValue:
              item.segment.startChapter === item.segment.endChapter
                ? `Chapter ${item.segment.startChapter ?? 1}`
                : `Chapters ${item.segment.startChapter ?? 1}-${item.segment.endChapter ?? item.segment.startChapter ?? 1}`,
          })}
        </Text>
      ) : null}
    </View>
  );
}

export function RhythmDetailScreen({ navigation, route }: RhythmDetailScreenProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rhythmId = route.params.rhythmId;

  const [allPlans, setAllPlans] = useState<ReadingPlan[]>([]);
  const [planEntriesById, setPlanEntriesById] = useState<Record<string, ReadingPlanEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const progressByPlanId = useReadingPlansStore((state) => state.progressByPlanId);
  const getRhythm = useReadingPlansStore((state) => state.getRhythm);
  const getPlanDayResume = useReadingPlansStore((state) => state.getPlanDayResume);
  const rhythm = getRhythm(rhythmId);
  const relevantPlanIds = useMemo(
    () =>
      rhythm?.items
        .filter((item): item is Extract<(typeof rhythm.items)[number], { type: 'plan' }> => item.type === 'plan')
        .map((item) => item.planId) ?? [],
    [rhythm]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const plansResult = await listReadingPlans();
      if (!mounted) {
        return;
      }

      if (!plansResult.success || !plansResult.data) {
        setError(plansResult.error ?? t('common.error', { defaultValue: 'Error' }));
        setLoading(false);
        return;
      }

      setAllPlans(plansResult.data);

      const planMap: Record<string, ReadingPlanEntry[]> = {};
      const entryResults = await Promise.all(
        relevantPlanIds.map(async (planId) => [planId, await getPlanEntries(planId)] as const)
      );

      if (!mounted) {
        return;
      }

      for (const [planId, result] of entryResults) {
        planMap[planId] = result.success && result.data ? result.data : [];
      }

      setPlanEntriesById(planMap);
      setLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [relevantPlanIds, t]);

  const planTitleById = useMemo(
    () =>
      Object.fromEntries(
        allPlans.map((plan) => [plan.id, t(plan.title_key as Parameters<typeof t>[0])])
      ) as Record<string, string>,
    [allPlans, t]
  );

  const session = useMemo(() => {
    if (!rhythm) {
      return null;
    }

    return buildRhythmReaderSession({
      rhythm,
      planEntriesById,
      progressByPlanId,
      planTitlesById: planTitleById,
      getPlanDayResume,
    });
  }, [getPlanDayResume, planEntriesById, planTitleById, progressByPlanId, rhythm]);

  const segmentViewModels = useMemo<RhythmSegmentViewModel[]>(() => {
    if (!rhythm || !session) {
      return [];
    }

    return session.sessionContext.segments.map((segment) => {
      const entries = segment.planId ? planEntriesById[segment.planId] ?? [] : [];
      const progress = segment.planId ? progressByPlanId[segment.planId] ?? null : null;
      const currentDaySummary = progress
        ? getCurrentPlanDaySummary({
            entries,
            progress,
            chaptersRead,
            listeningHistory,
            dayNumber: segment.dayNumber,
          })
        : null;

      return {
        segment,
        plan: segment.planId ? allPlans.find((plan) => plan.id === segment.planId) ?? null : null,
        entries,
        progress,
        currentDaySummary,
        title:
          segment.type === 'plan'
            ? planTitleById[segment.planId ?? ''] ?? segment.title
            : segment.title ||
              (segment.bookId
                ? segment.startChapter === segment.endChapter
                  ? `${getTranslatedBookName(segment.bookId, t)} ${segment.startChapter}`
                  : `${getTranslatedBookName(segment.bookId, t)} ${segment.startChapter}-${segment.endChapter}`
                : ''),
      };
    });
  }, [allPlans, chaptersRead, listeningHistory, planEntriesById, planTitleById, progressByPlanId, rhythm, session, t]);

  const rhythmPlanIds = relevantPlanIds;
  const completedPlanCount = rhythmPlanIds.filter((planId) => progressByPlanId[planId]?.is_completed).length;
  const totalPlanCount = rhythmPlanIds.length;
  const totalItemCount = rhythm?.items.length ?? 0;
  const hasActiveSegments = Boolean(session && session.playbackSequenceEntries.length > 0 && session.startEntry && session.startSegment);
  const slotPresentation = useMemo(() => {
    const slot = rhythm?.slot ?? inferRhythmSlotFromTitle(rhythm?.title);
    return slot ? RHYTHM_SLOT_META[slot] : null;
  }, [rhythm?.slot, rhythm?.title]);

  const handleEdit = useCallback(() => {
    navigation.navigate('RhythmComposer', { rhythmId });
  }, [navigation, rhythmId]);

  const handleContinue = useCallback(() => {
    if (!session || !session.startEntry || !session.startSegment || !rootNavigationRef.isReady()) {
      return;
    }

    rootNavigationRef.navigate('Bible', {
      screen: 'BibleReader',
      params: {
        bookId: session.startEntry.bookId,
        chapter: session.startEntry.chapter,
        preferredMode: 'read',
        playbackSequenceEntries: session.playbackSequenceEntries,
        planId: session.startSegment.type === 'plan' ? session.startSegment.planId : undefined,
        planDayNumber:
          session.startSegment.type === 'plan' ? session.startSegment.dayNumber : undefined,
        returnToPlanOnComplete: true,
        sessionContext: session.sessionContext,
      },
    });
  }, [session]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !rhythm) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.primaryText }]}>
            {t('readingPlans.rhythms')}
          </Text>
          <Text style={[styles.errorBody, { color: colors.secondaryText }]}>
            {error ?? t('common.error', { defaultValue: 'Error' })}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            style={[styles.errorButton, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={[styles.errorButtonLabel, { color: colors.cardBackground }]}>
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.backButton, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.primaryText }]} numberOfLines={2}>
              {rhythm.title}
            </Text>
            {slotPresentation ? (
              <View style={[styles.slotBadge, { borderColor: colors.cardBorder, backgroundColor: colors.cardBackground }]}>
                <Ionicons name={slotPresentation.iconName} size={14} color={colors.accentPrimary} />
                <Text style={[styles.slotBadgeLabel, { color: colors.primaryText }]}>
                  {t(slotPresentation.labelKey)}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {t('readingPlans.rhythmItemCount', {
                count: totalItemCount,
                defaultValue: `${totalItemCount} items`,
              })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleEdit}
            accessibilityRole="button"
            style={[styles.editButton, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}
          >
            <Ionicons name="create-outline" size={18} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, { color: colors.primaryText }]}>{totalItemCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>
                {t('readingPlans.includedItems', { defaultValue: 'Included items' })}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, { color: colors.primaryText }]}>{completedPlanCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>
                {t('readingPlans.completed')}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryValue, { color: colors.primaryText }]}>
                {Math.max(totalPlanCount - completedPlanCount, 0)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>
                {t('common.next', { defaultValue: 'Next' })}
              </Text>
            </View>
          </View>

          <Text style={[styles.summaryBody, { color: colors.secondaryText }]}>
            {hasActiveSegments
              ? t('readingPlans.continueRhythm')
              : t('readingPlans.noRhythmsBody')}
          </Text>
          {segmentViewModels[0] ? (
            <Text style={[styles.summaryNext, { color: colors.accentPrimary }]}>
              {t('readingPlans.nextUp', {
                value: segmentViewModels[0].title,
                defaultValue: `Next up: ${segmentViewModels[0].title}`,
              })}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>
            {t('readingPlans.rhythmSequence', { defaultValue: 'Rhythm sequence' })}
          </Text>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!hasActiveSegments}
            accessibilityRole="button"
            style={[
              styles.continueButton,
              {
                backgroundColor: hasActiveSegments ? colors.accentPrimary : colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.continueLabel, { color: colors.cardBackground }]}>
              {t('readingPlans.continueRhythm')}
            </Text>
          </TouchableOpacity>
        </View>

        {segmentViewModels.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
              {t('readingPlans.completed')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
              {t('readingPlans.noRhythmsBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.segmentList}>
            {segmentViewModels.map((item) => (
              <SegmentCard key={item.segment.itemId} item={item} colors={colors} t={t} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
  errorTitle: {
    ...typography.screenTitle,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.body,
    textAlign: 'center',
  },
  errorButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: layout.cardPadding,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorButtonLabel: {
    ...typography.label,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.screenTitle,
  },
  subtitle: {
    ...typography.body,
  },
  slotBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  slotBadgeLabel: {
    ...typography.micro,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryStat: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.sectionTitle,
  },
  summaryLabel: {
    ...typography.micro,
    textAlign: 'center',
  },
  summaryBody: {
    ...typography.body,
  },
  summaryNext: {
    ...typography.bodyStrong,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.cardTitle,
    flex: 1,
  },
  continueButton: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: {
    ...typography.label,
  },
  emptyState: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.bodyStrong,
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
  },
  segmentList: {
    gap: spacing.md,
  },
  segmentCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  segmentBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  segmentTitle: {
    ...typography.bodyStrong,
  },
  segmentMeta: {
    ...typography.micro,
  },
  segmentMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  segmentBody: {
    ...typography.body,
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillLabel: {
    ...typography.micro,
  },
});
