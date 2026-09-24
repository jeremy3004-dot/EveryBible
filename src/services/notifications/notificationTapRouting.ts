// Kept free of expo and react-native imports: App.tsx loads it lazily on a tap,
// and the node test runner loads it directly.
import type { UserReadingPlanProgress } from '../plans/types';

/**
 * The payload the daily reminder carries so a tap can be routed. Scheduled
 * notifications keep their content, so older reminders without it simply open
 * the app (they are rescheduled with it on the next launch's reconcile).
 */
export const DAILY_REMINDER_NOTIFICATION_DATA = { screen: 'plans' } as const;

/** Where a notification tap lands inside the Plans tab. */
export type NotificationTapDestination =
  | { screen: 'PlansHome' }
  | { screen: 'PlanDetail'; planId: string };

export type NotificationTapOutcome = 'navigated' | 'pending' | 'ignored';

export interface NotificationTapRouterDeps {
  isNavigationReady: () => boolean;
  navigate: (destination: NotificationTapDestination) => void;
  getActivePlanIds: () => readonly string[];
}

type NotificationTapTarget = 'plans';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Reads what a tapped notification asks for. The response comes from native
 * code and group pushes carry their own payloads, so anything unexpected is
 * treated as "just open the app" rather than trusted.
 */
function readTapTarget(response: unknown): { target: NotificationTapTarget; key: string } | null {
  if (!isRecord(response) || !isRecord(response.notification)) {
    return null;
  }
  const { notification } = response;
  const request = notification.request;
  if (!isRecord(request) || !isRecord(request.content)) {
    return null;
  }
  const data = request.content.data;
  if (!isRecord(data) || data.screen !== DAILY_REMINDER_NOTIFICATION_DATA.screen) {
    return null;
  }
  const identifier = typeof request.identifier === 'string' ? request.identifier : '';
  const date = typeof notification.date === 'number' ? notification.date : 0;
  return { target: 'plans', key: `${identifier}:${date}` };
}

/** The plans a reader is part-way through: joined and not yet finished. */
export function getActiveReadingPlanIds(
  progressByPlanId: Record<string, UserReadingPlanProgress>
): string[] {
  return Object.values(progressByPlanId)
    .filter((progress) => progress && !progress.is_completed)
    .map((progress) => progress.plan_id);
}

/**
 * Routes notification taps once navigation can take them.
 *
 * A cold-start tap arrives before the navigator exists, and it can arrive twice
 * (the launch response and the listener), so a tap is parked until
 * `flush()` finds navigation ready, and the same tap is handled once. The plan
 * is chosen at navigation time, after the plans store has hydrated: exactly one
 * active plan opens that plan's detail (today's reading); otherwise Plans.
 */
export function createNotificationTapRouter(deps: NotificationTapRouterDeps) {
  let pending: NotificationTapTarget | null = null;
  let lastHandledKey: string | null = null;

  const resolveDestination = (): NotificationTapDestination => {
    let activePlanIds: readonly string[] = [];
    try {
      activePlanIds = deps.getActivePlanIds();
    } catch {
      activePlanIds = [];
    }
    return activePlanIds.length === 1
      ? { screen: 'PlanDetail', planId: activePlanIds[0] }
      : { screen: 'PlansHome' };
  };

  const flush = (): boolean => {
    if (!pending) {
      return false;
    }
    let ready = false;
    try {
      ready = deps.isNavigationReady();
    } catch {
      ready = false;
    }
    if (!ready) {
      return false;
    }
    pending = null;
    try {
      deps.navigate(resolveDestination());
      return true;
    } catch {
      return false;
    }
  };

  const handleResponse = (response: unknown): NotificationTapOutcome => {
    const tap = readTapTarget(response);
    if (!tap || tap.key === lastHandledKey) {
      return 'ignored';
    }
    lastHandledKey = tap.key;
    pending = tap.target;
    if (flush()) {
      return 'navigated';
    }
    return pending ? 'pending' : 'ignored';
  };

  return {
    handleResponse,
    flush,
    hasPending: (): boolean => pending !== null,
    /** Drops a parked tap, e.g. when navigation never became ready. */
    clearPending: (): void => {
      pending = null;
    },
  };
}

export type NotificationTapRouter = ReturnType<typeof createNotificationTapRouter>;
