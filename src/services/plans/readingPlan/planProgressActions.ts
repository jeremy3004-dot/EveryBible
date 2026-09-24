import { readingPlansStore } from '../../../stores/readingPlansStore';
import type { PlanSessionKey, UserReadingPlanProgress } from '../types';
import { getPlan } from './planCatalog';
import { completePlanDayInStore, completePlanSessionInStore } from './planCompletion';
import { pushProgressToRemote } from './planProgressPush';
import type { PlanServiceResult } from './planServiceResult';
import { getAuthGenerationSnapshot, getAuthUserIdSnapshot } from './planSyncIdentity';
import { deleteRemotePlanProgress } from './planTombstones';

// The reader's plan actions. Each lands on the device first and returns; the server write runs
// in the background (or, for a leave, is queued as a tombstone the next sync retries).

/** L20: never block the tap or navigation on the (un-timed) network round-trip. */
const pushInBackground = (progress: UserReadingPlanProgress): void => {
  void pushProgressToRemote(progress, getAuthUserIdSnapshot(), getAuthGenerationSnapshot());
};

export async function enrollInPlan(
  planId: string
): Promise<PlanServiceResult<UserReadingPlanProgress>> {
  const plan = getPlan(planId);
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }

  const localProgress = readingPlansStore.getState().enrollPlan(planId);
  pushInBackground(localProgress);

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

  const localUpdated = completePlanDayInStore(readingPlansStore, plan, dayNumber);
  if (!localUpdated) {
    return { success: false, error: 'Not enrolled in this plan' };
  }

  pushInBackground(localUpdated);

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

  const outcome = completePlanSessionInStore(readingPlansStore, plan, dayNumber, sessionKey);
  if (!outcome.found) {
    return { success: false, error: 'Plan session not found' };
  }
  if (!outcome.progress) {
    return { success: false, error: 'Not enrolled in this plan' };
  }

  // Session ticks follow the account (migration 20260924023342); like a day
  // completion, the push runs in the background after the local write.
  pushInBackground(outcome.progress);

  return { success: true, data: outcome.progress };
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

  // M12: an unconfirmed delete (offline, server error) leaves the tombstone in
  // place for syncReadingPlans to retry. The leave itself already happened on
  // the device, so the reader is told it is pending sync, not that it failed:
  // an error alert here stranded them on the detail screen of a plan they had
  // already left.
  const deleted = await deleteRemotePlanProgress(planId, expectedUserId, expectedGeneration);

  return deleted ? { success: true } : { success: true, pendingSync: true };
}
