import React, { useState, useCallback, useEffect } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Fuse from 'fuse.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check, Search, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { serifFamily } from '../../design/fonts';
import {
  AppCard,
  EmptyState,
  PressableScale,
  ProgressBar,
  SectionHeader,
  TabSwitch,
} from '../../components/ui';
import { Skeleton } from '../../components/skeleton/Skeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont, useTabBarHeight } from '../../hooks';
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

/** The 16:10 cover frame on the two-up rhythm cards. */
const RHYTHM_COVER_ASPECT = 16 / 10;
/** The square cover on every list row. */
const ROW_COVER_SIZE = 52;

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
          <PressableScale
            pressEffect="translate"
            onPress={() => {
              swipeableMethods.close();
              onDelete();
            }}
            style={[swipeableStyles.deleteButton, { backgroundColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Trash2 size={18} color={colors.onAccent} strokeWidth={2} />
            <Text style={[swipeableStyles.deleteText, { color: colors.onAccent }]}>
              {t('common.delete')}
            </Text>
          </PressableScale>
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Cover image fallback (shared by every section)
// ---------------------------------------------------------------------------

// Fills whatever frame wraps it, so the caller owns the geometry (16:10 on the
// rhythm cards, 52pt square on the rows) and the 1px cardBorder frame.
function CoverImage({
  plan,
  colors,
  t,
  initialSize,
}: {
  plan: ReadingPlan;
  colors: ThemeColors;
  t: TFunction;
  initialSize: number;
}) {
  const source = getReadingPlanCoverSource(plan);
  if (source) {
    return <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />;
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
      style={[StyleSheet.absoluteFill, coverStyles.fallback]}
    >
      <Text
        style={{
          fontFamily: serifFamily(600),
          fontSize: initialSize,
          color: colors.onAccent,
        }}
      >
        {initial}
      </Text>
    </LinearGradient>
  );
}

const coverStyles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function formatProgressPercent(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

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
// Soft status chip — "ENROLLED" / "COMPLETED"
// ---------------------------------------------------------------------------

function SoftChip({ label, colors }: { label: string; colors: ThemeColors }) {
  const displayFont = useDisplayFont();
  return (
    <View style={[chipStyles.chip, { backgroundColor: colors.successSoft }]}>
      <Text
        style={[typography.monoSmall, displayFont.regular, { color: colors.onSuccessSoft }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexShrink: 0,
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
  const displayFont = useDisplayFont();

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
        <AppCard
          pressable
          padding={12}
          onPress={() => onPlanPress(plan.id)}
          accessibilityLabel={t(plan.title_key as Parameters<typeof t>[0])}
        >
          <View style={styles.cardTop}>
            <View style={styles.coverFrame}>
              <CoverImage plan={plan} colors={colors} t={t} initialSize={26} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {t(plan.title_key as Parameters<typeof t>[0])}
              </Text>
              <Text
                style={[styles.cardEyebrow, displayFont.regular]}
                numberOfLines={1}
                allowFontScaling
              >
                {t('readingPlans.dayOf', {
                  current: currentDay,
                  total: plan.duration_days,
                })}
              </Text>
              {sessionStatus ? (
                <View style={styles.sessionRow}>
                  <Check size={12} color={colors.success} strokeWidth={2} />
                  <Text
                    style={[styles.cardEyebrow, displayFont.regular, styles.sessionSummary]}
                    numberOfLines={1}
                  >
                    {sessionStatus}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <ProgressBar progress={progressRatio} style={styles.progressBar} />
          <View style={styles.cardFooter}>
            <Text style={[typography.mono, displayFont.regular, { color: colors.secondaryText }]}>
              {formatProgressPercent(progressRatio)}
            </Text>
            <View style={[styles.outlineAction, { borderColor: colors.accentPrimary }]}>
              <Text
                style={[styles.outlineActionText, { color: colors.accentPrimary }]}
                numberOfLines={1}
              >
                {ctaLabel}
              </Text>
            </View>
          </View>
        </AppCard>
      </SwipeablePlanRow>
    );
  };

  return (
    <View style={styles.content}>
      <View style={styles.sectionBlock}>
        <SectionHeader
          title={t('readingPlans.dailyReadings')}
          eyebrow={
            dailyReadingPlans.length > 0
              ? t('readingPlans.plansCount', { count: dailyReadingPlans.length })
              : undefined
          }
          style={styles.sectionHeader}
        />

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
          <SectionHeader
            title={t('readingPlans.dailyRhythms')}
            eyebrow={t('readingPlans.plansCount', { count: dailyRhythmPlans.length })}
            style={styles.sectionHeader}
          />
          {dailyRhythmPlans.map(renderPlanCard)}
        </View>
      ) : null}
    </View>
  );
}

const createMyPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      gap: spacing.xl,
    },
    sectionBlock: {
      gap: spacing.md,
    },
    sectionHeader: {
      marginTop: 6,
      marginBottom: 0,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    coverFrame: {
      width: 64,
      height: 64,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      flexShrink: 0,
    },
    cardBody: {
      flex: 1,
      gap: spacing.xs,
    },
    cardTitle: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    cardEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sessionSummary: {
      flex: 1,
    },
    progressBar: {
      marginTop: spacing.md,
    },
    cardFooter: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    outlineAction: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 6,
      paddingHorizontal: 12,
      flexShrink: 0,
    },
    outlineActionText: {
      ...typography.captionStrong,
      fontSize: 12.5,
      lineHeight: 16,
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
  const displayFont = useDisplayFont();
  const enrolledPlanIds = new Set(userProgress.map((p) => p.plan_id));
  const [searchQuery, setSearchQuery] = useState('');

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

  // Section layout rule (drives the two shapes in the reference render):
  //   • Recurring plans — the calendar-driven ones that repeat forever instead of
  //     running to an end date — are the featured "Daily rhythms" group and get
  //     the two-up cover grid, because their covers are the browse hook.
  //   • Every other catalog category ("Chronological", "Book study", …) renders
  //     as a compact row list inside one paper card, so a long catalog stays
  //     scannable instead of turning into a wall of artwork.
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

  // Two-up cover card — the "Daily rhythms" shape.
  const renderRhythmCard = (plan: ReadingPlan) => {
    const isEnrolled = enrolledPlanIds.has(plan.id);
    const cadence = formatPlanCadenceLabel(plan, t);
    const progress = userProgress.find((entry) => entry.plan_id === plan.id);
    const dayLabel =
      isEnrolled && progress
        ? t('readingPlans.dayOf', {
            current: getActivePlanDayNumber(plan, progress),
            total: plan.duration_days,
          })
        : null;
    // Enrolled rhythms lead with where you are; everything else leads with the
    // cadence the plan actually runs on ("MORNING + EVENING").
    const metaLabel =
      cadence ?? dayLabel ?? t('readingPlans.daysCount', { count: plan.duration_days });

    return (
      <AppCard
        key={plan.id}
        pressable
        padding={spacing.sm}
        onPress={() => onPlanPress(plan.id)}
        accessibilityLabel={t(plan.title_key as Parameters<typeof t>[0], {
          defaultValue: plan.title_key,
        })}
        style={styles.rhythmCard}
      >
        <View style={styles.rhythmCoverFrame}>
          <CoverImage plan={plan} colors={colors} t={t} initialSize={34} />
        </View>
        <View style={styles.rhythmBody}>
          <Text style={styles.rhythmTitle} numberOfLines={2}>
            {t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })}
          </Text>
          <View style={styles.rhythmMetaRow}>
            {isEnrolled ? <Check size={12} color={colors.success} strokeWidth={2} /> : null}
            <Text style={[styles.metaEyebrow, displayFont.regular, styles.rhythmMetaText]}>
              {metaLabel}
            </Text>
          </View>
        </View>
      </AppCard>
    );
  };

  // Compact list row — every other category.
  const renderPlanRow = (plan: ReadingPlan, isFirst: boolean) => {
    const isEnrolled = enrolledPlanIds.has(plan.id);
    const progress = userProgress.find((entry) => entry.plan_id === plan.id);
    const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });
    const metaParts = [t('readingPlans.daysCount', { count: plan.duration_days })];
    const cadence = formatPlanCadenceLabel(plan, t);
    if (isEnrolled && progress) {
      metaParts.push(t('readingPlans.dayLabel', { day: getActivePlanDayNumber(plan, progress) }));
    } else if (cadence) {
      metaParts.push(cadence);
    }

    return (
      <PressableScale
        key={plan.id}
        pressEffect="translate"
        onPress={() => onPlanPress(plan.id)}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[styles.planRow, isFirst ? null : styles.planRowDivider]}
      >
        <View style={styles.rowCoverFrame}>
          <CoverImage plan={plan} colors={colors} t={t} initialSize={22} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.metaEyebrow, displayFont.regular]} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        </View>
        {isEnrolled ? (
          <SoftChip label={t('readingPlans.enrolled')} colors={colors} />
        ) : (
          <PressableScale
            pressEffect="translate"
            hitSlop={12}
            onPress={() => onPlanPress(plan.id)}
            accessibilityRole="button"
            accessibilityLabel={`${t('readingPlans.start')} — ${title}`}
            style={[styles.startButton, { borderColor: colors.accentPrimary }]}
          >
            <Text style={[styles.startButtonText, { color: colors.accentPrimary }]}>
              {t('readingPlans.start')}
            </Text>
          </PressableScale>
        )}
      </PressableScale>
    );
  };

  return (
    <View style={styles.content}>
      <View style={styles.searchStrip}>
        <Search size={17} color={colors.secondaryText} strokeWidth={2} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('readingPlans.searchPlansCount', { count: allPlans.length })}
          placeholderTextColor={colors.secondaryText}
          style={[styles.searchInput, { color: colors.primaryText }]}
          accessibilityLabel={t('readingPlans.searchPlansCount', { count: allPlans.length })}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {dailyRhythmPlans.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title={t('readingPlans.dailyRhythms')}
            eyebrow={t('readingPlans.plansCount', { count: dailyRhythmPlans.length })}
            style={styles.sectionHeader}
          />
          <View style={styles.rhythmGrid}>{dailyRhythmPlans.map(renderRhythmCard)}</View>
        </View>
      ) : null}

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
          <View key={category} style={styles.section}>
            <SectionHeader
              title={label}
              eyebrow={t('readingPlans.plansCount', { count: plans.length })}
              style={styles.sectionHeader}
            />
            <AppCard padding={0}>
              {plans.map((plan, index) => renderPlanRow(plan, index === 0))}
            </AppCard>
          </View>
        );
      })}

      {filteredPlans.length === 0 && (
        <EmptyState
          icon="search-outline"
          title={
            searchQuery.trim() ? t('readingPlans.noPlanSearchResults') : t('readingPlans.noPlans')
          }
        />
      )}
    </View>
  );
}

const createFindPlansStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      gap: spacing.xl,
    },
    searchStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 44,
      borderWidth: 1,
      borderRadius: radius.lg,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      ...typography.body,
      fontSize: 14.5,
      flex: 1,
      paddingVertical: 0,
    },
    section: {
      gap: spacing.md,
    },
    sectionHeader: {
      marginTop: 6,
      marginBottom: 0,
    },
    rhythmGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
    },
    rhythmCard: {
      // Two to a row. flexGrow stays 0 so an odd third card keeps its column
      // width instead of stretching across the full gutter.
      flexGrow: 0,
      flexBasis: '48%',
      paddingBottom: spacing.md,
    },
    rhythmCoverFrame: {
      width: '100%',
      aspectRatio: RHYTHM_COVER_ASPECT,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
    },
    rhythmBody: {
      paddingHorizontal: 6,
      paddingTop: spacing.sm,
      gap: spacing.xs,
    },
    rhythmTitle: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    rhythmMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rhythmMetaText: {
      flex: 1,
    },
    metaEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    planRowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    rowCoverFrame: {
      width: ROW_COVER_SIZE,
      height: ROW_COVER_SIZE,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      flexShrink: 0,
    },
    rowBody: {
      flex: 1,
      gap: spacing.xs,
    },
    rowTitle: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    startButton: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 6,
      paddingHorizontal: 12,
      flexShrink: 0,
    },
    startButtonText: {
      ...typography.captionStrong,
      fontSize: 12.5,
      lineHeight: 16,
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
  const { t, i18n } = useTranslation();
  const displayFont = useDisplayFont();
  const styles = createCompletedStyles(colors);

  if (completedPlans.length === 0) {
    return (
      <EmptyState icon="checkmark-circle-outline" title={t('readingPlans.noCompletedPlans')} />
    );
  }

  return (
    <View style={styles.content}>
      <SectionHeader
        title={t('readingPlans.completed')}
        eyebrow={t('readingPlans.plansCount', { count: completedPlans.length })}
        style={styles.sectionHeader}
      />
      <AppCard padding={0}>
        {completedPlans.map((item, index) => {
          const completedDate = item.completed_at
            ? new Date(item.completed_at).toLocaleDateString(i18n.language, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : null;
          const title = t(item.plan.title_key as Parameters<typeof t>[0]);
          return (
            <SwipeablePlanRow key={item.id} onDelete={() => onDeletePlan(item.plan.id)}>
              <PressableScale
                pressEffect="translate"
                onPress={() => onPlanPress(item.plan.id)}
                accessibilityRole="button"
                accessibilityLabel={title}
                style={[styles.row, index === 0 ? null : styles.rowDivider]}
              >
                <View style={styles.rowCoverFrame}>
                  <CoverImage plan={item.plan} colors={colors} t={t} initialSize={22} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  {completedDate ? (
                    <Text style={[styles.rowEyebrow, displayFont.regular]} numberOfLines={1}>
                      {completedDate}
                    </Text>
                  ) : null}
                </View>
                <SoftChip label={t('readingPlans.completed')} colors={colors} />
              </PressableScale>
            </SwipeablePlanRow>
          );
        })}
      </AppCard>
    </View>
  );
}

const createCompletedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      gap: spacing.md,
    },
    sectionHeader: {
      marginTop: 6,
      marginBottom: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    rowCoverFrame: {
      width: ROW_COVER_SIZE,
      height: ROW_COVER_SIZE,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
      backgroundColor: colors.muted,
      flexShrink: 0,
    },
    rowBody: {
      flex: 1,
      gap: spacing.xs,
    },
    rowTitle: {
      ...typography.bodyStrong,
      fontSize: 14.5,
      lineHeight: 19,
      color: colors.primaryText,
    },
    rowEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
  });

// ---------------------------------------------------------------------------
// Loading skeleton — the new geometry: search strip, two-up grid, row list.
// ---------------------------------------------------------------------------

function PlansSkeleton({ colors }: { colors: ThemeColors }) {
  const styles = createSkeletonStyles(colors);

  return (
    <View style={styles.content}>
      <Skeleton width="100%" height={44} borderRadius={radius.lg} />
      <View style={styles.section}>
        <Skeleton width="45%" height={18} borderRadius={radius.xs} />
        <View style={styles.grid}>
          {[0, 1].map((index) => (
            <View key={index} style={styles.gridCard}>
              <View style={styles.gridCover} />
              <Skeleton width="80%" height={14} borderRadius={radius.xs} />
              <Skeleton width="55%" height={11} borderRadius={radius.xs} />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Skeleton width="38%" height={18} borderRadius={radius.xs} />
        <View style={styles.listCard}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.listRow, index === 0 ? null : styles.listRowDivider]}>
              <Skeleton width={ROW_COVER_SIZE} height={ROW_COVER_SIZE} borderRadius={radius.sm} />
              <View style={styles.listRowBody}>
                <Skeleton width="70%" height={14} borderRadius={radius.xs} />
                <Skeleton width="40%" height={11} borderRadius={radius.xs} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const createSkeletonStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      gap: spacing.xl,
    },
    section: {
      gap: spacing.md,
    },
    grid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    gridCard: {
      flexGrow: 0,
      flexBasis: '48%',
      gap: spacing.sm,
      padding: spacing.sm,
      paddingBottom: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    gridCover: {
      width: '100%',
      aspectRatio: RHYTHM_COVER_ASPECT,
      borderRadius: radius.sm,
      backgroundColor: colors.muted,
    },
    listCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    listRowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    listRowBody: {
      flex: 1,
      gap: spacing.sm,
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
  const { contentClearance } = useTabBarHeight();
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

  // "2 ACTIVE · 1 COMPLETED" — drops whichever half is zero, and falls back to
  // the catalog size before anything is enrolled.
  const headerEyebrow = React.useMemo(() => {
    const activeCount = userProgress.filter((progress) => !progress.is_completed).length;
    const completedCount = userProgress.filter((progress) => progress.is_completed).length;
    const parts: string[] = [];
    if (activeCount > 0) {
      parts.push(t('readingPlans.activeCount', { count: activeCount }));
    }
    if (completedCount > 0) {
      parts.push(t('readingPlans.completedCount', { count: completedCount }));
    }
    if (parts.length > 0) {
      return parts.join(' · ');
    }
    return allPlans.length > 0 ? t('readingPlans.plansCount', { count: allPlans.length }) : '';
  }, [allPlans.length, t, userProgress]);

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
        Alert.alert(t('common.error'), t('common.unexpectedError'));
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

  // Three equal segments in one EL segmented control, kept in the sticky header
  // so the display title can scroll away without the switch ever leaving.
  const tabStrip = (
    <View style={styles.tabSticky}>
      <TabSwitch
        fullWidth
        size="md"
        value={activeTab}
        onChange={(key) => setActiveTab(key as PlanTab)}
        accessibilityLabel={t('readingPlans.plans')}
        segments={tabs.map((tab) => ({
          key: tab.key,
          label: t(tab.labelKey as Parameters<typeof t>[0]),
        }))}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentClearance }}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPrimary}
          />
        }
      >
        <View style={styles.header}>
          {headerEyebrow ? (
            <Text style={[styles.headerEyebrow, displayFont.regular]} numberOfLines={1}>
              {headerEyebrow}
            </Text>
          ) : null}
          <Text style={[styles.title, displayFont.bold]}>{t('readingPlans.plans')}</Text>
        </View>
        {tabStrip}

        {loading && allPlans.length === 0 ? (
          <PlansSkeleton colors={colors} />
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
    header: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    headerEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    title: {
      // Screen title, not reading copy — the EL display face, matching Home,
      // More and Settings.
      ...typography.displayHero,
      color: colors.primaryText,
    },
    tabSticky: {
      backgroundColor: colors.background,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.md,
    },
  });
