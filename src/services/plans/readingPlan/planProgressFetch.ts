import { readingPlansStore } from '../../../stores/readingPlansStore';
import {
  reconcileFetchedPlanProgress,
  type RemoteReadingPlanProgressRow,
} from '../readingPlanModel';
import type { UserReadingPlanProgress } from '../types';
import type { SyncIdentityBoundary } from '../../sync/syncIdentity';
import {
  commitReconciledProgress,
  endPlansLeftElsewhere,
  getLocalProgressList,
} from './planLiveStore';
import { pushProgressToRemote } from './planProgressPush';
import { stalePlanResult, type PlanServiceResult } from './planServiceResult';
import {
  capturePlanSyncIdentity,
  getAuthGenerationSnapshot,
  getAuthUserIdSnapshot,
  loadSupabaseModule,
  resolvePlanSyncIdentity,
} from './planSyncIdentity';
import {
  getProgressEndedElsewhere,
  normalizeRemoteProgressRows,
  shouldSyncPlanProgressRemotely,
} from './planSyncModel';
import { fetchPlanUnenrollments } from './planTombstones';

const PLAN_REMOTE_PROGRESS_TIMEOUT_MS = 1500;

type ProgressListResult = PlanServiceResult<UserReadingPlanProgress[]>;

/**
 * The reader's plan progress: the account's server rows reconciled into the live store, or
 * the local rows when the server is slow (1.5 s), unreachable or not configured.
 */
export async function getUserPlanProgress(
  planId?: string,
  expectedUserId?: string,
  expectedGeneration?: number,
  prevalidatedIdentity?: SyncIdentityBoundary
): Promise<ProgressListResult> {
  const capturedUserId = expectedUserId ?? getAuthUserIdSnapshot();
  const capturedGeneration = expectedGeneration ?? getAuthGenerationSnapshot();
  const localProgress = getLocalProgressList(readingPlansStore, planId);
  const localFallback = { success: true, data: localProgress } satisfies ProgressListResult;

  // L19: track whether the timeout fallback already returned. If it has, the
  // in-flight fetch must NOT commit its (now stale) snapshot to the store.
  let fallbackWon = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const remoteFetch = (async (): Promise<ProgressListResult> => {
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
    new Promise<ProgressListResult>((resolve) => {
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
