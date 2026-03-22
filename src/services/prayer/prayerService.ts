import { supabase, isSupabaseConfigured } from '../supabase';
import type { PrayerInteraction, PrayerRequest } from '../supabase/types';

export interface PrayerServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PrayerRequestWithCounts extends PrayerRequest {
  prayed_count: number;
  encouraged_count: number;
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
      .select('request_id, type')
      .in('request_id', requestIds);

    if (interactionsError) {
      return { success: false, error: interactionsError.message };
    }

    const countMap: Record<string, InteractionCounts> = {};
    for (const id of requestIds) {
      countMap[id] = { prayed: 0, encouraged: 0 };
    }

    for (const interaction of interactions ?? []) {
      const counts = countMap[interaction.request_id];
      if (!counts) continue;
      if (interaction.type === 'prayed') {
        counts.prayed += 1;
      } else if (interaction.type === 'encouraged') {
        counts.encouraged += 1;
      }
    }

    const data: PrayerRequestWithCounts[] = (requests as PrayerRequest[]).map((request) => ({
      ...request,
      prayed_count: countMap[request.id]?.prayed ?? 0,
      encouraged_count: countMap[request.id]?.encouraged ?? 0,
    }));

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

// Deletes a prayer request. RLS ensures only the original author can delete.
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
    const { error } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('id', requestId)
      .eq('user_id', user.id);

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

// Returns the aggregated prayed/encouraged counts for a single prayer request.
export async function getInteractionCounts(
  requestId: string
): Promise<PrayerServiceResult<InteractionCounts>> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: { prayed: 0, encouraged: 0 } };
  }

  try {
    const { data, error } = await supabase
      .from('prayer_interactions')
      .select('type')
      .eq('request_id', requestId);

    if (error) {
      return { success: false, error: error.message };
    }

    const counts: InteractionCounts = { prayed: 0, encouraged: 0 };

    for (const row of data ?? []) {
      if (row.type === 'prayed') {
        counts.prayed += 1;
      } else if (row.type === 'encouraged') {
        counts.encouraged += 1;
      }
    }

    return { success: true, data: counts };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
