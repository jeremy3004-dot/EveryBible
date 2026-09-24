import { readingPlansStore } from '../../../stores/readingPlansStore';
import type { SyncIdentityBoundary } from '../../sync/syncIdentity';
import { isMissingClockColumnError, isMissingTableError } from './planRemoteErrorModel';
import {
  capturePlanSyncIdentity,
  getAuthGenerationSnapshot,
  getAuthUserIdSnapshot,
  loadSupabaseModule,
  type SupabaseClient,
} from './planSyncIdentity';
import { buildPlanTombstoneRow } from './planSyncModel';

// Server tombstones: when each plan was left (migration 20260924023340).
const PLAN_UNENROLLMENTS_TABLE = 'user_reading_plan_unenrollments';

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
export async function fetchPlanUnenrollments(
  supabase: SupabaseClient,
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

/**
 * Clears a tombstone locally when there is no backend to send it to, provided the account the
 * leave was made under is still the signed-in one.
 */
async function clearTombstoneWithoutBackend(
  planId: string,
  expectedUserId: string | undefined,
  expectedGeneration: number | undefined,
  prevalidatedIdentity: SyncIdentityBoundary | undefined
): Promise<boolean> {
  if (
    (expectedUserId && getAuthUserIdSnapshot() !== expectedUserId) ||
    (expectedGeneration !== undefined && getAuthGenerationSnapshot() !== expectedGeneration)
  ) {
    return false;
  }

  if (prevalidatedIdentity) {
    if (
      (expectedUserId !== undefined && prevalidatedIdentity.expectedUserId !== expectedUserId) ||
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

/**
 * Attempts the remote delete for an unenrolled plan and clears its tombstone on
 * confirmed success. Returns false when the delete could not be confirmed (offline,
 * RLS, network) so the tombstone survives and syncReadingPlans can retry (M12).
 */
export async function deleteRemotePlanProgress(
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
      // Awaited so a rejection lands in this function's catch, like every other path here.
      return await clearTombstoneWithoutBackend(
        planId,
        expectedUserId,
        expectedGeneration,
        prevalidatedIdentity
      );
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
    const upsertTombstone = (withClock: boolean) =>
      identity.runIfCurrent(() =>
        supabase
          .from(PLAN_UNENROLLMENTS_TABLE)
          .upsert(
            buildPlanTombstoneRow(
              identity.expectedUserId,
              planId,
              unenrolledAt,
              withClock ? new Date().toISOString() : undefined
            ),
            { onConflict: 'user_id,plan_slug' }
          )
      );
    let tombstone = await upsertTombstone(true);
    if (!tombstone.applied) {
      return false;
    }

    let { error } = await tombstone.value!;

    if (isMissingClockColumnError(error)) {
      // A server without that migration: the leave as before, clamped to its clock.
      tombstone = await upsertTombstone(false);
      if (!tombstone.applied) {
        return false;
      }
      ({ error } = await tombstone.value!);
    }

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

/**
 * Retries the remote delete for every plan the user unenrolled while the delete
 * could not be confirmed. Clears each tombstone on success (M12).
 */
export async function retryPendingUnenrolls(
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
