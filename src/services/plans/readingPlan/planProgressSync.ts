import { readingPlansStore } from '../../../stores/readingPlansStore';
import type { RemoteReadingPlanProgressRow } from '../readingPlanModel';
import type { UserReadingPlanProgress } from '../types';
import type { SyncIdentityBoundary } from '../../sync/syncIdentity';
import {
  applyLocalSnapshotRow,
  endPlansTheServerSkipped,
  mergeServerRowIntoLive,
} from './planLiveStore';
import { mergeServerRowsBeforePush, upsertLivePlanProgress } from './planServerWrite';
import { stalePlanResult, type PlanServiceResult } from './planServiceResult';
import {
  capturePlanSyncIdentity,
  getAuthGenerationSnapshot,
  getAuthUserIdSnapshot,
  loadSupabaseModule,
} from './planSyncIdentity';
import {
  isSnapshotRowEndedByConfirmedLeave,
  normalizeRemoteProgressRows,
  shouldSyncPlanProgressRemotely,
} from './planSyncModel';
import { retryPendingUnenrolls } from './planTombstones';

type ProgressListResult = PlanServiceResult<UserReadingPlanProgress[]>;

/**
 * One sync cycle for plan progress: retries unsent leaves, applies the cycle's local snapshot
 * to the live store, then merges the live rows with the account's server rows and writes the
 * union back. The live store stays authoritative for anything changed while it runs.
 */
export async function syncPlanProgress(
  localProgress: UserReadingPlanProgress[],
  expectedUserId?: string,
  expectedGeneration?: number,
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<ProgressListResult> {
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
  localProgress = localProgress.filter(
    (progress) => !isSnapshotRowEndedByConfirmedLeave(progress, confirmedLeaves, leftAtBefore)
  );

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
      preWrite,
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
      endPlansTheServerSkipped(remoteSyncablePlanIds, syncedRows, preWrite.unenrollments);
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
