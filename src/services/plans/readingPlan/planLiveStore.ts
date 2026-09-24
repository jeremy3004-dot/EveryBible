import { readingPlansStore, type ReadingPlansStoreApi } from '../../../stores/readingPlansStore';
import { mergePlanProgress } from '../readingPlanModel';
import type { UserReadingPlanProgress } from '../types';
import {
  getPlansTheServerSkipped,
  getProgressEndedElsewhere,
  sortProgressNewestFirst,
} from './planSyncModel';

// Folding server answers into the live store. Each helper re-reads the store when it runs, so
// a completion or leave made while a request was in flight is never overwritten; callers run
// them inside the sync identity boundary.

export function getLocalProgressList(
  store: ReadingPlansStoreApi,
  planId?: string
): UserReadingPlanProgress[] {
  return sortProgressNewestFirst(Object.values(store.getState().progressByPlanId), planId);
}

/**
 * Folds a server row into the live store. A server row reflects the moment it was
 * written (and, before migration 20260924023342, carries no session ticks), so
 * replacing the live row would drop completed sessions and any completion made
 * while a request was in flight. A plan that is no longer enrolled (or is waiting on its remote
 * delete) is not revived by a late row.
 */
export function mergeServerRowIntoLive(serverRow: UserReadingPlanProgress): void {
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
export function applyLocalSnapshotRow(snapshotRow: UserReadingPlanProgress): void {
  const store = readingPlansStore.getState();
  const live = store.getProgress(snapshotRow.plan_id);
  store.upsertProgress(live ? mergePlanProgress(live, snapshotRow, live.synced_at) : snapshotRow);
}

/** The live, still-enrolled rows for these plans, read at the moment of the push. */
export function getLivePushableProgress(planIds: string[]): UserReadingPlanProgress[] {
  const store = readingPlansStore.getState();
  const tombstoned = new Set(store.pendingUnenrollPlanIds);
  return planIds
    .filter((planId) => !tombstoned.has(planId))
    .map((planId) => store.getProgress(planId))
    .filter((progress): progress is UserReadingPlanProgress => progress !== null);
}

/**
 * Removes live enrolments that were left on another device. Re-reads the live row,
 * so a re-join made while the tombstones were in flight is kept. Call inside the
 * identity boundary.
 */
export function endPlansLeftElsewhere(unenrollments: Map<string, string> | null): void {
  if (!unenrollments) {
    return;
  }
  const store = readingPlansStore.getState();
  getProgressEndedElsewhere(Object.values(store.progressByPlanId), unenrollments).forEach(
    (planId) => store.endPlanLeftElsewhere(planId)
  );
}

/**
 * Drops the plans the server skipped as ended (see getPlansTheServerSkipped). Call inside the
 * identity boundary.
 */
export function endPlansTheServerSkipped(
  sentPlanIds: string[],
  storedRows: UserReadingPlanProgress[],
  unenrollments: Map<string, string> | null
): void {
  if (!unenrollments) {
    return;
  }
  const store = readingPlansStore.getState();
  getPlansTheServerSkipped(
    sentPlanIds,
    storedRows,
    unenrollments,
    (planId) => !store.pendingUnenrollPlanIds.includes(planId) && store.getProgress(planId) !== null
  ).forEach((planId) => store.endPlanLeftElsewhere(planId));
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
export function commitReconciledProgress(
  reconciled: UserReadingPlanProgress[],
  fetchedAt: string
): void {
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
