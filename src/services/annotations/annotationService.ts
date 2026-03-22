import { supabase, isSupabaseConfigured } from '../supabase';
import type { UserAnnotation } from '../supabase/types';

// Composite key that uniquely identifies an annotation's position and type.
// Used for additive merge: same position+type from two sources → pick latest updated_at.
type AnnotationCompositeKey = `${string}|${number}|${number}|${string}`;

const makeCompositeKey = (a: UserAnnotation): AnnotationCompositeKey =>
  `${a.book}|${a.chapter}|${a.verse_start}|${a.type}`;

export interface AnnotationResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SyncAnnotationsResult {
  success: boolean;
  /** Annotations that should be written into local storage after the sync. */
  merged?: UserAnnotation[];
  error?: string;
}

// ---------------------------------------------------------------------------
// fetchAnnotations
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's annotations from Supabase.
 * RLS on user_annotations enforces `user_id = auth.uid()` server-side, so no
 * client-side `.eq('user_id', ...)` filter is needed.
 *
 * @param bookFilter - Optional BSB book abbreviation (e.g. "GEN") to narrow results.
 */
export const fetchAnnotations = async (
  bookFilter?: string
): Promise<AnnotationResult<UserAnnotation[]>> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    let query = supabase
      .from('user_annotations')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (bookFilter) {
      query = query.eq('book', bookFilter);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as UserAnnotation[]) ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// upsertAnnotation
// ---------------------------------------------------------------------------

/**
 * Create or update a single annotation in Supabase.
 * Pass the full annotation shape including `id` for updates.
 * Omit `id` (or pass a client-generated UUID) for new records.
 */
export const upsertAnnotation = async (
  annotation: Omit<UserAnnotation, 'user_id' | 'created_at' | 'updated_at' | 'synced_at'>
): Promise<AnnotationResult<UserAnnotation>> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('user_annotations')
      .upsert(
        {
          ...annotation,
          user_id: user.id,
          updated_at: now,
          synced_at: now,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UserAnnotation };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// softDeleteAnnotation
// ---------------------------------------------------------------------------

/**
 * Soft-delete an annotation by setting `deleted_at` to the current timestamp.
 * The record is retained in Supabase so that other devices can learn about the
 * deletion during the next bidirectional sync.
 */
export const softDeleteAnnotation = async (
  id: string
): Promise<AnnotationResult> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('user_annotations')
      .update({ deleted_at: now, updated_at: now, synced_at: now })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// syncAnnotations
// ---------------------------------------------------------------------------

/**
 * Bidirectional sync between a local annotation list and Supabase.
 *
 * Algorithm:
 * 1. Pull all remote annotations updated since `lastSyncedAt`.
 * 2. Build a map keyed by composite key (book+chapter+verse_start+type).
 * 3. Merge local and remote additiviely: for the same composite key, the
 *    record with the later `updated_at` wins.
 * 4. Push any local annotation that is newer than its remote counterpart
 *    (or has no remote counterpart) to Supabase via upsert.
 * 5. Return the fully merged list so the caller can persist it locally.
 *
 * Deleted annotations (deleted_at != null) flow through the same merge so
 * that deletions propagate across devices.
 *
 * @param localAnnotations - The current local annotation list (may include
 *   soft-deleted records so deletions can be pushed upstream).
 * @param lastSyncedAt - ISO timestamp of the most recent successful sync.
 *   Pass `null` for a full initial sync.
 */
export const syncAnnotations = async (
  localAnnotations: UserAnnotation[],
  lastSyncedAt: string | null
): Promise<SyncAnnotationsResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true, merged: localAnnotations };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user) {
    return { success: true, merged: localAnnotations };
  }

  try {
    // -- Step 1: Pull remote changes since lastSyncedAt ----------------------
    let remoteQuery = supabase.from('user_annotations').select('*');

    if (lastSyncedAt) {
      remoteQuery = remoteQuery.gt('updated_at', lastSyncedAt);
    }

    const { data: remoteData, error: fetchError } = await remoteQuery;

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const remoteAnnotations = (remoteData as UserAnnotation[]) ?? [];

    // -- Step 2: Build composite-key maps ------------------------------------
    // Remote map: composite key → annotation
    const remoteByKey = new Map<AnnotationCompositeKey, UserAnnotation>();
    for (const r of remoteAnnotations) {
      remoteByKey.set(makeCompositeKey(r), r);
    }

    // Local map: composite key → annotation (used for merge)
    const localByKey = new Map<AnnotationCompositeKey, UserAnnotation>();
    for (const l of localAnnotations) {
      localByKey.set(makeCompositeKey(l), l);
    }

    // -- Step 3: Additive merge (latest updated_at wins) ---------------------
    const mergedByKey = new Map<AnnotationCompositeKey, UserAnnotation>();

    // Start with all local entries
    for (const [key, local] of localByKey) {
      mergedByKey.set(key, local);
    }

    // Overlay remote entries where remote is newer
    for (const [key, remote] of remoteByKey) {
      const existing = mergedByKey.get(key);
      if (!existing || remote.updated_at > existing.updated_at) {
        mergedByKey.set(key, remote);
      }
    }

    const merged = Array.from(mergedByKey.values());

    // -- Step 4: Push local annotations that are newer than remote -----------
    const now = new Date().toISOString();
    const toPush: UserAnnotation[] = [];

    for (const local of localAnnotations) {
      const key = makeCompositeKey(local);
      const remote = remoteByKey.get(key);

      if (!remote || local.updated_at > remote.updated_at) {
        toPush.push({ ...local, user_id: user.id, synced_at: now });
      }
    }

    if (toPush.length > 0) {
      const { error: pushError } = await supabase
        .from('user_annotations')
        .upsert(toPush, { onConflict: 'id' });

      if (pushError) {
        // Surface the push error but still return the merged local state so
        // the app remains functional; the next sync will retry.
        return { success: false, error: pushError.message };
      }
    }

    return { success: true, merged };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// getAnnotationsForChapter
// ---------------------------------------------------------------------------

/**
 * Fetch all non-deleted annotations for a specific book and chapter.
 * Results are ordered by verse_start ascending for display in reading order.
 * RLS enforces user scoping server-side.
 */
export const getAnnotationsForChapter = async (
  book: string,
  chapter: number
): Promise<AnnotationResult<UserAnnotation[]>> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const { data, error } = await supabase
      .from('user_annotations')
      .select('*')
      .eq('book', book)
      .eq('chapter', chapter)
      .is('deleted_at', null)
      .order('verse_start', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as UserAnnotation[]) ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};
