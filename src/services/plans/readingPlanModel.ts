import type {
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
} from './types';

const UNSYNCED_LOCAL_PROGRESS_GRACE_MS = 5 * 60 * 1000;
const UUID_PLAN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_SESSION_ORDER: PlanSessionKey[] = ['morning', 'midday', 'evening'];
const RECURRING_PLAN_SCHEDULE_MODES = new Set<ReadingPlan['scheduleMode']>([
  'calendar-day-of-month',
  'calendar-day-of-week',
]);

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateKey: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
};

const getLocalWeekStart = (
  date: Date,
  weekStartsOn: Pick<ReadingPlan, 'weekStartsOn'>['weekStartsOn'] = 'sunday'
): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const firstDay = weekStartsOn === 'monday' ? 1 : 0;
  const daysSinceStart = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - daysSinceStart);
  return start;
};

const isSameLocalMonth = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const isSameLocalWeek = (
  left: Date,
  right: Date,
  weekStartsOn: Pick<ReadingPlan, 'weekStartsOn'>['weekStartsOn'] = 'sunday'
): boolean => {
  const leftStart = getLocalWeekStart(left, weekStartsOn);
  const rightStart = getLocalWeekStart(right, weekStartsOn);
  return formatLocalDateKey(leftStart) === formatLocalDateKey(rightStart);
};

// ---------------------------------------------------------------------------
// Pure model functions for reading plan progress — no Supabase dependency.
// These are extracted so they can be unit-tested without network or auth.
// ---------------------------------------------------------------------------

export function canSyncReadingPlanRemotely(planId: string): boolean {
  const normalizedPlanId = planId.trim();
  return normalizedPlanId.length > 0;
}

export interface RemoteReadingPlanProgressRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_slug: string | null;
  started_at: string;
  completed_entries: Record<string, string> | null;
  current_day: number | null;
  is_completed: boolean | null;
  completed_at: string | null;
  synced_at: string | null;
  completed_sessions?: Record<string, string> | null;
  current_session?: PlanSessionKey | null;
}

export function normalizeRemoteReadingPlanProgress(
  progress: RemoteReadingPlanProgressRow
): UserReadingPlanProgress | null {
  const localPlanId = progress.plan_slug?.trim() || progress.plan_id?.trim() || null;
  if (!localPlanId) {
    return null;
  }

  return {
    id: progress.id,
    user_id: progress.user_id,
    plan_id: localPlanId,
    started_at: progress.started_at,
    completed_entries: progress.completed_entries ?? {},
    completed_sessions: progress.completed_sessions ?? {},
    current_day: progress.current_day ?? 1,
    current_session: progress.current_session ?? null,
    is_completed: Boolean(progress.is_completed),
    completed_at: progress.completed_at ?? null,
    synced_at: progress.synced_at ?? progress.started_at,
  };
}

export function buildRemoteReadingPlanProgressPayload(
  progress: UserReadingPlanProgress,
  userId: string
): Omit<RemoteReadingPlanProgressRow, 'id' | 'completed_sessions' | 'current_session'> {
  const normalizedPlanId = progress.plan_id.trim();
  const remoteUuid = UUID_PLAN_ID_PATTERN.test(normalizedPlanId) ? normalizedPlanId : null;

  return {
    user_id: userId,
    plan_id: remoteUuid,
    plan_slug: normalizedPlanId,
    started_at: progress.started_at,
    completed_entries: progress.completed_entries,
    current_day: progress.current_day,
    is_completed: progress.is_completed,
    completed_at: progress.completed_at,
    synced_at: progress.synced_at,
  };
}

export function isCalendarDayOfMonthPlan(plan?: Pick<ReadingPlan, 'scheduleMode'> | null): boolean {
  return plan?.scheduleMode === 'calendar-day-of-month';
}

export function isCalendarDayOfWeekPlan(plan?: Pick<ReadingPlan, 'scheduleMode'> | null): boolean {
  return plan?.scheduleMode === 'calendar-day-of-week';
}

export function isRecurringPlan(plan?: Pick<ReadingPlan, 'scheduleMode'> | null): boolean {
  return RECURRING_PLAN_SCHEDULE_MODES.has(plan?.scheduleMode);
}

function getRecurringPlanDayNumber(
  plan: Pick<ReadingPlan, 'duration_days' | 'scheduleMode'>,
  today: Date
): number | null {
  if (isCalendarDayOfMonthPlan(plan)) {
    return today.getDate();
  }

  if (isCalendarDayOfWeekPlan(plan)) {
    return today.getDay() + 1;
  }

  return null;
}

export function getActivePlanDayNumber(
  plan: Pick<ReadingPlan, 'duration_days' | 'scheduleMode'>,
  progress?: Pick<UserReadingPlanProgress, 'current_day'> | null,
  today: Date = new Date()
): number {
  const recurringDayNumber = getRecurringPlanDayNumber(plan, today);
  if (recurringDayNumber != null) {
    const maxDay = plan.duration_days > 0 ? plan.duration_days : recurringDayNumber;
    return Math.min(Math.max(recurringDayNumber, 1), maxDay);
  }

  return Math.max(progress?.current_day ?? 1, 1);
}

export function getVisiblePlanDayNumbers(
  plan: Pick<ReadingPlan, 'duration_days' | 'scheduleMode'> | null | undefined,
  entries: ReadingPlanEntry[],
  progress?: Pick<UserReadingPlanProgress, 'current_day'> | null,
  today: Date = new Date()
): number[] {
  const uniqueDayNumbers = Array.from(new Set(entries.map((entry) => entry.day_number))).sort(
    (left, right) => left - right
  );

  if (!isRecurringPlan(plan)) {
    return uniqueDayNumbers;
  }

  const activeDayNumber = getActivePlanDayNumber(plan!, progress, today);
  return uniqueDayNumbers.includes(activeDayNumber) ? [activeDayNumber] : uniqueDayNumbers;
}

export function getPlanCompletionEntryKey(
  plan: Pick<ReadingPlan, 'scheduleMode'>,
  dayNumber: number,
  today: Date = new Date()
): string {
  return isRecurringPlan(plan) ? formatLocalDateKey(today) : String(dayNumber);
}

export function getVisibleCompletedEntryCount(
  plan: Pick<ReadingPlan, 'scheduleMode' | 'weekStartsOn'>,
  completedEntries: Record<string, string>,
  today: Date = new Date()
): number {
  if (isCalendarDayOfMonthPlan(plan)) {
    return Object.keys(completedEntries).filter((dateKey) => {
      const completedDate = parseLocalDateKey(dateKey);
      return completedDate ? isSameLocalMonth(completedDate, today) : false;
    }).length;
  }

  if (isCalendarDayOfWeekPlan(plan)) {
    return Object.keys(completedEntries).filter((dateKey) => {
      const completedDate = parseLocalDateKey(dateKey);
      return completedDate
        ? isSameLocalWeek(completedDate, today, plan.weekStartsOn ?? 'sunday')
        : false;
    }).length;
  }

  return Object.keys(completedEntries).length;
}

function isPlanSessionKey(value: string | null | undefined): value is PlanSessionKey {
  return PLAN_SESSION_ORDER.includes(value as PlanSessionKey);
}

function normalizePlanSessionOrder(sessionOrder?: PlanSessionKey[] | null): PlanSessionKey[] {
  const seen = new Set<PlanSessionKey>();

  return (sessionOrder ?? []).reduce<PlanSessionKey[]>((accumulator, sessionKey) => {
    if (!isPlanSessionKey(sessionKey) || seen.has(sessionKey)) {
      return accumulator;
    }

    seen.add(sessionKey);
    accumulator.push(sessionKey);
    return accumulator;
  }, []);
}

export function isMultiSessionPlan(plan?: Pick<ReadingPlan, 'format'> | null): boolean {
  return plan?.format === 'multi-session';
}

export function getPlanSessionOrder(
  plan: Pick<ReadingPlan, 'format' | 'sessionOrder'> | null | undefined,
  entries: ReadingPlanEntry[]
): PlanSessionKey[] {
  const planSessionOrder = normalizePlanSessionOrder(plan?.sessionOrder);
  if (planSessionOrder.length > 0) {
    return planSessionOrder;
  }

  if (!isMultiSessionPlan(plan)) {
    return [];
  }

  const entrySessionMap = new Map<PlanSessionKey, { order: number; firstSeenIndex: number }>();

  entries.forEach((entry, index) => {
    if (!isPlanSessionKey(entry.session_key)) {
      return;
    }

    const sessionKey = entry.session_key;
    const normalizedOrder =
      typeof entry.session_order === 'number' && Number.isFinite(entry.session_order)
        ? entry.session_order
        : PLAN_SESSION_ORDER.indexOf(sessionKey) + 1;
    const existing = entrySessionMap.get(sessionKey);

    if (!existing || normalizedOrder < existing.order) {
      entrySessionMap.set(sessionKey, { order: normalizedOrder, firstSeenIndex: index });
    }
  });

  return [...entrySessionMap.entries()]
    .sort((left, right) => {
      if (left[1].order !== right[1].order) {
        return left[1].order - right[1].order;
      }

      const leftCanonicalIndex = PLAN_SESSION_ORDER.indexOf(left[0]);
      const rightCanonicalIndex = PLAN_SESSION_ORDER.indexOf(right[0]);
      if (leftCanonicalIndex !== rightCanonicalIndex) {
        return leftCanonicalIndex - rightCanonicalIndex;
      }

      return left[1].firstSeenIndex - right[1].firstSeenIndex;
    })
    .map(([sessionKey]) => sessionKey);
}

export interface ReadingPlanDaySessionGroup {
  sessionKey: PlanSessionKey;
  title: string;
  entries: ReadingPlanEntry[];
}

export function getDaySessionEntries(
  entries: ReadingPlanEntry[],
  dayNumber: number
): ReadingPlanDaySessionGroup[] {
  const sessionGroups = new Map<PlanSessionKey, ReadingPlanDaySessionGroup>();

  entries.forEach((entry) => {
    if (entry.day_number !== dayNumber || !isPlanSessionKey(entry.session_key)) {
      return;
    }

    const sessionKey = entry.session_key;
    const existing = sessionGroups.get(sessionKey);
    if (existing) {
      existing.entries.push(entry);
      return;
    }

    sessionGroups.set(sessionKey, {
      sessionKey,
      title: entry.session_title?.trim() || capitalizeSessionTitle(sessionKey),
      entries: [entry],
    });
  });

  return [...sessionGroups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(compareSessionEntryOrder),
    }))
    .sort((left, right) => {
      const leftIndex = PLAN_SESSION_ORDER.indexOf(left.sessionKey);
      const rightIndex = PLAN_SESSION_ORDER.indexOf(right.sessionKey);
      return leftIndex - rightIndex;
    });
}

export function buildPlanSessionCompletionKey(
  plan: Pick<ReadingPlan, 'scheduleMode'>,
  dayNumber: number,
  sessionKey: PlanSessionKey,
  today: Date = new Date()
): string {
  return `${getPlanCompletionEntryKey(plan, dayNumber, today)}:${sessionKey}`;
}

function compareSessionEntryOrder(left: ReadingPlanEntry, right: ReadingPlanEntry): number {
  const leftSessionOrder =
    typeof left.session_order === 'number' && Number.isFinite(left.session_order)
      ? left.session_order
      : Number.MAX_SAFE_INTEGER;
  const rightSessionOrder =
    typeof right.session_order === 'number' && Number.isFinite(right.session_order)
      ? right.session_order
      : Number.MAX_SAFE_INTEGER;

  if (leftSessionOrder !== rightSessionOrder) {
    return leftSessionOrder - rightSessionOrder;
  }

  return left.id.localeCompare(right.id);
}

function capitalizeSessionTitle(sessionKey: PlanSessionKey): string {
  return sessionKey.charAt(0).toUpperCase() + sessionKey.slice(1);
}

/**
 * Computes the next current_day after completing dayNumber.
 * Always moves forward: the new current_day is max(current_day, dayNumber + 1).
 */
export function computeNextDay(currentDay: number, dayNumber: number): number {
  return Math.max(currentDay, dayNumber + 1);
}

/**
 * Determines whether all days of a plan have been completed.
 * Returns true when durationDays > 0 and completedCount >= durationDays.
 */
export function isPlanCompleted(durationDays: number, completedCount: number): boolean {
  return durationDays > 0 && completedCount >= durationDays;
}

/**
 * Merges a local UserReadingPlanProgress row with a remote one.
 *
 * Merge rules (mirrors syncPlanProgress in readingPlanService.ts):
 * - completed_entries: union of both (local wins on same key)
 * - current_day: highest of the two
 * - is_completed: true if either side is completed
 * - completed_at: local value when present, otherwise remote
 * - synced_at: caller-supplied timestamp
 *
 * Returns a new object — inputs are not mutated.
 */
export function mergePlanProgress(
  local: UserReadingPlanProgress,
  remote: UserReadingPlanProgress,
  syncedAt: string
): UserReadingPlanProgress {
  const mergedEntries: Record<string, string> = {
    ...remote.completed_entries,
    ...local.completed_entries,
  };
  const mergedCompletedSessions: Record<string, string> = {
    ...(remote.completed_sessions ?? {}),
    ...(local.completed_sessions ?? {}),
  };

  return {
    ...remote,
    completed_entries: mergedEntries,
    completed_sessions: mergedCompletedSessions,
    current_day: Math.max(local.current_day, remote.current_day),
    current_session: local.current_session ?? remote.current_session ?? null,
    is_completed: local.is_completed || remote.is_completed,
    completed_at: local.completed_at ?? remote.completed_at,
    synced_at: syncedAt,
  };
}

export interface ReconcileFetchedPlanProgressResult {
  /** The reconciled progress rows to commit to the store. */
  progress: UserReadingPlanProgress[];
  /** Local-only rows that have no remote counterpart and still need pushing. */
  localOnlyProgress: UserReadingPlanProgress[];
}

/**
 * Reconciles a full remote progress fetch against the local store snapshot.
 *
 * Rules:
 * - matching plan rows are merged so local completion work is not lost
 * - local-only rows are NEVER dropped: they are kept in the reconciled result and
 *   surfaced via `localOnlyProgress` so the caller can push them to the server
 *   (offline-first data-loss guarantee — see H3)
 * - rows the user has unenrolled locally (tombstones) are excluded from the result
 *   so a stale remote row cannot silently re-enroll them (see M12)
 *
 * The `graceMs` parameter is retained for signature compatibility but is no longer
 * used to drop legitimately-old, never-pushed local progress.
 */
export function reconcileFetchedPlanProgress(
  localProgressList: UserReadingPlanProgress[],
  remoteProgressList: UserReadingPlanProgress[],
  fetchedAt: string,
  tombstonedPlanIds: readonly string[] = [],
  _graceMs: number = UNSYNCED_LOCAL_PROGRESS_GRACE_MS
): ReconcileFetchedPlanProgressResult {
  const tombstoned = new Set(tombstonedPlanIds);
  const localByPlanId = new Map(localProgressList.map((progress) => [progress.plan_id, progress]));
  const remoteByPlanId = new Map(
    remoteProgressList.map((progress) => [progress.plan_id, progress])
  );

  const reconciledProgress = remoteProgressList
    .filter((remoteProgress) => !tombstoned.has(remoteProgress.plan_id))
    .map((remoteProgress) => {
      const localProgress = localByPlanId.get(remoteProgress.plan_id);
      return localProgress
        ? mergePlanProgress(localProgress, remoteProgress, fetchedAt)
        : remoteProgress;
    });

  // Never drop local-only progress: keep every local row that lacks a remote
  // counterpart (unless the user tombstoned it) and report it for push.
  const localOnlyProgress = localProgressList.filter(
    (localProgress) =>
      !remoteByPlanId.has(localProgress.plan_id) && !tombstoned.has(localProgress.plan_id)
  );

  const progress = [...reconciledProgress, ...localOnlyProgress].sort((left, right) =>
    right.started_at.localeCompare(left.started_at)
  );

  return { progress, localOnlyProgress };
}

/**
 * Returns a percentage (0–100) representing how far through a plan the user is.
 * Returns 0 when durationDays is 0 or negative.
 */
export function planCompletionPercent(completedCount: number, durationDays: number): number {
  if (durationDays <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((completedCount / durationDays) * 100));
}
