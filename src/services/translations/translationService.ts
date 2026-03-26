import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import type {
  TranslationCatalogEntry,
  TranslationVersion,
  UserTranslationPreferences,
} from '../supabase/types';
import {
  buildCatalogLanguageFilters,
  filterCatalogEntriesByLanguage,
  mapCatalogEntryToBibleTranslation,
  normalizeCatalogEntries,
} from './translationCatalogModel';

export {
  buildCatalogLanguageFilters,
  filterCatalogEntriesByLanguage,
  mapCatalogEntryToBibleTranslation,
} from './translationCatalogModel';

export interface TranslationServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranslationPreferencesInput {
  primary?: string;
  secondary?: string | null;
  audio?: string | null;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

/**
 * Get all available translations from the catalog.
 * Returns an empty array when Supabase is not configured so callers can
 * fall back to bundled/default content without crashing.
 */
export const listAvailableTranslations = async (): Promise<
  TranslationServiceResult<TranslationCatalogEntry[]>
> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('translation_catalog')
      .select('*')
      .eq('is_available', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: normalizeCatalogEntries((data as TranslationCatalogEntry[]) ?? []) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ─── Versions ─────────────────────────────────────────────────────────────────

/**
 * Get the full version history for a translation, newest first.
 */
export const getTranslationVersions = async (
  translationId: string
): Promise<TranslationServiceResult<TranslationVersion[]>> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('translation_versions')
      .select('*')
      .eq('translation_id', translationId)
      .order('version_number', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as TranslationVersion[]) ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Get the single version row that is currently marked as current for a
 * translation. Returns null data when none is found (not an error).
 */
export const getCurrentVersion = async (
  translationId: string
): Promise<TranslationServiceResult<TranslationVersion | null>> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: null };
  }

  try {
    const { data, error } = await supabase
      .from('translation_versions')
      .select('*')
      .eq('translation_id', translationId)
      .eq('is_current', true)
      .single();

    if (error) {
      // PGRST116 = no rows found – not a real error for this query
      if (error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: data as TranslationVersion };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ─── User Preferences ─────────────────────────────────────────────────────────

/**
 * Get the current user's translation preferences from Supabase.
 * Returns null data when the user has not yet set preferences.
 */
export const getUserTranslationPreferences = async (): Promise<
  TranslationServiceResult<UserTranslationPreferences | null>
> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: null };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const { data, error } = await supabase
      .from('user_translation_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UserTranslationPreferences };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Persist the user's translation preferences to Supabase, creating or
 * updating the row as needed. Only the fields supplied in `prefs` are
 * changed; omitting a field leaves it unchanged in the database.
 */
export const setUserTranslationPreferences = async (
  prefs: TranslationPreferencesInput
): Promise<TranslationServiceResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    // Fetch current row so we can merge – upsert requires all non-nullable cols.
    const { data: existing } = await supabase
      .from('user_translation_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    const current = existing as UserTranslationPreferences | null;

    const upsertPayload = {
      user_id: userId,
      // Fall back to existing value, then a safe default for primary only
      primary_translation: prefs.primary ?? current?.primary_translation ?? 'BSB',
      secondary_translation:
        prefs.secondary !== undefined ? prefs.secondary : (current?.secondary_translation ?? null),
      audio_translation:
        prefs.audio !== undefined ? prefs.audio : (current?.audio_translation ?? null),
      synced_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_translation_preferences')
      .upsert(upsertPayload, { onConflict: 'user_id' });

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

/**
 * Two-way sync of translation preferences between a local snapshot and the
 * remote row. Remote wins on conflict (last-write-wins via synced_at).
 * Returns the resolved preferences so the caller can update local state.
 */
export const syncTranslationPreferences = async (
  localPrefs: TranslationPreferencesInput & { syncedAt?: string }
): Promise<TranslationServiceResult<UserTranslationPreferences | null>> => {
  if (!isSupabaseConfigured()) {
    return { success: true, data: null };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: true, data: null };
  }

  try {
    const { data: remoteRaw, error: fetchError } = await supabase
      .from('user_translation_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return { success: false, error: fetchError.message };
    }

    const remote = remoteRaw as UserTranslationPreferences | null;

    // Remote is newer – apply it and report back without writing
    if (remote && localPrefs.syncedAt && remote.synced_at > localPrefs.syncedAt) {
      return { success: true, data: remote };
    }

    // Local is newer or no remote row – push local state up
    const syncedAt = new Date().toISOString();
    const upsertPayload = {
      user_id: userId,
      primary_translation: localPrefs.primary ?? remote?.primary_translation ?? 'BSB',
      secondary_translation:
        localPrefs.secondary !== undefined
          ? localPrefs.secondary
          : (remote?.secondary_translation ?? null),
      audio_translation:
        localPrefs.audio !== undefined ? localPrefs.audio : (remote?.audio_translation ?? null),
      synced_at: syncedAt,
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('user_translation_preferences')
      .upsert(upsertPayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true, data: upserted as UserTranslationPreferences };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};
