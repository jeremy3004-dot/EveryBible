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

let supabaseModulePromise: Promise<typeof import('../supabase')> | null = null;

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

      const nextSessionKey = sessionGroups[sessionIndex + 1]?.sessionKey ?? null;
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

    const write = await identity.runIfCurrent(() =>
      supabase
        .from('user_reading_plan_progress')
        .upsert(buildRemoteReadingPlanProgressPayload(progress, identity.expectedUserId), {
          onConflict: 'user_id,plan_slug',
        })
        .select('*')
        .single()
    );
    if (!write.applied) {
      return;
    }

    const { data, error } = await write.value!;

    if (error) {
      return;
    }

    const syncedProgress = normalizeRemoteReadingPlanProgress(data as RemoteReadingPlanProgressRow);
    if (syncedProgress) {
      await identity.runIfCurrent(() => {
        readingPlansStore.getState().upsertProgress(syncedProgress);
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

  const nextSessionKey = sessionGroups[sessionIndex + 1]?.sessionKey ?? null;
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

      const { data, error } = await query.order('started_at', { ascending: false });

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

      if (remoteProgress.length === 0) {
        return (await identity.isCurrent())
          ? { success: true, data: localProgress }
          : stalePlanResult<UserReadingPlanProgress[]>();
      }

      // H3: reconcile without dropping local-only rows.
      const { progress: reconciledProgress, localOnlyProgress } = reconcileFetchedPlanProgress(
        localProgress,
        remoteProgress,
        fetchedAt,
        tombstonedPlanIds
      );

      // L19: commit via a live-store re-read + per-plan merge (never wholesale replace).
      const committed = await identity.runIfCurrent(() => {
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

    const { error } = await deletion.value!;

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

  return { success: deleted };
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
    localProgress.forEach((progress) => {
      readingPlansStore.getState().upsertProgress(progress);
    });
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
  await retryPendingUnenrolls(identity.expectedUserId, identity.expectedGeneration, identity);

  if (!(await identity.isCurrent())) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  const tombstoned = new Set(readingPlansStore.getState().pendingUnenrollPlanIds);

  const localApplied = await identity.runIfCurrent(() => {
    localProgress
      .filter((progress) => !tombstoned.has(progress.plan_id))
      .forEach((progress) => {
        readingPlansStore.getState().upsertProgress(progress);
      });
  });
  if (!localApplied.applied) {
    return stalePlanResult<UserReadingPlanProgress[]>();
  }

  const remoteSyncableProgress = localProgress.filter(
    (progress) =>
      shouldSyncPlanProgressRemotely(progress.plan_id) && !tombstoned.has(progress.plan_id)
  );

  if (remoteSyncableProgress.length === 0) {
    return (await identity.isCurrent())
      ? { success: true, data: localProgress }
      : stalePlanResult<UserReadingPlanProgress[]>();
  }

  const { supabase } = supabaseModule;

  try {
    const upsertPayload = remoteSyncableProgress.map((progress) =>
      buildRemoteReadingPlanProgressPayload(progress, identity.expectedUserId)
    );

    const write = await identity.runIfCurrent(() =>
      supabase
        .from('user_reading_plan_progress')
        .upsert(upsertPayload, { onConflict: 'user_id,plan_slug' })
        .select('*')
    );
    if (!write.applied) {
      return stalePlanResult<UserReadingPlanProgress[]>();
    }

    const { data, error } = await write.value!;

    if (error) {
      return (await identity.isCurrent())
        ? { success: true, data: localProgress }
        : stalePlanResult<UserReadingPlanProgress[]>();
    }

    const syncedRows = normalizeRemoteProgressRows((data ?? []) as RemoteReadingPlanProgressRow[]);
    const syncedApplied = await identity.runIfCurrent(() => {
      syncedRows.forEach((progress) => {
        readingPlansStore.getState().upsertProgress(progress);
      });
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
