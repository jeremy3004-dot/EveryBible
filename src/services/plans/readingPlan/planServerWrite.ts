import {
  buildRemoteReadingPlanProgressPayload,
  type RemoteReadingPlanProgressRow,
} from '../readingPlanModel';
import { isMergeRefusedForAccount, type SyncIdentityBoundary } from '../../sync/syncIdentity';
import {
  endPlansLeftElsewhere,
  getLivePushableProgress,
  mergeServerRowIntoLive,
} from './planLiveStore';
import { isMissingMergeRpcError, isMissingSessionColumnError } from './planRemoteErrorModel';
import type { SupabaseClient } from './planSyncIdentity';
import {
  batchPlanIds,
  buildMergeRpcRows,
  getPlansNeedingClientClock,
  normalizeRemoteProgressRows,
} from './planSyncModel';
import { fetchPlanUnenrollments } from './planTombstones';

const PLAN_PROGRESS_MERGE_RPC = 'merge_reading_plan_progress';

export type PreWriteMerge =
  | {
      outcome: 'merged';
      /**
       * Whether the server has the session-tick columns, read off the fetched
       * rows (select('*') returns every column); null when no row came back.
       */
      sessionColumns: boolean | null;
      /** The account's tombstones for these plans, or null when they could not be read. */
      unenrollments: Map<string, string> | null;
      /** Plans to push with this phone's clock (see getPlansNeedingClientClock). */
      clockPlanIds: Set<string>;
    }
  | { outcome: 'unreadable' | 'stale' };

export type LivePlanUpsert =
  | { status: 'stale' }
  | { status: 'nothing' }
  | { status: 'done'; data: unknown; error: { code?: string; message?: string } | null };

/**
 * Reads the account's server rows for these plans and folds them into the live
 * store before a push. The upsert replaces the server row, so pushing without
 * this read would overwrite days completed on another device (or the account's
 * existing progress when a second device enrols). When the rows cannot be read
 * the caller must skip the push rather than write blind.
 */
export async function mergeServerRowsBeforePush(
  supabase: SupabaseClient,
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
      return getPlansNeedingClientClock(
        planIds,
        unenrollments,
        new Set(serverRows.map((row) => row.plan_id)),
        getLivePushableProgress(planIds)
      );
    });
    const firstRow = rawRows[0];
    return merged.applied
      ? {
          outcome: 'merged',
          sessionColumns: firstRow ? 'completed_sessions' in firstRow : null,
          unenrollments,
          clockPlanIds: merged.value ?? new Set<string>(),
        }
      : { outcome: 'stale' };
  } catch {
    return failed();
  }
}

/**
 * Sends the live rows to merge_reading_plan_progress, which unions them into the
 * stored rows in one statement. The read-merge-upsert path lets two phones that
 * read the same row each overwrite the other's newest days (finding 12); the
 * server-side merge cannot. Returns null when the server has no such function.
 */
async function mergeLivePlanProgressOnServer(
  supabase: SupabaseClient,
  identity: SyncIdentityBoundary,
  planIds: string[],
  single: boolean,
  clockPlanIds: ReadonlySet<string>
): Promise<LivePlanUpsert | null> {
  // The function refuses a call naming more than 100 plans (22023), which left a
  // large sync silently local-only; send the rows in batches it accepts.
  const merged: unknown[] = [];
  let wrote = false;
  for (const batch of batchPlanIds(planIds)) {
    const write = await identity.runIfCurrent(() => {
      const rows = buildMergeRpcRows(
        getLivePushableProgress(batch),
        identity.expectedUserId,
        clockPlanIds,
        new Date().toISOString()
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
      continue;
    }
    const { data, error, status } = await write.value;
    if (isMergeRefusedForAccount(error)) {
      return { status: 'stale' };
    }
    if (!wrote && isMissingMergeRpcError(error, status)) {
      return null;
    }
    if (error || single) {
      return { status: 'done', data: single ? data : merged, error };
    }
    wrote = true;
    merged.push(...(Array.isArray(data) ? data : []));
  }
  return wrote ? { status: 'done', data: merged, error: null } : { status: 'nothing' };
}

/**
 * Writes the live rows for these plans: through the server-side merge when the
 * server has it, otherwise with the upsert. Upserted session ticks go along
 * unless the server is known to lack their columns; when it turns out to lack
 * them the write is retried without, so a release that beats its migration
 * still syncs.
 */
export async function upsertLivePlanProgress(
  supabase: SupabaseClient,
  identity: SyncIdentityBoundary,
  planIds: string[],
  preWrite: Extract<PreWriteMerge, { outcome: 'merged' }>,
  single: boolean
): Promise<LivePlanUpsert> {
  const { sessionColumns } = preWrite;
  // The merge function needs the session columns (it ships after them), so a
  // server known to lack them cannot have it either.
  if (sessionColumns !== false) {
    const merged = await mergeLivePlanProgressOnServer(
      supabase,
      identity,
      planIds,
      single,
      preWrite.clockPlanIds
    );
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
