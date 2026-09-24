import { readingPlansStore } from '../../../stores/readingPlansStore';
import {
  normalizeRemoteReadingPlanProgress,
  type RemoteReadingPlanProgressRow,
} from '../readingPlanModel';
import type { UserReadingPlanProgress } from '../types';
import type { SyncIdentityBoundary } from '../../sync/syncIdentity';
import { endPlansTheServerSkipped, mergeServerRowIntoLive } from './planLiveStore';
import { isNoRowForSingleError } from './planRemoteErrorModel';
import { mergeServerRowsBeforePush, upsertLivePlanProgress } from './planServerWrite';
import {
  capturePlanSyncIdentity,
  getAuthGenerationSnapshot,
  loadSupabaseModule,
} from './planSyncIdentity';
import { deleteRemotePlanProgress } from './planTombstones';

/**
 * Pushes one plan's live row in the background after a local change. Offline-first: any
 * failure leaves the row local, and the next sync retries it.
 */
export async function pushProgressToRemote(
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

    // A re-join made while its leave was still unsent: the leave goes first, so
    // the server deletes the pre-leave row instead of merging it into this one.
    if (readingPlansStore.getState().pendingUnenrollPlanIds.includes(progress.plan_id)) {
      const left = await deleteRemotePlanProgress(
        progress.plan_id,
        identity.expectedUserId,
        identity.expectedGeneration,
        identity
      );
      if (!left) {
        return;
      }
    }

    const preWrite = await mergeServerRowsBeforePush(supabase, identity, [progress.plan_id]);
    if (preWrite.outcome !== 'merged') {
      return;
    }

    const write = await upsertLivePlanProgress(
      supabase,
      identity,
      [progress.plan_id],
      preWrite,
      true
    );
    if (write.status !== 'done') {
      return;
    }
    if (write.error) {
      // .single() finding no row: the server skipped the push.
      if (isNoRowForSingleError(write.error)) {
        await identity.runIfCurrent(() => {
          endPlansTheServerSkipped([progress.plan_id], [], preWrite.unenrollments);
        });
      }
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
