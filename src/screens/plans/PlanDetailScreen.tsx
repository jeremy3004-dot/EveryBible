/* eslint-disable react/prop-types -- screen is fully typed via PlanDetailScreenProps; rule false-positives on navigation/route after the FlashList refactor (matches BibleReaderScreen P1 pattern) */
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { spacing, typography, layout } from '../../design/system';
import { AppButton } from '../../components/ui';
import { useAudioStore } from '../../stores/audioStore';
import { useBibleStore } from '../../stores/bibleStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { useReadingPlansStore } from '../../stores/readingPlansStore';
import { enrollInPlan, unenrollFromPlan } from '../../services/plans/readingPlanService';
import {
  getCurrentPlanDaySummary,
  buildPlanDayPlaybackSequenceEntries,
  shouldAutoplayPlanDayLaunch,
  resolvePlanDayPlaybackStartEntry,
} from '../../services/plans/readingPlanActivity';
import { getReadingPlanCoverSource } from '../../services/plans/readingPlanAssets';
import {
  getActivePlanDayNumber,
  getPlanLedgerDayNumbers,
  isRecurringPlan,
  isMultiSessionPlan,
} from '../../services/plans/readingPlanModel';
import type { PlanSessionKey } from '../../services/plans/types';
import type { PlanDetailScreenProps } from '../../navigation/types';
import { getTranslatedBookName } from '../../constants';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import {
  getPlanDetailCompactHeaderHeight,
  isPlanDetailCompactHeaderVisible,
} from './planDetailHeaderModel';
import {
  COVER_CONTENT_OVERLAP,
  COVER_HEIGHT,
  DayRow,
  HERO_TEXT_BOTTOM,
  PlanDetailCompactHeader,
  PlanDetailHero,
  PlanDetailStatusView,
  ProgressCard,
  RelatedPlansSection,
  buildPlanDayViewModels,
  getDominantPlanBook,
  getNextLedgerDayNumber,
  getPlanCadenceLabelKey,
  groupEntriesByDay,
  orderLedgerRows,
  useFocusedToday,
  usePlanDetailData,
  type PlanDayViewModel,
} from './planDetail';
import { lightHaptic, successHaptic } from '../../utils';

export { CURRENT_PLAN_DAY_ROW_TEST_ID } from './planDetail';

export function PlanDetailScreen({ route, navigation }: PlanDetailScreenProps) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
  const progress = useReadingPlansStore((state) => state.progressByPlanId[planId] ?? null);
  const getPlanDayResume = useReadingPlansStore((state) => state.getPlanDayResume);

  const today = useFocusedToday();
  const { plan, entries, relatedPlans, loading, error, load } = usePlanDetailData(planId);
  const [enrolling, setEnrolling] = useState(false);

  const entriesByDay = useMemo(() => groupEntriesByDay(entries), [entries]);
  const ledgerDayNumbers = useMemo(
    () => getPlanLedgerDayNumbers(plan, entries, today),
    [plan, entries, today]
  );

  const currentDay = plan
    ? getActivePlanDayNumber(plan, progress, today)
    : (progress?.current_day ?? 1);
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  // Only whether the current translation has audio: a download or catalog change
  // to any other translation no longer re-renders the whole plan page.
  const audioAvailable = useBibleStore(
    (state) =>
      state.translations.find((entry) => entry.id === state.currentTranslation)?.hasAudio ?? false
  );
  const currentDaySummary = useMemo(() => {
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

  // Resolves everything a plan-day launch needs — enrolling first when the user
  // taps a day before starting the plan — so read and listen share one path.
  const resolvePlanDayLaunch = useCallback(
    async (dayNumber: number, sessionKey?: PlanSessionKey) => {
      if (!rootNavigationRef.isReady()) return null;

      lightHaptic();

      if (!progress) {
        const enrollResult = await enrollInPlan(planId);
        if (!enrollResult.success || !enrollResult.data) {
          return null;
        }
      }

      const plannedDayEntries = entriesByDay.get(dayNumber) ?? [];
      const dayEntries =
        sessionKey && multiSessionPlan
          ? plannedDayEntries.filter((entry) => entry.session_key === sessionKey)
          : plannedDayEntries;
      const fallbackEntry = dayEntries[0] ?? plannedDayEntries[0];
      if (!fallbackEntry) {
        return null;
      }

      const playbackSequenceEntries = buildPlanDayPlaybackSequenceEntries(dayEntries);
      const resumeTarget = getPlanDayResume(planId, dayNumber);
      const playbackStartEntry = resolvePlanDayPlaybackStartEntry(dayEntries, resumeTarget) ?? {
        bookId: fallbackEntry.book,
        chapter: fallbackEntry.chapter_start,
      };

      return { playbackSequenceEntries, playbackStartEntry };
    },
    [entriesByDay, getPlanDayResume, multiSessionPlan, planId, progress]
  );

  const handleOpenChapter = useCallback(
    async (dayNumber: number, sessionKey?: PlanSessionKey) => {
      const launch = await resolvePlanDayLaunch(dayNumber, sessionKey);
      if (!launch) return;

      const { playbackSequenceEntries, playbackStartEntry } = launch;
      const autoplayAudio = shouldAutoplayPlanDayLaunch({
        trigger: 'open',
        preferredMode: preferredChapterLaunchMode,
        audioStatus: useAudioStore.getState().status,
      });

      rootNavigationRef.navigate('Bible', {
        screen: 'BibleReader',
        params: {
          bookId: playbackStartEntry.bookId,
          chapter: playbackStartEntry.chapter,
          ...(autoplayAudio ? { autoplayAudio: true } : {}),
          preferredMode: preferredChapterLaunchMode,
          playbackSequenceEntries,
          planId,
          planDayNumber: dayNumber,
          ...(sessionKey ? { planSessionKey: sessionKey } : {}),
          returnToPlanOnComplete: true,
        },
      });
    },
    [planId, preferredChapterLaunchMode, resolvePlanDayLaunch]
  );

  // The play button is an explicit "listen to this day", so it overrides the
  // persisted launch preference rather than reading it.
  const handleListenToDay = useCallback(
    async (dayNumber: number, sessionKey?: PlanSessionKey) => {
      const launch = await resolvePlanDayLaunch(dayNumber, sessionKey);
      if (!launch) return;

      rootNavigationRef.navigate('Bible', {
        screen: 'BibleReader',
        params: {
          bookId: launch.playbackStartEntry.bookId,
          chapter: launch.playbackStartEntry.chapter,
          autoplayAudio: true,
          preferredMode: 'listen',
          playbackSequenceEntries: launch.playbackSequenceEntries,
          planId,
          planDayNumber: dayNumber,
          ...(sessionKey ? { planSessionKey: sessionKey } : {}),
          returnToPlanOnComplete: true,
        },
      });
    },
    [planId, resolvePlanDayLaunch]
  );

  const handleStartPlan = useCallback(async () => {
    if (!progress) {
      setEnrolling(true);
      await enrollInPlan(planId);
      setEnrolling(false);
      successHaptic();
    }
  }, [planId, progress]);

  const handleLeavePlan = useCallback(() => {
    lightHaptic();
    Alert.alert(t('readingPlans.leavePlan'), t('readingPlans.leavePlanConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('readingPlans.leavePlan'),
        style: 'destructive',
        onPress: async () => {
          const result = await unenrollFromPlan(planId);
          if (!result.success) {
            Alert.alert(t('common.error'), t('common.unexpectedError'));
            return;
          }
          successHaptic();
          navigation.goBack();
        },
      },
    ]);
  }, [navigation, planId, t]);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

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

  // "DAILY RHYTHM · 31 DAYS · PROVERBS" — cadence, length, and the book the plan
  // is actually about, when one dominates it.
  const heroEyebrow = useMemo(() => {
    if (!plan) return null;
    const cadenceKey = getPlanCadenceLabelKey(plan);
    const dominantBook = getDominantPlanBook(entries);

    return [
      cadenceKey ? t(cadenceKey as Parameters<typeof t>[0]) : null,
      t('readingPlans.durationDays', { count: plan.duration_days }),
      dominantBook ? getTranslatedBookName(dominantBook, t) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [entries, plan, t]);

  const nextDayNumber = useMemo(
    () => getNextLedgerDayNumber(ledgerDayNumbers, currentDay, isRecurringPlan(plan)),
    [currentDay, ledgerDayNumbers, plan]
  );

  const dayViewModels = useMemo(
    () =>
      buildPlanDayViewModels({
        plan,
        progress,
        entries,
        entriesByDay,
        ledgerDayNumbers,
        currentDay,
        currentDaySummary,
        nextDayNumber,
        isMultiSession: multiSessionPlan,
        today,
        locale: i18n.language,
      }),
    [
      currentDay,
      currentDaySummary,
      entries,
      entriesByDay,
      i18n.language,
      ledgerDayNumbers,
      multiSessionPlan,
      nextDayNumber,
      plan,
      progress,
      today,
    ]
  );

  const todayViewModel = useMemo(
    () => (isEnrolled ? (dayViewModels.find((item) => item.isCurrent) ?? null) : null),
    [dayViewModels, isEnrolled]
  );

  const ledgerRows = useMemo(
    () => orderLedgerRows(dayViewModels, currentDay, todayViewModel !== null),
    [currentDay, dayViewModels, todayViewModel]
  );

  const todaySubtitle = useMemo(() => {
    if (!todayViewModel) return null;
    if (currentDaySummary && currentDaySummary.targetChapterCount > 1) {
      return t('readingPlans.todayTargetProgress', {
        completed: currentDaySummary.completedChapterCount,
        target: currentDaySummary.targetChapterCount,
      });
    }
    if (todayViewModel.entries.length === 0) return null;
    return t('readingPlans.dayChapterCount', { count: todayViewModel.entries.length });
  }, [currentDaySummary, t, todayViewModel]);

  const renderDayRow = useCallback(
    ({ item, index }: { item: PlanDayViewModel; index: number }) => (
      <DayRow
        dayNumber={item.dayNumber}
        dateLabel={item.dateLabel}
        entries={item.entries}
        launchSessionKey={item.launchSessionKey}
        isCompleted={item.isCompleted}
        isCurrent={item.isCurrent}
        isFuture={item.isFuture}
        isNext={item.isNext}
        isFirst={index === 0}
        isLast={index === ledgerRows.length - 1}
        sessionActions={item.sessionActions}
        onPress={handleOpenChapter}
      />
    ),
    [handleOpenChapter, ledgerRows.length]
  );

  const keyExtractorDay = useCallback((item: PlanDayViewModel) => String(item.dayNumber), []);

  const compactHeaderHeight = getPlanDetailCompactHeaderHeight(insets.top);
  const [isCompactHeaderVisible, setIsCompactHeaderVisible] = useState(false);
  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextVisible = isPlanDetailCompactHeaderVisible({
        scrollOffsetY: event.nativeEvent.contentOffset.y,
        coverHeight: COVER_HEIGHT,
        heroTextBottom: HERO_TEXT_BOTTOM,
        headerHeight: compactHeaderHeight,
      });
      setIsCompactHeaderVisible((current) => (current === nextVisible ? current : nextVisible));
    },
    [compactHeaderHeight]
  );
  const listContentStyle = useMemo(
    () => ({ paddingBottom: tabBar.contentClearance }),
    [tabBar.contentClearance]
  );

  const listHeader = (
    <View>
      <PlanDetailHero
        coverSource={heroCoverSource}
        eyebrow={heroEyebrow}
        title={planTitle}
        showOptions={isEnrolled}
        onBack={handleBack}
        onOptions={handleLeavePlan}
      />

      <View style={styles.headerBody}>
        {/* Progress card (only if enrolled) */}
        {plan && isEnrolled ? (
          <ProgressCard
            plan={plan}
            progress={progress}
            currentDaySummary={currentDaySummary}
            today={today}
          />
        ) : null}

        {/* Today */}
        {todayViewModel ? (
          <View style={styles.todayWrap}>
            <DayRow
              dayNumber={todayViewModel.dayNumber}
              dateLabel={todayViewModel.dateLabel}
              entries={todayViewModel.entries}
              launchSessionKey={todayViewModel.launchSessionKey}
              isCompleted={todayViewModel.isCompleted}
              isCurrent={todayViewModel.isCurrent}
              isFuture={todayViewModel.isFuture}
              isNext={todayViewModel.isNext}
              subtitle={todaySubtitle}
              audioAvailable={audioAvailable}
              sessionActions={todayViewModel.sessionActions}
              onPress={handleOpenChapter}
              onListen={handleListenToDay}
            />
          </View>
        ) : null}

        {/* Not enrolled: description + the one CTA */}
        {!isEnrolled ? (
          <View style={styles.introBlock}>
            {plan?.description_key ? (
              <Text style={[styles.description, { color: colors.secondaryText }]}>
                {t(plan.description_key as Parameters<typeof t>[0], {
                  defaultValue: plan.description_key,
                })}
              </Text>
            ) : null}
            <AppButton
              label={t('readingPlans.startPlan')}
              onPress={handleStartPlan}
              loading={enrolling}
              disabled={enrolling}
            />
          </View>
        ) : null}

        {ledgerRows.length > 0 ? (
          <Text
            style={[styles.ledgerEyebrow, displayFont.regular, { color: colors.secondaryText }]}
          >
            {t('readingPlans.ledger')}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (loading) {
    return <PlanDetailStatusView status="loading" onBack={handleBack} />;
  }

  if (error) {
    return (
      <PlanDetailStatusView status="error" message={error} onRetry={load} onBack={handleBack} />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={ledgerRows}
        renderItem={renderDayRow}
        keyExtractor={keyExtractorDay}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          <RelatedPlansSection plans={relatedPlans} onPlanPress={handleRelatedPlanPress} />
        }
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={48}
        extraData={colors}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
      />

      {isCompactHeaderVisible ? (
        <PlanDetailCompactHeader
          height={compactHeaderHeight}
          title={planTitle}
          showOptions={isEnrolled}
          onBack={handleBack}
          onOptions={handleLeavePlan}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Content column
  headerBody: {
    marginTop: -COVER_CONTENT_OVERLAP,
    paddingHorizontal: layout.screenPadding,
  },
  todayWrap: {
    marginTop: spacing.lg,
  },
  // The content column rises COVER_CONTENT_OVERLAP into the hero's fade, which is
  // right for the progress and today cards (they carry their own surface) but not
  // for bare text: in the vellum scope the description's first line landed on the
  // still-dark end of the scrim. Plain copy starts where the fade has finished.
  introBlock: {
    marginTop: COVER_CONTENT_OVERLAP,
    gap: spacing.lg,
  },
  description: {
    ...typography.body,
  },
  ledgerEyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
