/**
 * The plan-detail ledger as data: which days it lists, in what order, and what
 * each day shows (read, missed, today, tomorrow, its date and its sessions).
 *
 * The dot grid, the ledger rows and the read/missed tally are three pictures of
 * the same record, so all three resolve a day through `getLedgerDayState` here.
 */
import {
  formatScheduledPlanDayLabel,
  type CurrentPlanDaySummary,
} from '../../../services/plans/readingPlanActivity';
import {
  getDaySessionEntries,
  isCalendarDayOfMonthPlan,
  isCalendarDayOfWeekPlan,
  isRecurringPlan,
  resolvePlanLedgerDayState,
  type ReadingPlanLedgerDayState,
} from '../../../services/plans/readingPlanModel';
import { formatLocalDateKey } from '../../../services/progress/readingActivity';
import type {
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanCategory,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from '../../../services/plans/types';

export const CATEGORY_LABEL_KEYS: Partial<Record<ReadingPlanCategory, string>> = {
  chronological: 'readingPlans.categoryChronological',
  'book-study': 'readingPlans.categoryBookStudy',
  topical: 'readingPlans.categoryTopical',
  devotional: 'readingPlans.categoryDevotional',
};

/** A book names the plan in its eyebrow once it carries this share of the entries. */
const DOMINANT_BOOK_SHARE = 0.6;

export type PlanDaySessionState = 'done' | 'next' | 'upcoming' | 'available';

export interface PlanDaySessionAction {
  sessionKey: PlanSessionKey;
  label: string;
  state: PlanDaySessionState;
}

export interface PlanDayViewModel {
  dayNumber: number;
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  isNext: boolean;
  sessionActions: PlanDaySessionAction[];
}

export function groupEntriesByDay(entries: ReadingPlanEntry[]): Map<number, ReadingPlanEntry[]> {
  const map = new Map<number, ReadingPlanEntry[]>();
  entries.forEach((entry) => {
    const existing = map.get(entry.day_number) ?? [];
    existing.push(entry);
    map.set(entry.day_number, existing);
  });
  return map;
}

/**
 * The local date a recurring plan's day falls on, or `null` for a sequential
 * plan (whose days are scheduled from the enrolment date instead).
 *
 * A day-of-month plan resolves against this month; a day-of-week plan against
 * this week.
 */
export function getRecurringLedgerDayDate(
  plan: ReadingPlan,
  dayNumber: number,
  today: Date
): Date | null {
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
export function getLedgerDayCompletionKey(
  plan: ReadingPlan,
  dayNumber: number,
  today: Date
): string {
  const cycleDate = getRecurringLedgerDayDate(plan, dayNumber, today);
  return cycleDate ? formatLocalDateKey(cycleDate) : String(dayNumber);
}

interface LedgerDayInput {
  plan: ReadingPlan | null;
  progress: UserReadingPlanProgress | null;
  dayNumber: number;
  currentDay: number;
  isCurrentDayComplete: boolean;
  today: Date;
}

/**
 * Whether a plan day counts as read. The cell grid and the ledger rows are two
 * pictures of the same record, so both must resolve it here — otherwise a
 * recurring plan's squares and its rows disagree about the same day.
 */
export function isLedgerDayComplete({
  plan,
  progress,
  dayNumber,
  currentDay,
  isCurrentDayComplete,
  today,
}: LedgerDayInput): boolean {
  if (!plan || !progress) {
    return false;
  }
  if (getLedgerDayCompletionKey(plan, dayNumber, today) in progress.completed_entries) {
    return true;
  }
  return dayNumber === currentDay && isCurrentDayComplete;
}

/**
 * The one place a plan day's ledger state is decided.
 *
 * The cell grid, the ledger rows and the read/missed tally are three pictures of
 * the same record, so all three resolve a day here — otherwise the squares and
 * the rows can disagree about the same date.
 */
export function getLedgerDayState(input: LedgerDayInput): ReadingPlanLedgerDayState {
  const { plan, progress, dayNumber, currentDay, today } = input;
  return resolvePlanLedgerDayState({
    dayNumber,
    currentDay,
    isCompleted: isLedgerDayComplete(input),
    // A recurring cycle's early days can sit before the enrolment date; a
    // sequential plan starts counting from it, so it has no such day.
    dayDate: plan ? getRecurringLedgerDayDate(plan, dayNumber, today) : null,
    startedAt: progress?.started_at ?? null,
  });
}

/** Every day's ledger state, day 1 to `totalDays`, for the dot grid and the tally. */
export function getLedgerCellStates(
  input: Omit<LedgerDayInput, 'dayNumber'> & { totalDays: number }
): ReadingPlanLedgerDayState[] {
  const { totalDays, ...day } = input;
  const states: ReadingPlanLedgerDayState[] = [];
  for (let dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
    states.push(getLedgerDayState({ ...day, dayNumber }));
  }
  return states;
}

/** Short cycle date for a ledger row ("7 Sep"), in the in-app language. */
export function formatLedgerCycleDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

/**
 * The book a plan is about, when one carries most of its entries — "Proverbs"
 * in "DAILY RHYTHM · 31 DAYS · PROVERBS".
 */
export function getDominantPlanBook(entries: ReadingPlanEntry[]): string | null {
  if (entries.length === 0) return null;
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.book, (counts.get(entry.book) ?? 0) + 1));
  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const dominant = ranked[0];
  return dominant && dominant[1] / entries.length >= DOMINANT_BOOK_SHARE ? dominant[0] : null;
}

/** The translation key for the eyebrow's cadence: a rhythm, or the plan's category. */
export function getPlanCadenceLabelKey(plan: ReadingPlan): string | undefined {
  if (isRecurringPlan(plan)) return 'readingPlans.dailyRhythm';
  return plan.category ? CATEGORY_LABEL_KEYS[plan.category] : undefined;
}

/**
 * The day the ledger marks "tomorrow". A recurring cycle wraps back to its
 * first day once you are standing on the last one.
 */
export function getNextLedgerDayNumber(
  ledgerDayNumbers: number[],
  currentDay: number,
  isRecurring: boolean
): number {
  const index = ledgerDayNumbers.indexOf(currentDay);
  if (index === -1) {
    return currentDay + 1;
  }
  const following = ledgerDayNumbers[index + 1];
  if (following != null) {
    return following;
  }
  return isRecurring ? (ledgerDayNumbers[0] ?? currentDay + 1) : currentDay + 1;
}

interface PlanDayViewModelInput {
  plan: ReadingPlan | null;
  progress: UserReadingPlanProgress | null;
  entries: ReadingPlanEntry[];
  entriesByDay: Map<number, ReadingPlanEntry[]>;
  ledgerDayNumbers: number[];
  currentDay: number;
  currentDaySummary: CurrentPlanDaySummary | null;
  nextDayNumber: number;
  isMultiSession: boolean;
  today: Date;
  locale?: string;
}

/** What each ledger day shows, in day order. */
export function buildPlanDayViewModels({
  plan,
  progress,
  entries,
  entriesByDay,
  ledgerDayNumbers,
  currentDay,
  currentDaySummary,
  nextDayNumber,
  isMultiSession,
  today,
  locale,
}: PlanDayViewModelInput): PlanDayViewModel[] {
  const isEnrolled = progress !== null;
  return ledgerDayNumbers.map((dayNumber) => {
    const dayEntries = entriesByDay.get(dayNumber) ?? [];
    const daySessionGroups = isMultiSession ? getDaySessionEntries(entries, dayNumber) : [];
    // Rows and cells read the same record, so a recurring plan's past days
    // carry their real done/missed state instead of collapsing to today.
    const ledgerState = getLedgerDayState({
      plan,
      progress,
      dayNumber,
      currentDay,
      isCurrentDayComplete: Boolean(currentDaySummary?.isComplete),
      today,
    });
    const isCompleted = ledgerState === 'done';
    const isCurrent = dayNumber === currentDay;
    const recurringCycleDate =
      plan && isRecurringPlan(plan) ? getRecurringLedgerDayDate(plan, dayNumber, today) : null;
    const dateLabel = recurringCycleDate
      ? formatLedgerCycleDate(recurringCycleDate, locale)
      : progress && !isRecurringPlan(plan)
        ? formatScheduledPlanDayLabel(progress.started_at, dayNumber)
        : null;
    const launchSessionKey = isMultiSession
      ? isCurrent && isEnrolled
        ? (currentDaySummary?.nextIncompleteSessionKey ?? daySessionGroups[0]?.sessionKey)
        : daySessionGroups[0]?.sessionKey
      : undefined;
    const sessionActions = daySessionGroups.map((group): PlanDaySessionAction => {
      const matchingSummary =
        isCurrent && isEnrolled
          ? (currentDaySummary?.sessionSummaries.find(
              (session) => session.sessionKey === group.sessionKey
            ) ?? null)
          : null;
      const state: PlanDaySessionState =
        !isCurrent || !isEnrolled
          ? 'available'
          : matchingSummary?.isComplete
            ? 'done'
            : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
              ? 'next'
              : 'upcoming';

      return { sessionKey: group.sessionKey, label: group.title, state };
    });

    return {
      dayNumber,
      dateLabel,
      entries: dayEntries,
      launchSessionKey,
      isCompleted,
      isCurrent: isCurrent && isEnrolled,
      // Before enrolling nothing is behind or ahead of you yet, so the ledger
      // stays uniform rather than greying out most of the plan. Once enrolled,
      // "future" also covers a recurring cycle's days that ran before you
      // joined: they carry their date but none of the missed weight.
      isFuture: isEnrolled && ledgerState === 'future',
      isNext: isEnrolled && dayNumber === nextDayNumber,
      sessionActions,
    };
  });
}

/**
 * The ledger reads the way the design does: tomorrow at the top, then the
 * record behind you newest-first, then the rest of the plan ahead of you. With
 * no today card (not enrolled) it stays in day order.
 */
export function orderLedgerRows(
  dayViewModels: PlanDayViewModel[],
  currentDay: number,
  hasTodayCard: boolean
): PlanDayViewModel[] {
  if (!hasTodayCard) {
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
}
