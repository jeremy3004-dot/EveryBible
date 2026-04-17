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
  getUserPlanProgress(planId?: string): Promise<PlanServiceResult<UserReadingPlanProgress[]>>;
  unenrollFromPlan(planId: string): Promise<PlanServiceResult>;
  assignPlanToGroup(planId: string, groupId: string): Promise<PlanServiceResult<GroupReadingPlan>>;
  getGroupPlans(groupId: string): Promise<PlanServiceResult<GroupReadingPlan[]>>;
  syncPlanProgress(
    localProgress: UserReadingPlanProgress[]
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

async function withTimeoutFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

      const sessionGroups = getDaySessionEntries(readingPlanEntriesByPlanId[planId] ?? [], dayNumber);
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

export async function enrollInPlan(
  planId: string
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const localProgress = readingPlansStore.getState().enrollPlan(planId);

  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
  const { user } = await requireSignedInUser('enroll in a reading plan');

  if (!isSupabaseConfigured() || !user) {
    return { success: true, data: localProgress };
  }

  try {
    const { data, error } = await supabase
      .from('user_reading_plan_progress')
      .upsert(
        buildRemoteReadingPlanProgressPayload(localProgress, user.id),
        { onConflict: 'user_id,plan_slug' }
      )
      .select('*')
      .single();

    if (error) {
      return { success: true, data: localProgress };
    }

    const syncedProgress = normalizeRemoteReadingPlanProgress(data as RemoteReadingPlanProgressRow);
    if (!syncedProgress) {
      return { success: true, data: localProgress };
    }

    readingPlansStore.getState().upsertProgress(syncedProgress);
    return { success: true, data: syncedProgress };
  } catch {
    return { success: true, data: localProgress };
  }
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

  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
  const { user } = await requireSignedInUser('mark a reading day complete');

  if (!isSupabaseConfigured() || !user) {
    return { success: true, data: localUpdated };
  }

  try {
    const { data, error } = await supabase
      .from('user_reading_plan_progress')
      .upsert(
        buildRemoteReadingPlanProgressPayload(localUpdated, user.id),
        { onConflict: 'user_id,plan_slug' }
      )
      .select('*')
      .single();

    if (error) {
      return { success: true, data: localUpdated };
    }

    const syncedProgress = normalizeRemoteReadingPlanProgress(data as RemoteReadingPlanProgressRow);
    if (!syncedProgress) {
      return { success: true, data: localUpdated };
    }

    readingPlansStore.getState().upsertProgress(syncedProgress);
    return { success: true, data: syncedProgress };
  } catch {
    return { success: true, data: localUpdated };
  }
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
  const localUpdated = readingPlansStore.getState().markSessionComplete(planId, dayNumber, sessionKey, {
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

export async function getUserPlanProgress(
  planId?: string
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  const localProgress = getLocalProgressList(readingPlansStore, planId);
  const localFallback = { success: true, data: localProgress } satisfies PlanServiceResult<
    UserReadingPlanProgress[]
  >;

  return withTimeoutFallback(
    (async () => {
      const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
      const { user } = await requireSignedInUser('fetch reading plan progress');

      if (!isSupabaseConfigured() || !user) {
        return localFallback;
      }

      try {
        let query = supabase.from('user_reading_plan_progress').select('*').eq('user_id', user.id);

        if (planId) {
          query = query.eq('plan_slug', planId);
        }

        const { data, error } = await query.order('started_at', { ascending: false });

        if (error) {
          return localFallback;
        }

        const remoteProgress = normalizeRemoteProgressRows(
          ((data ?? []) as RemoteReadingPlanProgressRow[]).filter((progress) =>
            shouldSyncPlanProgressRemotely(progress.plan_slug ?? progress.plan_id ?? undefined)
          )
        );
        const fetchedAt = new Date().toISOString();
        const reconciledProgress =
          remoteProgress.length === 0
            ? localProgress
            : reconcileFetchedPlanProgress(localProgress, remoteProgress, fetchedAt);
        if (planId) {
          reconciledProgress.forEach((progress) => {
            readingPlansStore.getState().upsertProgress(progress);
          });
        } else {
          readingPlansStore.getState().replaceProgress(reconciledProgress);
        }

        return { success: true, data: reconciledProgress };
      } catch {
        return localFallback;
      }
    })(),
    PLAN_REMOTE_PROGRESS_TIMEOUT_MS,
    localFallback
  );
}

export async function unenrollFromPlan(planId: string): Promise<PlanServiceResult> {
  readingPlansStore.getState().unenrollPlan(planId);

  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
  const { user } = await requireSignedInUser('unenroll from a reading plan');

  if (!isSupabaseConfigured() || !user) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('user_reading_plan_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('plan_slug', planId);

    if (error) {
      return { success: true };
    }

    return { success: true };
  } catch {
    return { success: true };
  }
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

export async function syncPlanProgress(
  localProgress: UserReadingPlanProgress[]
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  localProgress.forEach((progress) => {
    readingPlansStore.getState().upsertProgress(progress);
  });

  const remoteSyncableProgress = localProgress.filter((progress) =>
    shouldSyncPlanProgressRemotely(progress.plan_id)
  );

  if (remoteSyncableProgress.length === 0) {
    return { success: true, data: localProgress };
  }

  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();
  const { user } = await requireSignedInUser('sync reading plan progress');

  if (!isSupabaseConfigured() || !user) {
    return { success: true, data: localProgress };
  }

  try {
    const upsertPayload = remoteSyncableProgress.map((progress) =>
      buildRemoteReadingPlanProgressPayload(progress, user.id)
    );

    const { data, error } = await supabase
      .from('user_reading_plan_progress')
      .upsert(upsertPayload, { onConflict: 'user_id,plan_slug' })
      .select('*');

    if (error) {
      return { success: true, data: localProgress };
    }

    const syncedRows = normalizeRemoteProgressRows((data ?? []) as RemoteReadingPlanProgressRow[]);
    syncedRows.forEach((progress) => {
      readingPlansStore.getState().upsertProgress(progress);
    });

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
