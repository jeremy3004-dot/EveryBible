import { supabase, isSupabaseConfigured } from '../supabase';
import type {
  ReadingPlan,
  ReadingPlanEntry,
  UserReadingPlanProgress,
  GroupReadingPlan,
  UserSavedPlan,
} from '../supabase/types';

// ---------------------------------------------------------------------------
// Return-type helpers
// ---------------------------------------------------------------------------

export interface PlanServiceResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal auth helper (mirrors groupService pattern)
// ---------------------------------------------------------------------------

async function requireSignedInUser(action: string): Promise<
  | { user: { id: string }; error: null }
  | { user: null; error: string }
> {
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

// ---------------------------------------------------------------------------
// 1. listReadingPlans — browse all active plans
// ---------------------------------------------------------------------------

export async function listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('reading_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as ReadingPlan[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. getPlanEntries — all daily entries for a plan, ordered by day
// ---------------------------------------------------------------------------

export async function getPlanEntries(
  planId: string
): Promise<PlanServiceResult<ReadingPlanEntry[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('reading_plan_entries')
      .select('*')
      .eq('plan_id', planId)
      .order('day_number', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as ReadingPlanEntry[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 3. enrollInPlan — create a progress row for the current user
// ---------------------------------------------------------------------------

export async function enrollInPlan(
  planId: string
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const { user, error: authError } = await requireSignedInUser('enroll in a reading plan');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    // Upsert so repeated enroll calls are idempotent (e.g. re-enrollment after
    // unenrolling then re-joining).
    const { data, error } = await supabase
      .from('user_reading_plan_progress')
      .upsert(
        {
          user_id: user.id,
          plan_id: planId,
          started_at: new Date().toISOString(),
          completed_entries: {},
          current_day: 1,
          is_completed: false,
          completed_at: null,
        },
        { onConflict: 'user_id,plan_id' }
      )
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UserReadingPlanProgress };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. markDayComplete — record a day as done and advance current_day
// ---------------------------------------------------------------------------

export async function markDayComplete(
  planId: string,
  dayNumber: number
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const { user, error: authError } = await requireSignedInUser('mark a reading day complete');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    // Fetch existing progress first so we can merge completed_entries
    const { data: existing, error: fetchError } = await supabase
      .from('user_reading_plan_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('plan_id', planId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (!existing) {
      return { success: false, error: 'Not enrolled in this plan' };
    }

    const progress = existing as UserReadingPlanProgress;
    const updatedEntries: Record<string, string> = {
      ...progress.completed_entries,
      [String(dayNumber)]: new Date().toISOString(),
    };

    // Advance current_day to the next uncompleted day (minimum: dayNumber + 1)
    const nextDay = Math.max(progress.current_day, dayNumber + 1);

    // Determine completion: plan is done when total entries equal completed count.
    // We do a lightweight check via plan duration; full validation happens server-side.
    const { data: planRow } = await supabase
      .from('reading_plans')
      .select('duration_days')
      .eq('id', planId)
      .maybeSingle();

    const durationDays = (planRow as Pick<ReadingPlan, 'duration_days'> | null)?.duration_days ?? 0;
    const completedCount = Object.keys(updatedEntries).length;
    const isPlanCompleted = durationDays > 0 && completedCount >= durationDays;

    const { data, error: updateError } = await supabase
      .from('user_reading_plan_progress')
      .update({
        completed_entries: updatedEntries,
        current_day: nextDay,
        is_completed: isPlanCompleted,
        completed_at: isPlanCompleted ? new Date().toISOString() : null,
        synced_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('plan_id', planId)
      .select('*')
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, data: data as UserReadingPlanProgress };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 5. getUserPlanProgress — fetch progress for one plan or all enrolled plans
// ---------------------------------------------------------------------------

export async function getUserPlanProgress(
  planId?: string
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  const { user, error: authError } = await requireSignedInUser('fetch reading plan progress');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    let query = supabase
      .from('user_reading_plan_progress')
      .select('*')
      .eq('user_id', user.id);

    if (planId) {
      query = query.eq('plan_id', planId);
    }

    const { data, error } = await query.order('started_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as UserReadingPlanProgress[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 6. unenrollFromPlan — remove the user's progress row for a plan
// ---------------------------------------------------------------------------

export async function unenrollFromPlan(planId: string): Promise<PlanServiceResult> {
  const { user, error: authError } = await requireSignedInUser('unenroll from a reading plan');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    const { error } = await supabase
      .from('user_reading_plan_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('plan_id', planId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 7. assignPlanToGroup — leader assigns a reading plan to their group
// ---------------------------------------------------------------------------

export async function assignPlanToGroup(
  planId: string,
  groupId: string
): Promise<PlanServiceResult<GroupReadingPlan>> {
  const { user, error: authError } = await requireSignedInUser('assign a plan to a group');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    const { data, error } = await supabase
      .from('group_reading_plans')
      .insert({
        group_id: groupId,
        plan_id: planId,
        assigned_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as GroupReadingPlan };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 8. getGroupPlans — all plans assigned to a group
// ---------------------------------------------------------------------------

export async function getGroupPlans(
  groupId: string
): Promise<PlanServiceResult<GroupReadingPlan[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('group_reading_plans')
      .select('*')
      .eq('group_id', groupId)
      .order('started_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as GroupReadingPlan[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 9. syncPlanProgress — push local progress records to Supabase
//    localProgress: array of UserReadingPlanProgress from the local store
// ---------------------------------------------------------------------------

export async function syncPlanProgress(
  localProgress: UserReadingPlanProgress[]
): Promise<PlanServiceResult<UserReadingPlanProgress[]>> {
  if (!isSupabaseConfigured()) {
    // Nothing to sync; treat as success so offline callers are not disrupted
    return { success: true, data: localProgress };
  }

  const { user, error: authError } = await requireSignedInUser('sync reading plan progress');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  if (localProgress.length === 0) {
    return { success: true, data: [] };
  }

  try {
    const now = new Date().toISOString();

    // Fetch remote state for all relevant plan IDs in one query
    const planIds = [...new Set(localProgress.map((p) => p.plan_id))];
    const { data: remoteRows, error: fetchError } = await supabase
      .from('user_reading_plan_progress')
      .select('*')
      .eq('user_id', user.id)
      .in('plan_id', planIds);

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const remoteByPlanId = new Map<string, UserReadingPlanProgress>(
      ((remoteRows ?? []) as UserReadingPlanProgress[]).map((r) => [r.plan_id, r])
    );

    // Merge: union completed_entries, take the higher current_day, prefer completed state
    const merged: UserReadingPlanProgress[] = localProgress.map((local) => {
      const remote = remoteByPlanId.get(local.plan_id);

      if (!remote) {
        return { ...local, synced_at: now };
      }

      const mergedEntries: Record<string, string> = {
        ...remote.completed_entries,
        ...local.completed_entries,
      };

      const higherDay = Math.max(local.current_day, remote.current_day);
      const isCompleted = local.is_completed || remote.is_completed;
      const completedAt = local.completed_at ?? remote.completed_at;

      return {
        ...remote,
        completed_entries: mergedEntries,
        current_day: higherDay,
        is_completed: isCompleted,
        completed_at: completedAt,
        synced_at: now,
      };
    });

    // Upsert merged rows — conflict key is (user_id, plan_id)
    const upsertPayload = merged.map(({ id: _id, ...rest }) => ({
      ...rest,
      user_id: user.id,
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from('user_reading_plan_progress')
      .upsert(upsertPayload, { onConflict: 'user_id,plan_id' })
      .select('*');

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true, data: (upserted ?? []) as UserReadingPlanProgress[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 10. savePlanForLater — save a plan to the user's saved list (idempotent)
// ---------------------------------------------------------------------------

export async function savePlanForLater(planId: string): Promise<PlanServiceResult<UserSavedPlan>> {
  const { user, error: authError } = await requireSignedInUser('save a reading plan');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    const { data, error } = await supabase
      .from('user_saved_plans')
      .upsert(
        { user_id: user.id, plan_id: planId },
        { onConflict: 'user_id,plan_id' }
      )
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UserSavedPlan };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 11. unsavePlan — remove a plan from the user's saved list
// ---------------------------------------------------------------------------

export async function unsavePlan(planId: string): Promise<PlanServiceResult> {
  const { user, error: authError } = await requireSignedInUser('unsave a reading plan');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    const { error } = await supabase
      .from('user_saved_plans')
      .delete()
      .eq('user_id', user.id)
      .eq('plan_id', planId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 12. getSavedPlans — fetch all plans the user has saved
// ---------------------------------------------------------------------------

export async function getSavedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  const { user, error: authError } = await requireSignedInUser('fetch saved reading plans');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    // Step 1: get saved plan_ids for this user
    const { data: savedRows, error: savedError } = await supabase
      .from('user_saved_plans')
      .select('plan_id')
      .eq('user_id', user.id);

    if (savedError) {
      return { success: false, error: savedError.message };
    }

    const planIds = ((savedRows ?? []) as Pick<UserSavedPlan, 'plan_id'>[]).map((r) => r.plan_id);
    if (planIds.length === 0) {
      return { success: true, data: [] };
    }

    // Step 2: fetch the corresponding reading_plans rows
    const { data, error } = await supabase
      .from('reading_plans')
      .select('*')
      .in('id', planIds)
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as ReadingPlan[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 13. getCompletedPlans — fetch completed plans with their plan metadata
// ---------------------------------------------------------------------------

export async function getCompletedPlans(): Promise<
  PlanServiceResult<(UserReadingPlanProgress & { plan: ReadingPlan })[]>
> {
  const { user, error: authError } = await requireSignedInUser('fetch completed reading plans');
  if (!user) {
    return { success: false, error: authError ?? undefined };
  }

  try {
    const { data, error } = await supabase
      .from('user_reading_plan_progress')
      .select('*, reading_plans(*)')
      .eq('user_id', user.id)
      .eq('is_completed', true)
      .order('completed_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    // Reshape: supabase returns reading_plans as a nested object
    const result = ((data ?? []) as (UserReadingPlanProgress & {
      reading_plans: ReadingPlan | null;
    })[]).map((row) => {
      const { reading_plans: plan, ...progress } = row;
      return { ...progress, plan: plan as ReadingPlan };
    });

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 14. getFeaturedPlans — fetch plans marked as featured (no auth required)
// ---------------------------------------------------------------------------

export async function getFeaturedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('reading_plans')
      .select('*')
      .eq('featured', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as ReadingPlan[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// 15. getPlansByCategory — fetch active plans for a given category (no auth required)
// ---------------------------------------------------------------------------

export async function getPlansByCategory(
  category: string
): Promise<PlanServiceResult<ReadingPlan[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('reading_plans')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as ReadingPlan[] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
