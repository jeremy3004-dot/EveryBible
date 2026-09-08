/* eslint-disable react/prop-types -- screen is fully typed via PlanDetailScreenProps; rule false-positives on navigation/route after the FlashList refactor (matches BibleReaderScreen P1 pattern) */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Image,
  type ColorValue,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, BookOpen, Check, Ellipsis, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont, useTabBarHeight } from '../../hooks';
import { layout, motion, radius, spacing, typography } from '../../design/system';
import { AppButton, AppCard, IconButton, PressableScale, SectionHeader } from '../../components/ui';
import {
  useBibleStore,
  useLibraryStore,
  useProgressStore,
  useReadingPlansStore,
} from '../../stores';
import {
  enrollInPlan,
  getPlansByCategory,
  getPlanEntries,
  listReadingPlans,
  unenrollFromPlan,
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
  isCalendarDayOfMonthPlan,
  isCalendarDayOfWeekPlan,
  isRecurringPlan,
  isMultiSessionPlan,
} from '../../services/plans/readingPlanModel';
import { formatLocalDateKey } from '../../services/progress/readingActivity';
import type {
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanCategory,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from '../../services/plans/types';
import type { PlanDetailScreenProps } from '../../navigation/types';
import { getTranslatedBookName } from '../../constants';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { lightHaptic, successHaptic } from '../../utils';

// ---------------------------------------------------------------------------
// Geometry the design fixes in absolute points
// ---------------------------------------------------------------------------

/** The photographic hero. Its lower third fades into the page background. */
const COVER_HEIGHT = 360;
/** How far the content column rises into the cover's fade. */
const COVER_CONTENT_OVERLAP = 71;
/** Distance from the cover's lower edge to the baseline block of the hero text. */
const HERO_TEXT_BOTTOM = 94;
/** Back / more controls float this far down the cover on a standard notch. */
const COVER_CONTROL_TOP = 62;

// The hero sits over a photograph, so these two cannot come from the theme:
// they must read identically in both scopes or they vanish against the image.
const ON_PHOTO_TEXT = '#FDFAF5';
const ON_PHOTO_EYEBROW = 'rgba(253, 250, 245, 0.82)';
// Readability scrim: dark at the very top (so the controls hold), almost clear
// through the photograph's subject, then deepening into the page background.
const COVER_SCRIM_STOPS = [
  'rgba(12, 11, 9, 0.4)',
  'rgba(12, 11, 9, 0.05)',
  'rgba(12, 11, 9, 0.55)',
  'rgba(12, 11, 9, 0.82)',
] as const;
const COVER_SCRIM_LOCATIONS: readonly [number, number, ...number[]] = [0, 0.25, 0.52, 0.78, 1];

/** Cell ledger: one square per plan day, sixteen to a row. */
const LEDGER_COLUMNS = 16;
const LEDGER_CELL_GAP = spacing.xs;
const LEDGER_CELL_RADIUS = 3;
/** Last cell starts drawing in by here, so the whole grid lands inside 1.5s. */
const LEDGER_DRAW_IN_MAX_DELAY = 1350;
const LEDGER_DRAW_IN_STEP = 30;
/** The mono day column in a ledger row. */
const LEDGER_DAY_WIDTH = 56;

const CATEGORY_LABEL_KEYS: Partial<Record<ReadingPlanCategory, string>> = {
  chronological: 'readingPlans.categoryChronological',
  'book-study': 'readingPlans.categoryBookStudy',
  topical: 'readingPlans.categoryTopical',
  devotional: 'readingPlans.categoryDevotional',
};

// ---------------------------------------------------------------------------
// Helpers (self-contained to avoid cross-screen dep)
// ---------------------------------------------------------------------------

function formatChapterRef(
  entry: ReadingPlanEntry,
  t: ReturnType<typeof useTranslation>['t']
): string {
  const bookName = getTranslatedBookName(entry.book, t);
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

/**
 * Every day the ledger accounts for: the plan's whole day universe.
 *
 * A recurring rhythm still has a full cycle behind it — the Proverbs plan is
 * thirty-one days whether or not you are standing on day thirty — so the ledger
 * lists the cycle even though navigation only ever resumes today's chapter.
 */
function getLedgerDayNumbers(entries: ReadingPlanEntry[]): number[] {
  return Array.from(new Set(entries.map((entry) => entry.day_number))).sort(
    (left, right) => left - right
  );
}

/**
 * The local date a recurring plan's day falls on, or `null` for a sequential
 * plan (whose days are scheduled from the enrolment date instead).
 *
 * A day-of-month plan resolves against this month; a day-of-week plan against
 * this week.
 */
function getRecurringLedgerDayDate(plan: ReadingPlan, dayNumber: number, today: Date): Date | null {
  if (isCalendarDayOfMonthPlan(plan)) {
    return new Date(today.getFullYear(), today.getMonth(), dayNumber);
  }
  if (isCalendarDayOfWeekPlan(plan)) {
    const offset = dayNumber - 1 - today.getDay();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  }
  return null;
}

/**
 * The key a given plan day would be filed under in `completed_entries`.
 *
 * Sequential plans key by day number; recurring rhythms key by the local date
 * the day falls on.
 */
function getLedgerDayCompletionKey(plan: ReadingPlan, dayNumber: number, today: Date): string {
  const cycleDate = getRecurringLedgerDayDate(plan, dayNumber, today);
  return cycleDate ? formatLocalDateKey(cycleDate) : String(dayNumber);
}

/**
 * Whether a plan day counts as read. The cell grid and the ledger rows are two
 * pictures of the same record, so both must resolve it here — otherwise a
 * recurring plan's squares and its rows disagree about the same day.
 */
function isLedgerDayComplete({
  plan,
  progress,
  dayNumber,
  currentDay,
  isCurrentDayComplete,
  today,
}: {
  plan: ReadingPlan | null;
  progress: UserReadingPlanProgress | null;
  dayNumber: number;
  currentDay: number;
  isCurrentDayComplete: boolean;
  today: Date;
}): boolean {
  if (!plan || !progress) {
    return false;
  }
  if (getLedgerDayCompletionKey(plan, dayNumber, today) in progress.completed_entries) {
    return true;
  }
  return dayNumber === currentDay && isCurrentDayComplete;
}

/** Short cycle date for a ledger row ("7 Sep"), in the in-app language. */
function formatLedgerCycleDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
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
        <BookOpen size={Math.round(width * 0.28)} color={colors.secondaryText} strokeWidth={2} />
      </View>
    );
  }
  return <Image source={source} style={{ width, height, borderRadius }} resizeMode="cover" />;
}

const coverImageStyles = StyleSheet.create({
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ---------------------------------------------------------------------------
// Cell ledger — one square per plan day
// ---------------------------------------------------------------------------

type LedgerCellState = 'done' | 'missed' | 'today' | 'future';

function LedgerCells({ states }: { states: LedgerCellState[] }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [innerWidth, setInnerWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setInnerWidth(event.nativeEvent.layout.width);
  }, []);

  // Measured, never hardcoded: the grid has to divide whatever width the card's
  // padding leaves it, on every device size.
  const cellSize =
    innerWidth > 0
      ? Math.max(
          6,
          Math.floor((innerWidth - LEDGER_CELL_GAP * (LEDGER_COLUMNS - 1)) / LEDGER_COLUMNS)
        )
      : 0;

  const palette: Record<LedgerCellState, ViewStyle> = {
    done: { backgroundColor: colors.accentPrimary },
    missed: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning },
    today: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.accentPrimary },
    future: { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.borderStrong },
  };

  return (
    <View
      style={cellStyles.grid}
      onLayout={handleLayout}
      // The read/missed tally above already says this in words; the squares are
      // a picture of it, so screen readers should not walk 365 of them.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {cellSize > 0
        ? states.map((state, index) => (
            <Animated.View
              key={`${state}-${index}`}
              entering={
                reduceMotion
                  ? undefined
                  : FadeIn.duration(motion.duration.fast).delay(
                      Math.min(index * LEDGER_DRAW_IN_STEP, LEDGER_DRAW_IN_MAX_DELAY)
                    )
              }
              style={[cellStyles.cell, { width: cellSize, height: cellSize }, palette[state]]}
            />
          ))
        : null}
    </View>
  );
}

const cellStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: LEDGER_CELL_GAP,
    marginTop: spacing.lg,
  },
  cell: {
    borderRadius: LEDGER_CELL_RADIUS,
  },
});

// ---------------------------------------------------------------------------
// Progress summary card
// ---------------------------------------------------------------------------

interface ProgressCardProps {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress | null;
  currentDaySummary: CurrentPlanDaySummary | null;
  today: Date;
}

function ProgressCard({ plan, progress, currentDaySummary, today }: ProgressCardProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  const totalDays = plan.duration_days;
  const currentDay = currentDaySummary?.dayNumber ?? getActivePlanDayNumber(plan, progress, today);

  const cellStates = useMemo<LedgerCellState[]>(() => {
    const states: LedgerCellState[] = [];
    for (let day = 1; day <= totalDays; day += 1) {
      const isDone = isLedgerDayComplete({
        plan,
        progress,
        dayNumber: day,
        currentDay,
        isCurrentDayComplete: Boolean(currentDaySummary?.isComplete),
        today,
      });
      states.push(
        isDone ? 'done' : day === currentDay ? 'today' : day < currentDay ? 'missed' : 'future'
      );
    }
    return states;
  }, [currentDay, currentDaySummary?.isComplete, plan, progress, today, totalDays]);

  const doneCount = cellStates.filter((state) => state === 'done').length;
  const missedCount = cellStates.filter((state) => state === 'missed').length;
  const tallyLabel =
    missedCount > 0
      ? t('readingPlans.readMissedSummary', { read: doneCount, missed: missedCount })
      : t('readingPlans.readSummary', { read: doneCount });

  return (
    <AppCard padding={layout.cardPaddingWide}>
      <View style={progressCardStyles.headRow}>
        <View>
          <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('readingPlans.day')}
          </Text>
          <View style={progressCardStyles.numeralRow}>
            <Text style={[typography.numeralXL, { color: colors.primaryText }]}>{currentDay}</Text>
            <Text style={[progressCardStyles.numeralTotal, { color: colors.secondaryText }]}>
              /{totalDays}
            </Text>
          </View>
        </View>

        <View style={progressCardStyles.tally}>
          <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
            {t('readingPlans.completed')}
          </Text>
          <Text
            style={[
              progressCardStyles.tallyValue,
              displayFont.regular,
              { color: colors.primaryText },
            ]}
          >
            {tallyLabel}
          </Text>
        </View>
      </View>

      <LedgerCells states={cellStates} />
    </AppCard>
  );
}

const progressCardStyles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  numeralRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  numeralTotal: {
    ...typography.sectionHeading,
    fontSize: 18,
    letterSpacing: -0.45,
  },
  tally: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  tallyValue: {
    ...typography.mono,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// Day row — the accent "today" card and the ledger slices below it
// ---------------------------------------------------------------------------

export const CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row';

type PlanDaySessionState = 'done' | 'next' | 'upcoming' | 'available';

interface PlanDayViewModel {
  dayNumber: number;
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  isNext: boolean;
  sessionActions: Array<{
    sessionKey: PlanSessionKey;
    label: string;
    state: PlanDaySessionState;
  }>;
}

interface DayRowProps {
  dayNumber: number;
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  isNext: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Today card only: "Today's target: 1/3 chapters" or the chapter count. */
  subtitle?: string | null;
  audioAvailable?: boolean;
  sessionActions?: Array<{
    sessionKey: PlanSessionKey;
    label: string;
    state: PlanDaySessionState;
  }>;
  onPress: (dayNumber: number, sessionKey?: PlanSessionKey) => void;
  onListen?: (dayNumber: number, sessionKey?: PlanSessionKey) => void;
}

const DayRow = React.memo(function DayRow({
  dayNumber,
  dateLabel,
  entries,
  launchSessionKey,
  isCompleted,
  isCurrent,
  isFuture,
  isNext,
  isFirst = false,
  isLast = false,
  subtitle,
  audioAvailable = false,
  sessionActions = [],
  onPress,
  onListen,
}: DayRowProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();

  const { t } = useTranslation();
  const refs = entries.map((entry) => formatChapterRef(entry, t)).join(', ');
  const accessibilityLabel = isCurrent
    ? `${t('interface.currentPlanDay', { day: dayNumber })}${dateLabel ? `, ${dateLabel}` : ''}: ${refs}`
    : `${t('interface.planDay', { day: dayNumber })}${dateLabel ? `, ${dateLabel}` : ''}: ${refs}`;
  const hasSessionActions = sessionActions.length > 0;

  const sessionActionRow = hasSessionActions ? (
    <View style={dayRowStyles.sessionActionRow}>
      {sessionActions.map((action) => {
        const isFilled = action.state === 'done' || action.state === 'next';
        return (
          <PressableScale
            key={`${dayNumber}-${action.sessionKey}`}
            pressEffect="translate"
            haptic="light"
            onPress={() => onPress(dayNumber, action.sessionKey)}
            accessibilityRole="button"
            accessibilityLabel={t('interface.planSessionForDay', {
              session: action.label,
              day: dayNumber,
            })}
            style={[
              dayRowStyles.sessionActionButton,
              {
                backgroundColor: isFilled ? colors.accentSurface : colors.background,
                borderColor: isFilled ? colors.accentSurface : colors.borderStrong,
              },
            ]}
          >
            <Text
              style={[
                dayRowStyles.sessionActionLabel,
                displayFont.regular,
                { color: isFilled ? colors.onAccentSurface : colors.secondaryText },
              ]}
            >
              {action.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  ) : null;

  // ---- Today: the one accent-ruled card on the screen ----------------------
  if (isCurrent) {
    return (
      <AppCard accentRule padding={spacing.lg} style={dayRowStyles.todayCard}>
        <View style={dayRowStyles.todayRow}>
          <PressableScale
            pressEffect="translate"
            haptic="light"
            onPress={() => onPress(dayNumber, launchSessionKey)}
            testID={isCurrent ? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            style={dayRowStyles.todayContent}
          >
            <Text
              style={[typography.eyebrow, displayFont.regular, { color: colors.accentPrimary }]}
              numberOfLines={1}
            >
              {`${t('home.today')} · ${t('readingPlans.dayLabel', { day: dayNumber })}`}
            </Text>
            <Text
              style={[dayRowStyles.todayTitle, { color: colors.primaryText }]}
              numberOfLines={1}
            >
              {refs}
            </Text>
            {subtitle ? (
              <Text
                style={[dayRowStyles.todaySubtitle, { color: colors.secondaryText }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </PressableScale>

          <View style={dayRowStyles.todayActions}>
            <AppButton
              label={t('bible.read')}
              size="md"
              fullWidth={false}
              onPress={() => onPress(dayNumber, launchSessionKey)}
              style={dayRowStyles.todayReadButton}
            />
            {audioAvailable && onListen ? (
              <IconButton
                icon={Play}
                variant="paper"
                onPress={() => onListen(dayNumber, launchSessionKey)}
                accessibilityLabel={t('bible.listen')}
              />
            ) : null}
          </View>
        </View>
        {sessionActionRow}
      </AppCard>
    );
  }

  // ---- Ledger slice --------------------------------------------------------
  const trailing = isNext ? (
    <Text style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}>
      {t('readingPlans.tomorrow')}
    </Text>
  ) : isCompleted ? (
    <View style={dayRowStyles.ledgerTrailingGroup}>
      <Check size={12} color={colors.success} strokeWidth={2} />
      {dateLabel ? (
        <Text style={[typography.eyebrow, { color: colors.secondaryText }]}>{dateLabel}</Text>
      ) : null}
    </View>
  ) : dateLabel ? (
    <Text style={[typography.eyebrow, { color: colors.textTertiary }]}>{dateLabel}</Text>
  ) : null;

  return (
    <PressableScale
      pressEffect="translate"
      haptic="light"
      onPress={() => onPress(dayNumber, launchSessionKey)}
      testID={isCurrent ? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[
        dayRowStyles.ledgerSlice,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        isFirst ? dayRowStyles.ledgerSliceFirst : null,
        isLast ? dayRowStyles.ledgerSliceLast : null,
      ]}
    >
      <View
        style={[
          dayRowStyles.ledgerRow,
          isFirst ? null : { borderTopWidth: 1, borderTopColor: colors.borderStrong },
        ]}
      >
        <Text
          style={[
            dayRowStyles.ledgerDay,
            { color: isFuture ? colors.textTertiary : colors.secondaryText },
          ]}
          numberOfLines={1}
        >
          {t('readingPlans.dayLabel', { day: dayNumber })}
        </Text>
        <Text
          style={[
            dayRowStyles.ledgerRef,
            { color: isFuture ? colors.textTertiary : colors.primaryText },
          ]}
          numberOfLines={1}
        >
          {refs}
        </Text>
        <View style={dayRowStyles.ledgerTrailing}>{trailing}</View>
      </View>
      {hasSessionActions && !isFuture ? (
        <View style={dayRowStyles.ledgerSessions}>{sessionActionRow}</View>
      ) : null}
    </PressableScale>
  );
});

const dayRowStyles = StyleSheet.create({
  // Today card
  todayCard: {
    paddingVertical: 14,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  todayContent: {
    flex: 1,
    gap: spacing.xs,
  },
  todayTitle: {
    ...typography.cardTitle,
  },
  todaySubtitle: {
    ...typography.captionStrong,
    fontWeight: '400',
  },
  todayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  todayReadButton: {
    paddingHorizontal: spacing.lg,
  },

  // Ledger slice
  ledgerSlice: {
    marginHorizontal: layout.screenPadding,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  ledgerSliceFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  ledgerSliceLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    marginHorizontal: spacing.lg,
  },
  ledgerDay: {
    ...typography.mono,
    fontWeight: '600',
    width: LEDGER_DAY_WIDTH,
  },
  ledgerRef: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    lineHeight: 20,
    flex: 1,
  },
  ledgerTrailing: {
    alignItems: 'flex-end',
  },
  ledgerTrailingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ledgerSessions: {
    marginHorizontal: spacing.lg,
  },

  // Session actions (multi-session plans)
  sessionActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sessionActionButton: {
    minHeight: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sessionActionLabel: {
    ...typography.monoSmall,
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
    <AppCard
      pressable
      padding={0}
      onPress={() => onPress(plan.id)}
      style={relatedCardStyles.card}
      accessibilityLabel={t(plan.title_key as Parameters<typeof t>[0], {
        defaultValue: plan.title_key,
      })}
    >
      <PlanCoverImage plan={plan} width={172} height={92} borderRadius={0} />
      <View style={relatedCardStyles.info}>
        <Text style={[relatedCardStyles.title, { color: colors.primaryText }]} numberOfLines={2}>
          {t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })}
        </Text>
        <Text style={[relatedCardStyles.duration, { color: colors.secondaryText }]}>
          {t('readingPlans.durationDays', { count: plan.duration_days })}
        </Text>
      </View>
    </AppCard>
  );
}

const relatedCardStyles = StyleSheet.create({
  card: {
    width: 172,
    overflow: 'hidden',
  },
  info: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.captionStrong,
  },
  duration: {
    ...typography.caption,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function PlanDetailScreen({ route, navigation }: PlanDetailScreenProps) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
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
  // The ledger accounts for the whole plan, recurring rhythms included: the
  // reference design lists a 31-day Proverbs cycle even on day 30.
  const ledgerDayNumbers = React.useMemo(() => getLedgerDayNumbers(entries), [entries]);

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
      setError(t('common.error'));
    }

    if (entriesResult.success) {
      setEntries(entriesResult.data ?? []);
    } else {
      // Only surface an error when we have no entries to show; keep any
      // previously loaded rows visible on a transient refresh failure.
      setEntries((prev) => {
        if (prev.length === 0) {
          setError(t('common.error'));
        }
        return prev;
      });
    }

    // Fetch related plans once we know the category
    if (foundPlan?.category) {
      const relatedResult = await getPlansByCategory(foundPlan.category);
      if (relatedResult.success) {
        const filtered = (relatedResult.data ?? []).filter((p) => p.id !== planId).slice(0, 5);
        setRelatedPlans(filtered);
      }
    }

    setLoading(false);
  }, [planId, t]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const currentDay = plan
    ? getActivePlanDayNumber(plan, progress, today)
    : (progress?.current_day ?? 1);
  const chaptersRead = useProgressStore((state) => state.chaptersRead);
  const listeningHistory = useLibraryStore((state) => state.history);
  const preferredChapterLaunchMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const translations = useBibleStore((state) => state.translations);
  const currentTranslationId = useBibleStore((state) => state.currentTranslation);
  const audioAvailable = React.useMemo(
    () => translations.find((entry) => entry.id === currentTranslationId)?.hasAudio ?? false,
    [currentTranslationId, translations]
  );
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
  const heroEyebrow = React.useMemo(() => {
    if (!plan) return null;
    const cadenceKey = isRecurringPlan(plan)
      ? 'readingPlans.dailyRhythm'
      : plan.category
        ? CATEGORY_LABEL_KEYS[plan.category]
        : undefined;

    const counts = new Map<string, number>();
    entries.forEach((entry) => counts.set(entry.book, (counts.get(entry.book) ?? 0) + 1));
    const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
    const dominant = ranked[0];
    const bookLabel =
      dominant && entries.length > 0 && dominant[1] / entries.length >= 0.6
        ? getTranslatedBookName(dominant[0], t)
        : null;

    return [
      cadenceKey ? t(cadenceKey as Parameters<typeof t>[0]) : null,
      t('readingPlans.durationDays', { count: plan.duration_days }),
      bookLabel,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [entries, plan, t]);

  // The day the ledger marks "tomorrow". A recurring cycle wraps back to its
  // first day once you are standing on the last one.
  const nextDayNumber = React.useMemo(() => {
    const index = ledgerDayNumbers.indexOf(currentDay);
    if (index === -1) {
      return currentDay + 1;
    }
    const following = ledgerDayNumbers[index + 1];
    if (following != null) {
      return following;
    }
    return isRecurringPlan(plan) ? (ledgerDayNumbers[0] ?? currentDay + 1) : currentDay + 1;
  }, [currentDay, ledgerDayNumbers, plan]);

  const dayViewModels = React.useMemo<PlanDayViewModel[]>(() => {
    return ledgerDayNumbers.map((dayNumber) => {
      const dayEntries = entriesByDay.get(dayNumber) ?? [];
      const daySessionGroups = multiSessionPlan ? getDaySessionEntries(entries, dayNumber) : [];
      // Rows and cells read the same record, so a recurring plan's past days
      // carry their real done/missed state instead of collapsing to today.
      const isCompleted = isLedgerDayComplete({
        plan,
        progress,
        dayNumber,
        currentDay,
        isCurrentDayComplete: Boolean(currentDaySummary?.isComplete),
        today,
      });
      const isCurrent = dayNumber === currentDay;
      const recurringCycleDate =
        plan && isRecurringPlan(plan) ? getRecurringLedgerDayDate(plan, dayNumber, today) : null;
      const dateLabel = recurringCycleDate
        ? formatLedgerCycleDate(recurringCycleDate, i18n.language)
        : progress && !isRecurringPlan(plan)
          ? formatScheduledPlanDayLabel(progress.started_at, dayNumber)
          : null;
      const launchSessionKey = multiSessionPlan
        ? isCurrent && isEnrolled
          ? (currentDaySummary?.nextIncompleteSessionKey ?? daySessionGroups[0]?.sessionKey)
          : daySessionGroups[0]?.sessionKey
        : undefined;
      const sessionActions = daySessionGroups.map((group) => {
        const matchingSummary =
          isCurrent && isEnrolled
            ? (currentDaySummary?.sessionSummaries.find(
                (session) => session.sessionKey === group.sessionKey
              ) ?? null)
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

      return {
        dayNumber,
        dateLabel,
        entries: dayEntries,
        launchSessionKey,
        isCompleted,
        isCurrent: isCurrent && isEnrolled,
        // Before enrolling nothing is behind or ahead of you yet, so the ledger
        // stays uniform rather than greying out most of the plan.
        isFuture: isEnrolled && dayNumber > currentDay,
        isNext: isEnrolled && dayNumber === nextDayNumber,
        sessionActions,
      };
    });
  }, [
    currentDay,
    currentDaySummary,
    entries,
    entriesByDay,
    i18n.language,
    isEnrolled,
    ledgerDayNumbers,
    multiSessionPlan,
    nextDayNumber,
    plan,
    progress,
    today,
  ]);

  const todayViewModel = React.useMemo(
    () => (isEnrolled ? (dayViewModels.find((item) => item.isCurrent) ?? null) : null),
    [dayViewModels, isEnrolled]
  );

  // The ledger reads the way the design does: tomorrow at the top, then the
  // record behind you newest-first, then the rest of the plan ahead of you.
  const ledgerRows = React.useMemo<PlanDayViewModel[]>(() => {
    if (!todayViewModel) {
      return dayViewModels;
    }
    const rest = dayViewModels.filter((item) => item.dayNumber !== currentDay);
    return [
      ...rest.filter((item) => item.isNext),
      ...rest
        .filter((item) => !item.isNext && item.dayNumber < currentDay)
        .sort((left, right) => right.dayNumber - left.dayNumber),
      ...rest.filter((item) => !item.isNext && item.dayNumber > currentDay),
    ];
  }, [currentDay, dayViewModels, todayViewModel]);

  const todaySubtitle = React.useMemo(() => {
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

  const scrimColors = React.useMemo(
    () =>
      [...COVER_SCRIM_STOPS, colors.background] as readonly [
        ColorValue,
        ColorValue,
        ...ColorValue[],
      ],
    [colors.background]
  );
  const controlTop = Math.max(insets.top + spacing.sm, COVER_CONTROL_TOP);
  const listContentStyle = React.useMemo(
    () => ({ paddingBottom: tabBar.contentClearance }),
    [tabBar.contentClearance]
  );

  const BackGlyph = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  const listHeader = (
    <View>
      {/* ------------------------------------------------------------------ */}
      {/* Cover hero                                                          */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.cover}>
        {heroCoverSource ? (
          <Image source={heroCoverSource} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={[styles.coverImage, { backgroundColor: colors.accentSecondary }]}>
            <BookOpen size={60} color={colors.secondaryText} strokeWidth={2} />
          </View>
        )}

        {/* The cover is always a photographic hero, so the scrim and the text on
            it are fixed on-photo values in both scopes; only the final stop is
            themed, so the image dissolves into the page. */}
        <LinearGradient
          colors={scrimColors}
          locations={COVER_SCRIM_LOCATIONS}
          style={styles.coverScrim}
        />

        <View style={[styles.coverControls, { top: controlTop }]} pointerEvents="box-none">
          <IconButton
            icon={BackGlyph}
            variant="paper"
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
          {isEnrolled ? (
            <IconButton
              icon={Ellipsis}
              variant="paper"
              onPress={handleLeavePlan}
              accessibilityLabel={t('readingPlans.planOptions')}
            />
          ) : null}
        </View>

        <View style={styles.coverTitleWrap}>
          {heroEyebrow ? (
            <Text
              style={[styles.coverEyebrow, displayFont.regular]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {heroEyebrow}
            </Text>
          ) : null}
          <Text style={[styles.coverTitle, displayFont.bold]} numberOfLines={1}>
            {planTitle}
          </Text>
        </View>
      </View>

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

  const listFooter = (
    <View>
      {relatedPlans.length > 0 ? (
        <View style={styles.relatedSection}>
          <SectionHeader title={t('readingPlans.relatedPlans')} style={styles.relatedHeader} />
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
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.plainHeader, { paddingTop: insets.top + spacing.sm }]}>
          <IconButton
            icon={BackGlyph}
            variant="paper"
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
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
        <View style={[styles.plainHeader, { paddingTop: insets.top + spacing.sm }]}>
          <IconButton
            icon={BackGlyph}
            variant="paper"
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('common.back')}
          />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <AppButton label={t('common.retry')} variant="outline" onPress={load} fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={ledgerRows}
        renderItem={renderDayRow}
        keyExtractor={keyExtractorDay}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={48}
        extraData={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Loading / error states
  plainHeader: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
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

  // Cover hero
  cover: {
    height: COVER_HEIGHT,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  coverControls: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverTitleWrap: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: HERO_TEXT_BOTTOM,
    gap: spacing.sm,
  },
  coverEyebrow: {
    ...typography.eyebrow,
    color: ON_PHOTO_EYEBROW,
  },
  coverTitle: {
    ...typography.screenTitle,
    color: ON_PHOTO_TEXT,
  },

  // Content column
  headerBody: {
    marginTop: -COVER_CONTENT_OVERLAP,
    paddingHorizontal: layout.screenPadding,
  },
  todayWrap: {
    marginTop: spacing.lg,
  },
  introBlock: {
    marginTop: spacing.lg,
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

  // Related plans
  relatedSection: {
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  relatedHeader: {
    paddingHorizontal: layout.screenPadding,
  },
  relatedList: {
    paddingHorizontal: layout.screenPadding,
  },
  relatedSeparator: {
    width: spacing.md,
  },
});
