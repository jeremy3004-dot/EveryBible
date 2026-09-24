import {
  getActivePlanDayNumber,
  getPlanCompletionEntryKey,
  isRecurringPlan,
} from '../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';

export interface HomeContinuePlan {
  plan: ReadingPlan;
  progress: UserReadingPlanProgress;
}

const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const parseTimestamp = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * Whether the plan has already been read today.
 *
 * A recurring rhythm (Proverbs by day of month, the weekly Kathisma) has one
 * reading per calendar day, so today is done once today's day is ticked. A
 * sequential plan can be read ahead, so any day ticked today counts.
 */
function isReadToday({ plan, progress }: HomeContinuePlan, today: Date): boolean {
  if (isRecurringPlan(plan)) {
    const todayKey = getPlanCompletionEntryKey(
      plan,
      getActivePlanDayNumber(plan, progress, today),
      today
    );
    return todayKey in progress.completed_entries;
  }

  return Object.values(progress.completed_entries).some((completedAt) => {
    const time = parseTimestamp(completedAt);
    return time != null && isSameLocalDay(new Date(time), today);
  });
}

/** The last time the plan was touched: its latest tick, else its enrolment. */
function getLastActivityTime({ progress }: HomeContinuePlan): number {
  let latest = parseTimestamp(progress.started_at) ?? 0;
  for (const completedAt of Object.values(progress.completed_entries)) {
    const time = parseTimestamp(completedAt);
    if (time != null && time > latest) {
      latest = time;
    }
  }
  return latest;
}

/**
 * The in-progress plans Home offers to continue, best first.
 *
 * 1. Plans with a reading still to do today, before plans already read today.
 * 2. Then the plan read (or joined) most recently.
 * 3. Otherwise catalogue order.
 *
 * `current_day` is deliberately not a criterion: for a recurring plan it is just
 * the last day ticked, so the Proverbs plan on the 24th would outrank a year plan
 * on day 5 for no reason.
 */
export function selectHomeContinuePlans(
  plans: ReadingPlan[],
  progressByPlanId: Record<string, UserReadingPlanProgress>,
  limit = 2,
  today: Date = new Date()
): HomeContinuePlan[] {
  return plans
    .map((plan) => {
      const progress = progressByPlanId[plan.id];
      return progress ? { plan, progress } : null;
    })
    .filter((item): item is HomeContinuePlan => item !== null && !item.progress.is_completed)
    .map((item) => ({
      item,
      readToday: isReadToday(item, today),
      lastActivity: getLastActivityTime(item),
    }))
    .sort((left, right) => {
      if (left.readToday !== right.readToday) {
        return left.readToday ? 1 : -1;
      }
      return right.lastActivity - left.lastActivity;
    })
    .map(({ item }) => item)
    .slice(0, Math.max(0, limit));
}
