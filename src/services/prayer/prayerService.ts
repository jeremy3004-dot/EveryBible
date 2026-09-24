import { supabase, isSupabaseConfigured } from '../supabase';
import type { PrayerInteraction, PrayerRequest } from '../supabase/types';
import {
  aggregateInteractionCounts,
  attachCountsToPrayerRequests,
  prayerWriteErrorCode,
  viewerInteractionsByRequest,
  type PrayerReportReason,
  type PrayerWriteErrorCode,
} from './prayerModel';

export interface PrayerServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  /** Set when the server refused a write for a reason the wall explains to the member. */
  code?: PrayerWriteErrorCode;
}

export interface PrayerRequestWithCounts extends PrayerRequest {
  prayed_count: number;
  encouraged_count: number;
  /** Whether the signed-in viewer has already prayed for / encouraged this request. */
  viewer_prayed: boolean;
  viewer_encouraged: boolean;
}

/** A failed write, with the code for a refusal the wall can explain (see prayerModel). */
function writeFailure(message: string): PrayerServiceResult<never> {
  const code = prayerWriteErrorCode(message);
  return code ? { success: false, error: message, code } : { success: false, error: message };
}

export interface InteractionCounts {
  prayed: number;
  encouraged: number;
}

/** Where the next page starts: the last row of the previous one (the wall is newest first). */
export interface PrayerRequestCursor {
  created_at: string;
  id: string;
}

export interface ListPrayerRequestsOptions {
  /** Requests per page, 1 to 100. */
  limit?: number;
  /** The `nextCursor` of the previous page; omitted for the first page. */
  before?: PrayerRequestCursor | null;
}

export interface PrayerRequestPageResult extends PrayerServiceResult<PrayerRequestWithCounts[]> {
  /** Set when there are older requests to load. */
  nextCursor?: PrayerRequestCursor | null;
}

export const PRAYER_REQUEST_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
// PostgREST's max-rows: a longer response is cut short without an error.
const POSTGREST_MAX_ROWS = 1000;

type ListRpcRow = PrayerRequest & {
  prayed_count: number;
  encouraged_count: number;
  viewer_has_prayed: boolean;
  viewer_has_encouraged: boolean;
};

// PGRST202: not in PostgREST's schema cache. 42883: no such function in Postgres. Either way the
// migration adding list_prayer_requests is not live yet, so the old queries are used instead.
function isMissingListRpc(error: { code?: string } | null, status: number | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883' || status === 404;
}

// Returns one page of a group's prayer requests, newest first, with interaction counts and
// whether the viewer has prayed for / encouraged each one. The list_prayer_requests RPC counts in
// the database; reading the interaction rows instead was cut off at PostgREST's 1000 rows, which
// made counts and the viewer flags wrong in large groups. RLS applies either way.
// Unauthenticated callers (browsing without sign-in) receive an empty list.
export async function listPrayerRequests(
  groupId: string,
  options: ListPrayerRequestsOptions = {}
): Promise<PrayerRequestPageResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [], nextCursor: null };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: true, data: [], nextCursor: null };
  }

  const limit = Math.min(
    Math.max(Math.floor(options.limit ?? PRAYER_REQUEST_PAGE_SIZE), 1),
    MAX_PAGE_SIZE
  );
  const before = options.before ?? null;

  try {
    // One extra row says whether another page exists.
    const {
      data: rows,
      error: rpcError,
      status,
    } = await supabase.rpc('list_prayer_requests', {
      p_group_id: groupId,
      p_limit: limit + 1,
      p_before_created_at: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
    });

    let requests: PrayerRequestWithCounts[];
    if (!rpcError) {
      requests = ((rows ?? []) as ListRpcRow[]).map(
        ({ viewer_has_prayed, viewer_has_encouraged, ...row }) => ({
          ...row,
          viewer_prayed: viewer_has_prayed,
          viewer_encouraged: viewer_has_encouraged,
        })
      );
    } else if (isMissingListRpc(rpcError, status)) {
      const fallback = await listPrayerRequestsWithoutRpc(groupId, user.id, limit + 1, before);
      if (!fallback.success) return fallback;
      requests = fallback.data ?? [];
    } else {
      return { success: false, error: rpcError.message };
    }

    const hasMore = requests.length > limit;
    const data = hasMore ? requests.slice(0, limit) : requests;
    const last = data[data.length - 1];
    return {
      success: true,
      data,
      nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// The path used before list_prayer_requests existed: read the page of requests, then their
// interaction rows (in PostgREST-sized pages), and count on the device.
async function listPrayerRequestsWithoutRpc(
  groupId: string,
  viewerId: string,
  limit: number,
  before: PrayerRequestCursor | null
): Promise<PrayerServiceResult<PrayerRequestWithCounts[]>> {
  let query = supabase
    .from('prayer_requests')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (before) {
    const createdAt = JSON.stringify(before.created_at);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${JSON.stringify(before.id)})`
    );
  }
  const { data: requests, error: requestsError } = await query.limit(limit);

  if (requestsError) {
    return { success: false, error: requestsError.message };
  }

  if (!requests || requests.length === 0) {
    return { success: true, data: [] };
  }

  const requestIds = requests.map((r) => r.id);
  const interactions: Array<{ request_id: string; type: string; user_id?: string }> = [];

  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const { data: page, error: interactionsError } = await supabase
      .from('prayer_interactions')
      .select('request_id, type, user_id')
      .in('request_id', requestIds)
      .order('id')
      .range(from, from + POSTGREST_MAX_ROWS - 1);

    if (interactionsError) {
      return { success: false, error: interactionsError.message };
    }

    interactions.push(...(page ?? []));
    if (!page || page.length < POSTGREST_MAX_ROWS) break;
  }

  const countMap = aggregateInteractionCounts(requestIds, interactions);
  const viewerMap = viewerInteractionsByRequest(viewerId, interactions);
  return {
    success: true,
    data: attachCountsToPrayerRequests(requests as PrayerRequest[], countMap, viewerMap),
  };
}

// Submits a new prayer request scoped to a group.
export async function createPrayerRequest(
  groupId: string,
  content: string
): Promise<PrayerServiceResult<PrayerRequest>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to submit a prayer request' };
  }

  try {
    const { data, error } = await supabase
      .from('prayer_requests')
      .insert({
        group_id: groupId,
        user_id: user.id,
        content: content.trim(),
        is_answered: false,
      })
      .select('*')
      .single();

    if (error) {
      return writeFailure(error.message);
    }

    return { success: true, data: data as PrayerRequest };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Updates the text content of an existing prayer request.
// RLS on the server ensures only the original author can edit.
export async function updatePrayerRequest(
  requestId: string,
  content: string
): Promise<PrayerServiceResult<PrayerRequest>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to edit a prayer request' };
  }

  try {
    const { data, error } = await supabase
      .from('prayer_requests')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      return writeFailure(error.message);
    }

    return { success: true, data: data as PrayerRequest };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Marks a prayer request as answered, recording the timestamp.
export async function markPrayerAnswered(
  requestId: string
): Promise<PrayerServiceResult<PrayerRequest>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to mark a prayer as answered' };
  }

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('prayer_requests')
      .update({ is_answered: true, answered_at: now, updated_at: now })
      .eq('id', requestId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PrayerRequest };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Deletes a prayer request. RLS lets the author delete their own request and the group
// leader delete any request in their group, so the query filters by id alone. RLS hides a
// refused delete as "0 rows", so that case is reported as a failure.
export async function deletePrayerRequest(requestId: string): Promise<PrayerServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to delete a prayer request' };
  }

  try {
    const { data, error } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('id', requestId)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Prayer request was not deleted' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Adds a 'prayed' or 'encouraged' interaction for the current user.
// The prayer_interactions table enforces a unique constraint on (request_id, user_id, type),
// so duplicate interactions are silently ignored.
export async function addInteraction(
  requestId: string,
  type: 'prayed' | 'encouraged'
): Promise<PrayerServiceResult<PrayerInteraction>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to interact with a prayer request' };
  }

  try {
    const { data, error } = await supabase
      .from('prayer_interactions')
      .upsert(
        { request_id: requestId, user_id: user.id, type },
        { onConflict: 'request_id,user_id,type', ignoreDuplicates: true }
      )
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as PrayerInteraction | null) ?? undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Removes the current user's own 'prayed' or 'encouraged' interaction.
export async function removeInteraction(
  requestId: string,
  type: 'prayed' | 'encouraged'
): Promise<PrayerServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to remove an interaction' };
  }

  try {
    const { error } = await supabase
      .from('prayer_interactions')
      .delete()
      .eq('request_id', requestId)
      .eq('user_id', user.id)
      .eq('type', type);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Reports a request to the EveryBible team (report_prayer_request RPC). The server hides it
// from the reporter at once and from the whole group after 3 members report it.
export async function reportPrayerRequest(
  requestId: string,
  reason: PrayerReportReason,
  note?: string
): Promise<PrayerServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to report a prayer request' };
  }

  try {
    const { error } = await supabase.rpc('report_prayer_request', {
      p_request_id: requestId,
      p_reason: reason,
      p_note: note?.trim() || null,
    });

    if (error) {
      return writeFailure(error.message);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Blocks (or unblocks) another member for the signed-in user only. RLS on prayer_requests
// then hides the blocked member's requests from the blocker; the blocked member is not told.
async function setBlocked(userId: string, blocked: boolean): Promise<PrayerServiceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to block someone' };
  }

  if (user.id === userId) {
    return { success: false, error: 'You cannot block yourself' };
  }

  try {
    const { error } = blocked
      ? await supabase
          .from('user_blocks')
          .upsert(
            { blocker_id: user.id, blocked_id: userId },
            { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
          )
      : await supabase
          .from('user_blocks')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function blockUser(userId: string): Promise<PrayerServiceResult> {
  return setBlocked(userId, true);
}

export function unblockUser(userId: string): Promise<PrayerServiceResult> {
  return setBlocked(userId, false);
}
