import {
  readingPlanEntriesByPlanId,
  readingPlans,
  readingPlansById,
} from '../../data/readingPlans.generated';
import { readingPlansStore, type ReadingPlansStoreApi } from '../../stores/readingPlansStore';
import {
  buildRemoteReadingPlanProgressPayload,
  buildPlanSessionCompletionKey,
  canSyncReadingPlanRemotely,
  getPlanCompletionEntryKey,
  getDaySessionEntries,
  isEnrolmentEndedBy,
  isRecurringPlan,
  mergePlanProgress,
  normalizeRemoteReadingPlanProgress,
  type RemoteReadingPlanProgressRow,
  reconcileFetchedPlanProgress,
} from './readingPlanModel';
import type {
  GroupReadingPlan,
  PlanSessionKey,
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
  UserSavedPlan,
} from './types';
import {
  createSyncIdentityBoundary,
  isMergeRefusedForAccount,
  STALE_SYNC_ERROR,
  type SyncIdentityBoundary,
} from '../sync/syncIdentity';

export interface PlanServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ReadingPlanService {
  listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>>;
  getPlanEntries(planId: string): Promise<PlanServiceResult<ReadingPlanEntry[]>>;
  enrollInPlan(planId: string): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  markDayComplete(
    planId: string,
    dayNumber: number
  ): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  markPlanSessionComplete(
    planId: string,
    dayNumber: number,
    sessionKey: PlanSessionKey
  ): Promise<PlanServiceResult<UserReadingPlanProgress>>;
  getUserPlanProgress(
    planId?: string,
    expectedUserId?: string,
    expectedGeneration?: number,
    prevalidatedIdentity?: SyncIdentityBoundary
  ): Promise<PlanServiceResult<UserReadingPlanProgress[]>>;
  unenrollFromPlan(planId: string): Promise<PlanServiceResult>;
  assignPlanToGroup(planId: string, groupId: string): Promise<PlanServiceResult<GroupReadingPlan>>;
  getGroupPlans(groupId: string): Promise<PlanServiceResult<GroupReadingPlan[]>>;
  syncPlanProgress(
    localProgress: UserReadingPlanProgress[],
    expectedUserId?: string,
    expectedGeneration?: number
  ): Promise<PlanServiceResult<UserReadingPlanProgress[]>>;
}

const FEATURED_PLAN_IDS = ['bible-in-1-year'];
const TIMED_CHALLENGE_PLAN_IDS = new Set([
  'psalms-30-days',
  'proverbs-31-days',
  'sermon-on-the-mount-7-days',
  'bible-in-30-days',
  'bible-in-90-days',
  'nt-in-30-days',
  'gospels-30-days',
  'acts-28-days',
]);
const PLAN_REMOTE_PROGRESS_TIMEOUT_MS = 1500;
// Server tombstones: when each plan was left (migration 20260924023340).
const PLAN_UNENROLLMENTS_TABLE = 'user_reading_plan_unenrollments';

type SupabaseModule = typeof import('../supabase');

let supabaseModulePromise: Promise<SupabaseModule> | null = null;

async function loadSupabaseModule() {
  if (!supabaseModulePromise) {
    supabaseModulePromise = import('../supabase');
  }

  return supabaseModulePromise;
}

const stalePlanResult = <T = undefined>(): PlanServiceResult<T> => ({
  success: false,
  error: STALE_SYNC_ERROR,
});

const getAuthUserIdSnapshot = (): string | undefined => {
  try {
    const { useAuthStore } =
      require('../../stores/authStore') as typeof import('../../stores/authStore');
    return useAuthStore.getState().user?.uid ?? undefined;
  } catch {
    // Keep local-only plan mutations usable in non-native runtimes where the
    // auth store's native persistence adapter is unavailable.
    return undefined;
  }
};

const getAuthGenerationSnapshot = (): number | undefined => {
  try {
    const { useAuthStore } =
      require('../../stores/authStore') as typeof import('../../stores/authStore');
    return useAuthStore.getState().authGeneration;
  } catch {
    return undefined;
  }
};

const capturePlanSyncIdentity = async (
  expectedUserId: string | undefined,
  action: string,
  expectedGeneration?: number
): Promise<SyncIdentityBoundary | null> => {
  const candidate = expectedUserId ?? getAuthUserIdSnapshot() ?? null;
  if (!candidate) {
    return null;
  }

  const generation = expectedGeneration ?? getAuthGenerationSnapshot();
  const getCurrentGeneration =
    generation === undefined ? undefined : () => getAuthGenerationSnapshot() ?? -1;

  if (getAuthUserIdSnapshot() !== candidate) {
    return null;
  }

  const { user } = await requireSignedInUser(action);
  if (getAuthUserIdSnapshot() !== candidate || user?.id !== candidate) {
    return null;
  }

  const boundary = createSyncIdentityBoundary(
    candidate,
    () => getAuthUserIdSnapshot() ?? null,
    generation,
    getCurrentGeneration
  );

  return (await boundary.isCurrent()) ? boundary : null;
};

/**
 * Reuses a cycle's opaque identity capability, or performs the standalone
 * remote validation supplied by the caller. The expected uid/generation check
 * keeps a capability from being applied to a different request boundary.
 */
export const resolvePlanSyncIdentity = async (
  expectedUserId: string | undefined,
  expectedGeneration: number | undefined,
  prevalidatedIdentity: SyncIdentityBoundary | undefined,
  captureIdentity: () => Promise<SyncIdentityBoundary | null>
): Promise<SyncIdentityBoundary | null> => {
  const identity = prevalidatedIdentity ?? (await captureIdentity());
  if (!identity) {
    return null;
  }

  if (
    identity.expectedUserId !== expectedUserId ||
    identity.expectedGeneration !== expectedGeneration
  ) {
    return null;
  }

  return identity;
};

function getPlan(planId: string): ReadingPlan | undefined {
  return readingPlansById.get(planId);
}

function getSortedPlans(): ReadingPlan[] {
  return [...readingPlans].sort((left, right) => left.sort_order - right.sort_order);
}

function shouldSyncPlanProgressRemotely(planId?: string): boolean {
  return planId ? canSyncReadingPlanRemotely(planId) : true;
}

function normalizeRemoteProgressRows(
  progressList: RemoteReadingPlanProgressRow[]
): UserReadingPlanProgress[] {
  return progressList
    .map((progress) => normalizeRemoteReadingPlanProgress(progress))
    .filter((progress): progress is UserReadingPlanProgress => progress !== null);
}

function getLocalProgressList(
  store: ReadingPlansStoreApi,
  planId?: string
): UserReadingPlanProgress[] {
  const allProgress = Object.values(store.getState().progressByPlanId);
  const filtered = planId
    ? allProgress.filter((progress) => progress.plan_id === planId)
    : allProgress;

  return [...filtered].sort((left, right) => right.started_at.localeCompare(left.started_at));
}

function buildLocalSavedPlan(planId: string): UserSavedPlan {
  return {
    id: `saved-${planId}`,
    user_id: 'local-user',
    plan_id: planId,
    saved_at: new Date().toISOString(),
  };
}

async function requireSignedInUser(
  action: string
): Promise<{ user: { id: string }; error: null } | { user: null; error: string }> {
  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();

  if (!isSupabaseConfigured()) {
    return { user: null, error: `Backend is not configured — cannot ${action}` };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { user: null, error: authError.message };
  }

  if (!user) {
    return { user: null, error: `You must be signed in to ${action}` };
  }

  return { user: { id: user.id }, error: null };
}

export function createReadingPlanService(store: ReadingPlansStoreApi): ReadingPlanService {
  return {
    listReadingPlans: async () => ({
      success: true,
      data: getSortedPlans(),
    }),

    getPlanEntries: async (planId: string) => ({
      success: true,
      data: readingPlanEntriesByPlanId[planId] ?? [],
    }),

    enrollInPlan: async (planId: string) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { success: false, error: 'Plan not found' };
      }

      return {
        success: true,
        data: store.getState().enrollPlan(planId),
      };
    },

    markDayComplete: async (planId: string, dayNumber: number) => {
      const plan = getPlan(planId);
      const updated = !plan
        ? null
        : isRecurringPlan(plan)
          ? store
              .getState()
              .markRecurringDayComplete(
                planId,
                getPlanCompletionEntryKey(plan, dayNumber),
                dayNumber
              )
          : store.getState().markDayComplete(planId, dayNumber, plan.duration_days);

      if (!updated) {
        return { success: false, error: 'Not enrolled in this plan' };
      }

      return { success: true, data: updated };
    },

    markPlanSessionComplete: async (
      planId: string,
      dayNumber: number,
      sessionKey: PlanSessionKey
    ) => {
      const plan = getPlan(planId);
      if (!plan) {
        return { success: false, error: 'Plan not found' };
      }

      const sessionGroups = getDaySessionEntries(
        readingPlanEntriesByPlanId[planId] ?? [],
        dayNumber
      );
      const sessionIndex = sessionGroups.findIndex((group) => group.sessionKey === sessionKey);
      if (sessionIndex < 0) {
        return { success: false, error: 'Plan session not found' };
      }

      const completedSessions = store.getState().getProgress(planId)?.completed_sessions ?? {};
      const nextSessionKey =
        sessionGroups.find(
          (group) =>
            group.sessionKey !== sessionKey &&
            !completedSessions[buildPlanSessionCompletionKey(plan, dayNumber, group.sessionKey)]
        )?.sessionKey ?? null;
      const updated = store.getState().markSessionComplete(planId, dayNumber, sessionKey, {
        completionKey: buildPlanSessionCompletionKey(plan, dayNumber, sessionKey),
        dayCompletionKey: getPlanCompletionEntryKey(plan, dayNumber),
        totalDays: plan.duration_days,
        isFinalSession: nextSessionKey == null,
        advanceDayOnCompletion: !isRecurringPlan(plan),
        nextSessionKey,
      });

      if (!updated) {
        return { success: false, error: 'Not enrolled in this plan' };
      }

      return { success: true, data: updated };
    },

    getUserPlanProgress: async (planId?: string) => ({
      success: true,
      data: getLocalProgressList(store, planId),
    }),

    unenrollFromPlan: async (planId: string) => {
      store.getState().unenrollPlan(planId);
      return { success: true };
    },

    assignPlanToGroup: async (planId: string, groupId: string) => ({
      success: true,
      data: store.getState().assignGroupPlan(groupId, planId),
    }),

    getGroupPlans: async (groupId: string) => ({
      success: true,
      data: store.getState().getGroupPlans(groupId),
    }),

    syncPlanProgress: async (localProgress: UserReadingPlanProgress[]) => {
      localProgress.forEach((progress) => {
        store.getState().upsertProgress(progress);
      });

      return { success: true, data: localProgress };
    },
  };
}

export async function listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return { success: true, data: getSortedPlans() };
}

export async function getPlanEntries(
  planId: string
): Promise<PlanServiceResult<ReadingPlanEntry[]>> {
  return { success: true, data: readingPlanEntriesByPlanId[planId] ?? [] };
}

/**
 * Folds a server row into the live store. A server row reflects the moment it was
 * written (and, before migration 20260924023342, carries no session ticks), so
 * replacing the live row would drop completed sessions and any completion made
 * while a request was in flight. A plan that is no longer enrolled (or is waiting on its remote
 * delete) is not revived by a late row.
 */
function mergeServerRowIntoLive(serverRow: UserReadingPlanProgress): void {
  const store = readingPlansStore.getState();
  if (store.pendingUnenrollPlanIds.includes(serverRow.plan_id)) {
    return;
  }

  const live = store.getProgress(serverRow.plan_id);
  if (!live) {
    return;
  }

  store.upsertProgress(mergePlanProgress(live, serverRow, serverRow.synced_at));
}

/**
 * Applies a caller-supplied progress row. syncAll hands over a snapshot captured
 * before its network awaits, so a row already in the store is merged (never
 * overwritten) to keep anything completed since the snapshot was taken.
 */
function applyLocalSnapshotRow(snapshotRow: UserReadingPlanProgress): void {
  const store = readingPlansStore.getState();
  const live = store.getProgress(snapshotRow.plan_id);
  store.upsertProgress(live ? mergePlanProgress(live, snapshotRow, live.synced_at) : snapshotRow);
}

/**
 * PostgREST (PGRST205) or Postgres (42P01) reporting that a table does not exist:
 * the app shipped before migration 20260924023340 was applied.
 */
const isMissingTableError = (error: { code?: string } | null | undefined): boolean =>
  error?.code === 'PGRST205' || error?.code === '42P01';

interface RemotePlanUnenrollmentRow {
  plan_slug: string;
  unenrolled_at: string;
}

/**
 * The account's plan tombstones (plan id -> when it was left), or null when they
 * cannot be read (offline, or no tombstone table yet). A null answer only means
 * a leave made elsewhere is noticed on a later sync; the server still refuses
 * to resurrect the plan.
 */
async function fetchPlanUnenrollments(
  supabase: SupabaseModule['supabase'],
  identity: SyncIdentityBoundary,
  planIds?: string[]
): Promise<Map<string, string> | null> {
  try {
    let query = supabase
      .from(PLAN_UNENROLLMENTS_TABLE)
      .select('plan_slug, unenrolled_at')
      .eq('user_id', identity.expectedUserId);
    if (planIds) {
      query = query.in('plan_slug', planIds);
    }
    const { data, error } = await query;
    if (error) {
      return null;
    }
    return new Map(
      ((data ?? []) as RemotePlanUnenrollmentRow[])
        .filter((row) => typeof row.plan_slug === 'string' && typeof row.unenrolled_at === 'string')
        .map((row) => [row.plan_slug, row.unenrolled_at])
    );
  } catch {
    return null;
  }
}

/** The local rows a server tombstone has ended (they started before the leave). */
function getProgressEndedElsewhere(
  progressList: UserReadingPlanProgress[],
  unenrollments: Map<string, string> | null
): Set<string> {
  return new Set(
    progressList
      .filter((progress) => {
        const unenrolledAt = unenrollments?.get(progress.plan_id);
        return unenrolledAt !== undefined && isEnrolmentEndedBy(progress, unenrolledAt);
      })
      .map((progress) => progress.plan_id)
  );
}

/**
 * Removes live enrolments that were left on another device. Re-reads the live row,
 * so a re-join made while the tombstones were in flight is kept. Call inside the
 * identity boundary.
 */
function endPlansLeftElsewhere(unenrollments: Map<string, string> | null): void {
  if (!unenrollments) {
    return;
  }
  const store = readingPlansStore.getState();
  getProgressEndedElsewhere(Object.values(store.progressByPlanId), unenrollments).forEach(
    (planId) => store.endPlanLeftElsewhere(planId)
  );
}

type PreWriteMerge =
  | {
      outcome: 'merged';
      /**
       * Whether the server has the session-tick columns, read off the fetched
       * rows (select('*') returns every column); null when no row came back.
       */
      sessionColumns: boolean | null;
    }
  | { outcome: 'unreadable' | 'stale' };

/**
 * Reads the account's server rows for these plans and folds them into the live
 * store before a push. The upsert replaces the server row, so pushing without
 * this read would overwrite days completed on another device (or the account's
 * existing progress when a second device enrols). When the rows cannot be read
 * the caller must skip the push rather than write blind.
 */
async function mergeServerRowsBeforePush(
  supabase: SupabaseModule['supabase'],
  identity: SyncIdentityBoundary,
  planIds: string[]
): Promise<PreWriteMerge> {
  const failed = async (): Promise<PreWriteMerge> => ({
    outcome: (await identity.isCurrent()) ? 'unreadable' : 'stale',
  });
  try {
    const [{ data, error }, unenrollments] = await Promise.all([
      supabase
        .from('user_reading_plan_progress')
        .select('*')
        .eq('user_id', identity.expectedUserId)
        .in('plan_slug', planIds),
      fetchPlanUnenrollments(supabase, identity, planIds),
    ]);

    if (error) {
      return failed();
    }

    const rawRows = (data ?? []) as RemoteReadingPlanProgressRow[];
    const serverRows = normalizeRemoteProgressRows(rawRows);
    const merged = await identity.runIfCurrent(() => {
      // A plan left elsewhere is dropped first, so it is neither merged nor pushed.
      endPlansLeftElsewhere(unenrollments);
      serverRows.forEach(mergeServerRowIntoLive);
    });
    return merged.applied
      ? {
          outcome: 'merged',
          sessionColumns: rawRows.length > 0 ? 'completed_sessions' in rawRows[0] : null,
        }
      : { outcome: 'stale' };
  } catch {
    return failed();
  }
}

/**
 * PostgREST (PGRST204) or Postgres (42703) refusing a payload column: the app
 * shipped before migration 20260924023342 added the session-tick columns.
 */
const isMissingSessionColumnError = (
  error: { code?: string; message?: string } | null | undefined
): boolean =>
  Boolean(
    error &&
    (error.code === 'PGRST204' || error.code === '42703') &&
    /completed_sessions|current_session/.test(error.message ?? '')
  );

type LivePlanUpsert =
  | { status: 'stale' }
  | { status: 'nothing' }
  | { status: 'done'; data: unknown; error: { code?: string; message?: string } | null };

const PLAN_PROGRESS_MERGE_RPC = 'merge_reading_plan_progress';

/**
 * PostgREST (PGRST202, HTTP 404) or Postgres (42883) reporting that the merge
 * function does not exist: the app shipped before migration 20260924035821.
 */
const isMissingMergeRpcError = (
  error: { code?: string } | null | undefined,
  httpStatus: number | undefined
): boolean =>
  Boolean(error) && (error?.code === 'PGRST202' || error?.code === '42883' || httpStatus === 404);

/**
 * Sends the live rows to merge_reading_plan_progress, which unions them into the
 * stored rows in one statement. The read-merge-upsert path lets two phones that
 * read the same row each overwrite the other's newest days (finding 12); the
 * server-side merge cannot. Returns null when the server has no such function.
 */
async function mergeLivePlanProgressOnServer(
  supabase: SupabaseModule['supabase'],
  identity: SyncIdentityBoundary,
  planIds: string[],
  single: boolean
): Promise<LivePlanUpsert | null> {
  const write = await identity.runIfCurrent(() => {
    const rows = getLivePushableProgress(planIds).map((progress) =>
      buildRemoteReadingPlanProgressPayload(progress, identity.expectedUserId, true)
    );
    if (rows.length === 0) {
      return null;
    }
    const query = supabase.rpc(PLAN_PROGRESS_MERGE_RPC, { p_rows: rows });
    return single ? query.single() : query;
  });
  if (!write.applied) {
    return { status: 'stale' };
  }
  if (!write.value) {
    return { status: 'nothing' };
  }
  const { data, error, status } = await write.value;
  if (isMergeRefusedForAccount(error)) {
    return { status: 'stale' };
  }
  return isMissingMergeRpcError(error, status) ? null : { status: 'done', data, error };
}

/**
 * Writes the live rows for these plans: through the server-side merge when the
 * server has it, otherwise with the upsert. Upserted session ticks go along
 * unless the server is known to lack their columns; when it turns out to lack
 * them the write is retried without, so a release that beats its migration
 * still syncs.
 */
async function upsertLivePlanProgress(
  supabase: SupabaseModule['supabase'],
  identity: SyncIdentityBoundary,
  planIds: string[],
  sessionColumns: boolean | null,
  single: boolean
): Promise<LivePlanUpsert> {
  // The merge function needs the session columns (it ships after them), so a
  // server known to lack them cannot have it either.
  if (sessionColumns !== false) {
    const merged = await mergeLivePlanProgressOnServer(supabase, identity, planIds, single);
    if (merged) {
      return merged;
    }
  }

  const attempt = async (withSessions: boolean): Promise<LivePlanUpsert> => {
    const write = await identity.runIfCurrent(() => {
      const rows = getLivePushableProgress(planIds).map((progress) =>
        buildRemoteReadingPlanProgressPayload(progress, identity.expectedUserId, withSessions)
      );
      if (rows.length === 0) {
        return null;
      }
      const query = supabase
        .from('user_reading_plan_progress')
        .upsert(single ? rows[0] : rows, { onConflict: 'user_id,plan_slug' })
        .select('*');
      return single ? query.single() : query;
    });
    if (!write.applied) {
      return { status: 'stale' };
    }
    if (!write.value) {
      return { status: 'nothing' };
    }
    const { data, error } = await write.value;
    return { status: 'done', data, error };
  };

  const withSessions = sessionColumns !== false;
  const first = await attempt(withSessions);
  return withSessions && first.status === 'done' && isMissingSessionColumnError(first.error)
    ? attempt(false)
    : first;
}

/** The live, still-enrolled rows for these plans, read at the moment of the push. */
function getLivePushableProgress(planIds: string[]): UserReadingPlanProgress[] {
  const store = readingPlansStore.getState();
  const tombstoned = new Set(store.pendingUnenrollPlanIds);
  return planIds
    .filter((planId) => !tombstoned.has(planId))
    .map((planId) => store.getProgress(planId))
    .filter((progress): progress is UserReadingPlanProgress => progress !== null);
}

async function pushProgressToRemote(
  progress: UserReadingPlanProgress,
  expectedUserId?: string,
  expectedGeneration: number | undefined = getAuthGenerationSnapshot()
): Promise<void> {
  try {
    let identity: SyncIdentityBoundary | null = null;
    const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
    if (!isSupabaseConfigured()) {
      return;
    }

    identity = await capturePlanSyncIdentity(
      expectedUserId,
      'sync reading plan progress',
      expectedGeneration
    );
    if (!identity) {
      return;
    }

    const preWrite = await mergeServerRowsBeforePush(supabase, identity, [progress.plan_id]);
    if (preWrite.outcome !== 'merged') {
      return;
    }

    const write = await upsertLivePlanProgress(
      supabase,
      identity,
      [progress.plan_id],
      preWrite.sessionColumns,
      true
    );
    if (write.status !== 'done' || write.error) {
      return;
    }
    const { data } = write;

    const syncedProgress = normalizeRemoteReadingPlanProgress(data as RemoteReadingPlanProgressRow);
    if (syncedProgress) {
      await identity.runIfCurrent(() => {
        mergeServerRowIntoLive(syncedProgress);
      });
    }
  } catch {
    // Offline-first: swallow — the row stays local and is retried by the next sync.
  }
}

export async function enrollInPlan(
  planId: string
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  // L20: land the local mutation and return synchronously so navigation is never
  // blocked on the (un-timed) network round-trip; push in the background.
  const localProgress = readingPlansStore.getState().enrollPlan(planId);
  void pushProgressToRemote(localProgress, getAuthUserIdSnapshot(), getAuthGenerationSnapshot());

  return { success: true, data: localProgress };
}

export async function markDayComplete(
  planId: string,
  dayNumber: number
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const localUpdated = isRecurringPlan(plan)
    ? readingPlansStore
        .getState()
        .markRecurringDayComplete(planId, getPlanCompletionEntryKey(plan, dayNumber), dayNumber)
    : readingPlansStore.getState().markDayComplete(planId, dayNumber, plan.duration_days);

  if (!localUpdated) {
    return { success: false, error: 'Not enrolled in this plan' };
  }

  // L20: return after the local mutation; push in the background so a slow/flaky
  // network can never freeze the tap or block navigation.
  void pushProgressToRemote(localUpdated, getAuthUserIdSnapshot(), getAuthGenerationSnapshot());

  return { success: true, data: localUpdated };
}

export async function markPlanSessionComplete(
  planId: string,
  dayNumber: number,
  sessionKey: PlanSessionKey
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const sessionGroups = getDaySessionEntries(readingPlanEntriesByPlanId[planId] ?? [], dayNumber);
  const sessionIndex = sessionGroups.findIndex((group) => group.sessionKey === sessionKey);
  if (sessionIndex < 0) {
    return { success: false, error: 'Plan session not found' };
  }

  const completedSessions =
    readingPlansStore.getState().getProgress(planId)?.completed_sessions ?? {};
  const nextSessionKey =
    sessionGroups.find(
      (group) =>
        group.sessionKey !== sessionKey &&
        !completedSessions[buildPlanSessionCompletionKey(plan, dayNumber, group.sessionKey)]
    )?.sessionKey ?? null;
  const localUpdated = readingPlansStore
    .getState()
    .markSessionComplete(planId, dayNumber, sessionKey, {
      completionKey: buildPlanSessionCompletionKey(plan, dayNumber, sessionKey),
      dayCompletionKey: getPlanCompletionEntryKey(plan, dayNumber),
      totalDays: plan.duration_days,
      isFinalSession: nextSessionKey == null,
      advanceDayOnCompletion: !isRecurringPlan(plan),
      nextSessionKey,
    });

  if (!localUpdated) {
    return { success: false, error: 'Not enrolled in this plan' };
  }

  // Session ticks follow the account (migration 20260924023342); like a day
  // completion, the push runs in the background after the local write.
  void pushProgressToRemote(localUpdated, getAuthUserIdSnapshot(), getAuthGenerationSnapshot());

  return { success: true, data: localUpdated };
}

/**
 * Commits a reconciled full-fetch result to the live store without dropping any
 * concurrent local mutation.
 *
 * L19: `replaceProgress` wholesale-replaces against a stale snapshot, so a
 * completion made *during* the fetch is lost. Instead we re-read the live store
 * at commit time and merge per-plan (remote/reconciled row merged with whatever
 * the live store now holds), then drop any tombstoned plans.
 *
 * H3: local-only rows are upserted (never dropped) and returned for a follow-up push.
 */
function commitReconciledProgress(reconciled: UserReadingPlanProgress[], fetchedAt: string): void {
  const store = readingPlansStore.getState();
  const tombstoned = new Set(store.pendingUnenrollPlanIds);

  reconciled.forEach((progress) => {
    if (tombstoned.has(progress.plan_id)) {
      return;
    }

    const live = store.getProgress(progress.plan_id);
    const merged = live ? mergePlanProgress(live, progress, fetchedAt) : progress;
    store.upsertProgress(merged);
  });
}

export async function getUserPlanProgress(
  planId?: string,
  expectedUserId?: string,
  expectedGeneration?: number,
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  const capturedUserId = expectedUserId ?? getAuthUserIdSnapshot();
  const capturedGeneration = expectedGeneration ?? getAuthGenerationSnapshot();
  const localProgress = getLocalProgressList(readingPlansStore, planId);
  const localFallback = { success: true, data: localProgress } satisfies PlanServiceResult<
    UserReadingPlanProgress[]
  >;

  // L19: track whether the timeout fallback already returned. If it has, the
  // in-flight fetch must NOT commit its (now stale) snapshot to the store.
  let fallbackWon = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const remoteFetch = (async (): Promise<PlanServiceResult<UserReadingPlanProgress[]>> => {
    const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
    if (!isSupabaseConfigured()) {
      return localFallback;
    }

    // An omitted expected uid is captured synchronously above. If there was no
    // authenticated uid at entry, do not bind this snapshot to whichever
    // account appears after dependency loading yields.
    if (!capturedUserId) {
      return localFallback;
    }

    const identity = await resolvePlanSyncIdentity(
      capturedUserId,
      capturedGeneration,
      prevalidatedIdentity,
      () =>
        capturePlanSyncIdentity(capturedUserId, 'fetch reading plan progress', capturedGeneration)
    );
    if (!identity) {
      return stalePlanResult<UserReadingPlanProgress[]>();
    }

    try {
      let query = supabase
        .from('user_reading_plan_progress')
        .select('*')
        .eq('user_id', identity.expectedUserId);

      if (planId) {
        query = query.eq('plan_slug', planId);
      }

      const [{ data, error }, unenrollments] = await Promise.all([
        query.order('started_at', { ascending: false }),
        fetchPlanUnenrollments(supabase, identity, planId ? [planId] : undefined),
      ]);

      if (error) {
        return (await identity.isCurrent())
          ? localFallback
          : stalePlanResult<UserReadingPlanProgress[]>();
      }

      if (!(await identity.isCurrent())) {
        return stalePlanResult<UserReadingPlanProgress[]>();
      }

      const remoteProgress = normalizeRemoteProgressRows(
        ((data ?? []) as RemoteReadingPlanProgressRow[]).filter((progress) =>
          shouldSyncPlanProgressRemotely(progress.plan_slug ?? progress.plan_id ?? undefined)
        )
      );

      // L19: if the fallback already won, do not clobber the live store.
      if (fallbackWon) {
        return (await identity.isCurrent())
          ? localFallback
          : stalePlanResult<UserReadingPlanProgress[]>();
      }

      const fetchedAt = new Date().toISOString();
      const tombstonedPlanIds = readingPlansStore.getState().pendingUnenrollPlanIds;
      // Local enrolments left on another device are neither kept nor pushed as
      // local-only; a server row for the same plan is a later re-join and is adopted.
      const endedElsewhere = getProgressEndedElsewhere(localProgress, unenrollments);
      const stillEnrolled = localProgress.filter(
        (progress) => !endedElsewhere.has(progress.plan_id)
      );

      if (remoteProgress.length === 0) {
        const dropped = await identity.runIfCurrent(() => {
          endPlansLeftElsewhere(unenrollments);
        });
        return dropped.applied
          ? { success: true, data: stillEnrolled }
          : stalePlanResult<UserReadingPlanProgress[]>();
      }

      // H3: reconcile without dropping local-only rows.
      const { progress: reconciledProgress, localOnlyProgress } = reconcileFetchedPlanProgress(
        stillEnrolled,
        remoteProgress,
        fetchedAt,
        tombstonedPlanIds
      );

      // L19: commit via a live-store re-read + per-plan merge (never wholesale replace).
      const committed = await identity.runIfCurrent(() => {
        endPlansLeftElsewhere(unenrollments);
        commitReconciledProgress(reconciledProgress, fetchedAt);
      });
      if (!committed.applied) {
        return stalePlanResult<UserReadingPlanProgress[]>();
      }

      // H3: push local-only rows that lack a remote counterpart so they are durably synced.
      localOnlyProgress.forEach((progress) => {
        void pushProgressToRemote(progress, identity.expectedUserId, identity.expectedGeneration);
      });

      return { success: true, data: reconciledProgress };
    } catch {
      return identity && !(await identity.isCurrent())
        ? stalePlanResult<UserReadingPlanProgress[]>()
        : localFallback;
    }
  })();

  return Promise.race([
    remoteFetch,
    new Promise<PlanServiceResult<UserReadingPlanProgress[]>>((resolve) => {
      timeoutId = setTimeout(() => {
        fallbackWon = true;
        const authBoundaryStale =
          (capturedUserId !== undefined && getAuthUserIdSnapshot() !== capturedUserId) ||
          (capturedGeneration !== undefined && getAuthGenerationSnapshot() !== capturedGeneration);
        resolve(authBoundaryStale ? stalePlanResult<UserReadingPlanProgress[]>() : localFallback);
      }, PLAN_REMOTE_PROGRESS_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Attempts the remote delete for an unenrolled plan and clears its tombstone on
 * confirmed success. Returns false when the delete could not be confirmed (offline,
 * RLS, network) so the tombstone survives and syncReadingPlans can retry (M12).
 */
async function deleteRemotePlanProgress(
  planId: string,
  expectedUserId?: string,
  expectedGeneration: number | undefined = getAuthGenerationSnapshot(),
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<boolean> {
  try {
    const { supabase, isSupabaseConfigured } = await loadSupabaseModule();

    // No backend/user means there is nothing to delete server-side; the local
    // tombstone is enough and can be cleared.
    if (!isSupabaseConfigured()) {
      if (
        (expectedUserId && getAuthUserIdSnapshot() !== expectedUserId) ||
        (expectedGeneration !== undefined && getAuthGenerationSnapshot() !== expectedGeneration)
      ) {
        return false;
      }

      if (prevalidatedIdentity) {
        if (
          (expectedUserId !== undefined &&
            prevalidatedIdentity.expectedUserId !== expectedUserId) ||
          (expectedGeneration !== undefined &&
            prevalidatedIdentity.expectedGeneration !== expectedGeneration)
        ) {
          return false;
        }
        const cleared = await prevalidatedIdentity.runIfCurrent(() => {
          readingPlansStore.getState().clearPendingUnenroll(planId);
        });
        return cleared.applied;
      }

      readingPlansStore.getState().clearPendingUnenroll(planId);
      return true;
    }

    const identity =
      prevalidatedIdentity ??
      (await capturePlanSyncIdentity(
        expectedUserId,
        'unenroll from a reading plan',
        expectedGeneration
      ));
    if (!identity) {
      return false;
    }

    if (
      (expectedUserId !== undefined && identity.expectedUserId !== expectedUserId) ||
      (expectedGeneration !== undefined && identity.expectedGeneration !== expectedGeneration)
    ) {
      return false;
    }

    // Record the leave as a server tombstone; the server then deletes the ended
    // enrolment and refuses any device that pushes it back (finding 9).
    const unenrolledAt = readingPlansStore.getState().pendingUnenrollAtByPlanId[planId];
    const tombstone = await identity.runIfCurrent(() =>
      supabase.from(PLAN_UNENROLLMENTS_TABLE).upsert(
        {
          user_id: identity.expectedUserId,
          plan_slug: planId,
          ...(unenrolledAt ? { unenrolled_at: unenrolledAt } : {}),
        },
        { onConflict: 'user_id,plan_slug' }
      )
    );
    if (!tombstone.applied) {
      return false;
    }

    let { error } = await tombstone.value!;

    if (isMissingTableError(error)) {
      // No tombstone table yet (migration not applied): the pre-tombstone delete.
      const deletion = await identity.runIfCurrent(() =>
        supabase
          .from('user_reading_plan_progress')
          .delete()
          .eq('user_id', identity.expectedUserId)
          .eq('plan_slug', planId)
      );
      if (!deletion.applied) {
        return false;
      }
      ({ error } = await deletion.value!);
    }

    if (error) {
      return false;
    }

    const cleared = await identity.runIfCurrent(() => {
      readingPlansStore.getState().clearPendingUnenroll(planId);
    });
    return cleared.applied;
  } catch {
    return false;
  }
}

export async function unenrollFromPlan(planId: string): Promise<PlanServiceResult> {
  // Records a pending-unenroll tombstone (see readingPlansStore.unenrollPlan) so a
  // stale remote row cannot re-enroll the user before the remote delete confirms.
  const expectedUserId = getAuthUserIdSnapshot();
  const expectedGeneration = getAuthGenerationSnapshot();
  readingPlansStore.getState().unenrollPlan(planId);

  // Guest progress is local-only. Consume its tombstone immediately instead of
  // allowing a later authenticated session to interpret it as that account's
  // remote delete.
  if (!expectedUserId) {
    readingPlansStore.getState().clearPendingUnenroll(planId);
    return { success: true };
  }

  // M12: do NOT swallow the delete failure as success — an unconfirmed delete
  // leaves the tombstone in place for syncReadingPlans to retry.
  const deleted = await deleteRemotePlanProgress(planId, expectedUserId, expectedGeneration);

  return deleted
    ? { success: true }
    : { success: false, error: 'Unable to confirm leaving this plan; it will retry on next sync' };
}

export async function assignPlanToGroup(
  planId: string,
  groupId: string
): Promise<PlanServiceResult<GroupReadingPlan>> {
  const localGroupPlan = readingPlansStore.getState().assignGroupPlan(groupId, planId);
  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
  const { user } = await requireSignedInUser('assign a plan to a group');

  if (!isSupabaseConfigured() || !user) {
    return { success: true, data: localGroupPlan };
  }

  try {
    const { data, error } = await supabase
      .from('group_reading_plans')
      .insert({
        group_id: groupId,
        plan_id: planId,
        assigned_by: user.id,
        started_at: localGroupPlan.started_at,
      })
      .select('*')
      .single();

    if (error) {
      return { success: true, data: localGroupPlan };
    }

    return { success: true, data: data as GroupReadingPlan };
  } catch {
    return { success: true, data: localGroupPlan };
  }
}

export async function getGroupPlans(
  groupId: string
): Promise<PlanServiceResult<GroupReadingPlan[]>> {
  const localGroupPlans = readingPlansStore.getState().getGroupPlans(groupId);
  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();

  if (!isSupabaseConfigured()) {
    return { success: true, data: localGroupPlans };
  }

  try {
    const { data, error } = await supabase
      .from('group_reading_plans')
      .select('*')
      .eq('group_id', groupId)
      .order('started_at', { ascending: false });

    if (error) {
      return { success: true, data: localGroupPlans };
    }

    return { success: true, data: ((data ?? []) as GroupReadingPlan[]).concat(localGroupPlans) };
  } catch {
    return { success: true, data: localGroupPlans };
  }
}

/**
 * Retries the remote delete for every plan the user unenrolled while the delete
 * could not be confirmed. Clears each tombstone on success (M12).
 */
async function retryPendingUnenrolls(
  expectedUserId?: string,
  expectedGeneration?: number,
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<void> {
  const pending = readingPlansStore.getState().pendingUnenrollPlanIds;
  if (pending.length === 0) {
    return;
  }

  if (!prevalidatedIdentity) {
    await Promise.all(
      pending.map((planId) => deleteRemotePlanProgress(planId, expectedUserId, expectedGeneration))
    );
    return;
  }

  await retryPlanTombstonesWithIdentity(pending, prevalidatedIdentity, (planId, identity) =>
    deleteRemotePlanProgress(planId, identity.expectedUserId, identity.expectedGeneration, identity)
  );
}

/**
 * Runs pending tombstone deletes with one already-captured identity capability.
 * Keeping this seam injectable makes it explicit that N tombstones do not each
 * perform another remote auth lookup.
 */
export const retryPlanTombstonesWithIdentity = async (
  planIds: string[],
  identity: SyncIdentityBoundary,
  deletePlan: (planId: string, identity: SyncIdentityBoundary) => Promise<boolean>
): Promise<boolean[]> => Promise.all(planIds.map((planId) => deletePlan(planId, identity)));

export async function syncPlanProgress(
  localProgress: UserReadingPlanProgress[],
  expectedUserId?: string,
  expectedGeneration?: number,
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  const entryAuthUserId = getAuthUserIdSnapshot();
  const capturedUserId = expectedUserId ?? getAuthUserIdSnapshot();
  const capturedGeneration = expectedGeneration ?? getAuthGenerationSnapshot();
  const supabaseModule = await loadSupabaseModule().catch(() => null);

  const applyLocalProgress = (): void => {
    localProgress.forEach(applyLocalSnapshotRow);
  };

  const entryBoundaryIsCurrent = (): boolean => {
    const liveUserId = getAuthUserIdSnapshot();
    const expectedUidStartedFromGuest =
      expectedUserId !== undefined && entryAuthUserId === undefined;
    const userMatches =
      liveUserId === capturedUserId || (expectedUidStartedFromGuest && liveUserId === undefined);
    return userMatches && getAuthGenerationSnapshot() === capturedGeneration;
  };

  if (!supabaseModule || !supabaseModule.isSupabaseConfigured() || !capturedUserId) {
    if (!entryBoundaryIsCurrent()) {
      return stalePlanResult<UserReadingPlanProgress[]>();
    }

    if (prevalidatedIdentity) {
      const applied = await prevalidatedIdentity.runIfCurrent(applyLocalProgress);
      return applied.applied
        ? { success: true, data: localProgress }
        : stalePlanResult<UserReadingPlanProgress[]>();
    }

    applyLocalProgress();
    return { success: true, data: localProgress };
  }

  if (!entryBoundaryIsCurrent()) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  const identity =
    prevalidatedIdentity ??
    (await capturePlanSyncIdentity(
      capturedUserId,
      'sync reading plan progress',
      capturedGeneration
    ));
  if (!identity) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  if (
    identity.expectedUserId !== capturedUserId ||
    identity.expectedGeneration !== capturedGeneration
  ) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  // M12: retry any unconfirmed remote unenroll deletes before pushing progress,
  // so a tombstoned plan is never resurrected by a subsequent fetch.
  const { pendingUnenrollPlanIds: pendingBefore, pendingUnenrollAtByPlanId: leftAtBefore } =
    readingPlansStore.getState();
  await retryPendingUnenrolls(identity.expectedUserId, identity.expectedGeneration, identity);

  if (!(await identity.isCurrent())) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  const tombstoned = new Set(readingPlansStore.getState().pendingUnenrollPlanIds);
  // A leave confirmed just now: the snapshot may predate it, and its row for that
  // enrolment must not be applied or pushed back.
  const confirmedLeaves = new Set(pendingBefore.filter((planId) => !tombstoned.has(planId)));
  const isEndedSnapshotRow = (progress: UserReadingPlanProgress): boolean => {
    if (!confirmedLeaves.has(progress.plan_id)) {
      return false;
    }
    const leftAt = leftAtBefore[progress.plan_id];
    return leftAt === undefined || isEnrolmentEndedBy(progress, leftAt);
  };
  localProgress = localProgress.filter((progress) => !isEndedSnapshotRow(progress));

  const localApplied = await identity.runIfCurrent(() => {
    localProgress
      .filter((progress) => !tombstoned.has(progress.plan_id))
      .forEach(applyLocalSnapshotRow);
  });
  if (!localApplied.applied) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  const remoteSyncablePlanIds = [
    ...new Set(
      localProgress
        .filter(
          (progress) =>
            shouldSyncPlanProgressRemotely(progress.plan_id) && !tombstoned.has(progress.plan_id)
        )
        .map((progress) => progress.plan_id)
    ),
  ];

  if (remoteSyncablePlanIds.length === 0) {
    return (await identity.isCurrent())
      ? { success: true, data: localProgress }
      : stalePlanResult<UserReadingPlanProgress[]>();
  }

  const { supabase } = supabaseModule;

  try {
    const preWrite = await mergeServerRowsBeforePush(supabase, identity, remoteSyncablePlanIds);
    if (preWrite.outcome !== 'merged') {
      return preWrite.outcome === 'stale'
        ? stalePlanResult<UserReadingPlanProgress[]>()
        : { success: true, data: localProgress };
    }

    // Push the live rows, not the snapshot the cycle captured before its awaits:
    // they now hold local ∪ server plus anything completed while this sync ran.
    const write = await upsertLivePlanProgress(
      supabase,
      identity,
      remoteSyncablePlanIds,
      preWrite.sessionColumns,
      false
    );
    if (write.status === 'stale') {
      return stalePlanResult<UserReadingPlanProgress[]>();
    }
    if (write.status === 'nothing') {
      return { success: true, data: localProgress };
    }

    const { data, error } = write;

    if (error) {
      return (await identity.isCurrent())
        ? { success: true, data: localProgress }
        : stalePlanResult<UserReadingPlanProgress[]>();
    }

    const syncedRows = normalizeRemoteProgressRows((data ?? []) as RemoteReadingPlanProgressRow[]);
    const syncedApplied = await identity.runIfCurrent(() => {
      syncedRows.forEach(mergeServerRowIntoLive);
    });
    if (!syncedApplied.applied) {
      return stalePlanResult<UserReadingPlanProgress[]>();
    }

    return {
      success: true,
      data: [
        ...localProgress.filter((progress) => !shouldSyncPlanProgressRemotely(progress.plan_id)),
        ...syncedRows,
      ],
    };
  } catch {
    return { success: true, data: localProgress };
  }
}

export async function savePlanForLater(planId: string): Promise<PlanServiceResult<UserSavedPlan>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  readingPlansStore.getState().savePlan(planId);
  return {
    success: true,
    data: buildLocalSavedPlan(planId),
  };
}

export async function unsavePlan(planId: string): Promise<PlanServiceResult> {
  readingPlansStore.getState().unsavePlan(planId);
  return { success: true };
}

export async function getSavedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  const savedIds = new Set(readingPlansStore.getState().savedPlanIds);
  return {
    success: true,
    data: getSortedPlans().filter((plan) => savedIds.has(plan.id)),
  };
}

export async function getCompletedPlans(): Promise<
  PlanServiceResult<(UserReadingPlanProgress & { plan: ReadingPlan })[]>
> {
  const completedPlans = getLocalProgressList(readingPlansStore)
    .filter((progress) => progress.is_completed)
    .map((progress) => {
      const plan = getPlan(progress.plan_id);
      return plan ? { ...progress, plan } : null;
    })
    .filter((item): item is UserReadingPlanProgress & { plan: ReadingPlan } => item !== null);

  return { success: true, data: completedPlans };
}

export async function getFeaturedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  const featured = getSortedPlans().filter((plan) => FEATURED_PLAN_IDS.includes(plan.id));
  return { success: true, data: featured.length > 0 ? featured : getSortedPlans().slice(0, 1) };
}

export async function getPlansByCategory(
  category: string
): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: getSortedPlans().filter((plan) => plan.category === category),
  };
}

export async function getTimedChallengePlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: getSortedPlans().filter((plan) => TIMED_CHALLENGE_PLAN_IDS.has(plan.id)),
  };
}
