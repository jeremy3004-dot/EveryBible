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

// Returns all prayer requests for a group, with aggregated interaction counts.
// Unauthenticated callers (browsing without sign-in) receive an empty list.
export async function listPrayerRequests(
  groupId: string
): Promise<PrayerServiceResult<PrayerRequestWithCounts[]>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!user) {
    return { success: true, data: [] };
  }

  try {
    const { data: requests, error: requestsError } = await supabase
      .from('prayer_requests')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (requestsError) {
      return { success: false, error: requestsError.message };
    }

    if (!requests || requests.length === 0) {
      return { success: true, data: [] };
    }

    const requestIds = requests.map((r) => r.id);

    const { data: interactions, error: interactionsError } = await supabase
      .from('prayer_interactions')
      .select('request_id, type, user_id')
      .in('request_id', requestIds);

    if (interactionsError) {
      return { success: false, error: interactionsError.message };
    }

    const countMap = aggregateInteractionCounts(requestIds, interactions ?? []);
    const viewerMap = viewerInteractionsByRequest(user.id, interactions ?? []);
    const data = attachCountsToPrayerRequests(requests as PrayerRequest[], countMap, viewerMap);

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
