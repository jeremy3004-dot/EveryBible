import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import { useAuthStore } from '../../stores/authStore';
import type { UserProgress, UserPreferences } from '../supabase/types';
import {
  mergePreferences,
  mergeReadingSnapshot,
  type LocalPreferenceSnapshot,
  type LocalReadingSnapshot,
} from './syncMerge';

export interface SyncResult {
  success: boolean;
  error?: string;
  merged?: boolean;
}

// Per-sync-cycle memo for ensureCloudProfile so a single syncAll pass upserts
// the profile once instead of up to 4× (progress + reading plans + preferences,
// each of which independently ensured the profile). Reset at the start/end of
// each syncAll cycle.
let ensureCloudProfileCycle: Promise<SyncResult> | null = null;

// One bounded retry with jitter for transient network errors. Non-network
// failures (RLS, validation, PGRST codes) are returned immediately so we do not
// mask genuine errors behind a retry.
const isTransientSyncError = (error?: string): boolean => {
  if (!error) return false;
  return /network|timeout|timed out|fetch failed|connection|ECONN|ENOTFOUND|502|503|504/i.test(
    error
  );
};

const withTransientRetry = async (run: () => Promise<SyncResult>): Promise<SyncResult> => {
  const first = await run();
  if (first.success || !isTransientSyncError(first.error)) {
    return first;
  }

  // Jittered backoff: 250–750ms.
  const delayMs = 250 + Math.floor(Math.random() * 500);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
};

const getLocalReadingSnapshot = async (): Promise<LocalReadingSnapshot> => {
  const [{ useProgressStore }, { useBibleStore }] = await Promise.all([
    import('../../stores/progressStore'),
    import('../../stores/bibleStore'),
  ]);
  const progressState = useProgressStore.getState();
  const bibleState = useBibleStore.getState();

  return {
    chaptersRead: progressState.chaptersRead,
    streakDays: progressState.streakDays,
    lastReadDate: progressState.lastReadDate,
    currentBook: bibleState.currentBook,
    currentChapter: bibleState.currentChapter,
  };
};

const getLocalPreferenceSnapshot = (): LocalPreferenceSnapshot => {
  const authState = useAuthStore.getState();

  return {
    preferences: authState.preferences,
    updatedAt: authState.preferencesUpdatedAt,
  };
};

const syncReadingPlans = async (): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: true };
  }

  const profileResult = await ensureCloudProfile();
  if (!profileResult.success) {
    return profileResult;
  }

  const [{ readingPlansStore }, { syncPlanProgress }] = await Promise.all([
    import('../../stores/readingPlansStore'),
    import('../plans'),
  ]);

  const localProgress = Object.values(readingPlansStore.getState().progressByPlanId);
  const result = await syncPlanProgress(localProgress);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, merged: false };
};

const pullReadingPlansFromCloud = async (): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  const profileResult = await ensureCloudProfile();
  if (!profileResult.success) {
    return profileResult;
  }

  const { getUserPlanProgress } = await import('../plans');
  const result = await getUserPlanProgress();
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, merged: Boolean(result.data?.length) };
};

const applyMergedReadingState = async (
  mergedReading: ReturnType<typeof mergeReadingSnapshot>
): Promise<void> => {
  const [{ useProgressStore }, { useBibleStore }] = await Promise.all([
    import('../../stores/progressStore'),
    import('../../stores/bibleStore'),
  ]);

  useProgressStore.getState().applySyncedProgress(mergedReading.progress);
  useBibleStore.getState().applySyncedReadingPosition({
    bookId: mergedReading.readingPosition.bookId,
    chapter: mergedReading.readingPosition.chapter,
  });
};

const ensureCloudProfile = async (): Promise<SyncResult> => {
  // Within a syncAll cycle, reuse the in-flight/completed profile upsert so the
  // three sub-syncs don't each hit the network. A failed ensure is not cached so
  // a later sub-sync can retry it.
  if (ensureCloudProfileCycle) {
    const cached = await ensureCloudProfileCycle;
    if (cached.success) {
      return cached;
    }
  }

  const pending = ensureCloudProfileImpl();
  ensureCloudProfileCycle = pending;
  const result = await pending;
  if (!result.success && ensureCloudProfileCycle === pending) {
    ensureCloudProfileCycle = null;
  }
  return result;
};

const ensureCloudProfileImpl = async (): Promise<SyncResult> => {
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

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
};

export const syncProgress = async (): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: true };
  }

  const profileResult = await ensureCloudProfile();
  if (!profileResult.success) {
    return profileResult;
  }

  const localState = await getLocalReadingSnapshot();

  try {
    const { data, error: fetchError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return { success: false, error: fetchError.message };
    }

    const remoteData = data as UserProgress | null;
    const mergedReading = mergeReadingSnapshot(localState, remoteData);

    if (mergedReading.changed) {
      await applyMergedReadingState(mergedReading);
    }

    const { error: upsertError } = await supabase.from('user_progress').upsert(
      {
        user_id: userId,
        chapters_read: mergedReading.progress.chaptersRead,
        streak_days: mergedReading.progress.streakDays,
        last_read_date: mergedReading.progress.lastReadDate,
        current_book: mergedReading.readingPosition.bookId,
        current_chapter: mergedReading.readingPosition.chapter,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true, merged: mergedReading.changed };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const syncPreferences = async (): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: true };
  }

  const profileResult = await ensureCloudProfile();
  if (!profileResult.success) {
    return profileResult;
  }

  try {
    const localSnapshot = getLocalPreferenceSnapshot();
    const { data, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return { success: false, error: fetchError.message };
    }

    const remotePreferences = data as UserPreferences | null;
    const mergedPreferences = mergePreferences(localSnapshot, remotePreferences);

    if (mergedPreferences.source === 'remote') {
      useAuthStore
        .getState()
        .applySyncedPreferences(mergedPreferences.preferences, mergedPreferences.updatedAt);

      return {
        success: true,
        merged: mergedPreferences.changed || mergedPreferences.updatedAt !== localSnapshot.updatedAt,
      };
    }

    const syncedAt = new Date().toISOString();
    const { error: upsertError } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        font_size: mergedPreferences.preferences.fontSize,
        theme: mergedPreferences.preferences.theme,
        appearance_palette: mergedPreferences.preferences.appearancePalette,
        language: mergedPreferences.preferences.language,
        country_code: mergedPreferences.preferences.countryCode,
        country_name: mergedPreferences.preferences.countryName,
        content_language_code: mergedPreferences.preferences.contentLanguageCode,
        content_language_name: mergedPreferences.preferences.contentLanguageName,
        content_language_native_name: mergedPreferences.preferences.contentLanguageNativeName,
        chapter_feedback_name: mergedPreferences.preferences.chapterFeedbackName,
        chapter_feedback_role: mergedPreferences.preferences.chapterFeedbackRole,
        onboarding_completed: mergedPreferences.preferences.onboardingCompleted,
        chapter_feedback_enabled: mergedPreferences.preferences.chapterFeedbackEnabled,
        hide_play_button_from_reading_tab:
          mergedPreferences.preferences.hidePlayButtonFromReadingTab,
        notifications_enabled: mergedPreferences.preferences.notificationsEnabled,
        reminder_time: mergedPreferences.preferences.reminderTime,
        synced_at: syncedAt,
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    useAuthStore.getState().applySyncedPreferences(mergedPreferences.preferences, syncedAt);

    return {
      success: true,
      merged:
        mergedPreferences.changed ||
        remotePreferences?.synced_at !== localSnapshot.updatedAt ||
        localSnapshot.updatedAt !== syncedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const syncAll = async (): Promise<SyncResult> => {
  // Fresh profile-ensure memo for this cycle so ensureCloudProfile runs once.
  ensureCloudProfileCycle = null;

  try {
    // Run each sub-sync independently so one transient failure doesn't skip the
    // rest until the next external trigger (L18). Each gets one bounded retry.
    const results = await Promise.all([
      withTransientRetry(syncProgress),
      withTransientRetry(syncReadingPlans),
      withTransientRetry(syncPreferences),
    ]);

    const firstFailure = results.find((result) => !result.success);
    return {
      success: !firstFailure,
      error: firstFailure?.error,
      merged: results.some((result) => result.merged),
    };
  } finally {
    ensureCloudProfileCycle = null;
  }
};

export const pullFromCloud = async (): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  const profileResult = await ensureCloudProfile();
  if (!profileResult.success) {
    return profileResult;
  }

  try {
    const { data: progressDataRaw, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (progressError && progressError.code !== 'PGRST116') {
      return { success: false, error: progressError.message };
    }

    const progressData = progressDataRaw as UserProgress | null;
    const localState = await getLocalReadingSnapshot();

    if (progressData) {
      await applyMergedReadingState(mergeReadingSnapshot(localState, progressData));
    }

    const { data: prefsDataRaw, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      return { success: false, error: prefsError.message };
    }

    const prefsData = prefsDataRaw as UserPreferences | null;

    if (prefsData) {
      const mergedPreferences = mergePreferences(getLocalPreferenceSnapshot(), prefsData);
      useAuthStore
        .getState()
        .applySyncedPreferences(mergedPreferences.preferences, mergedPreferences.updatedAt);
    }

    const readingPlansResult = await pullReadingPlansFromCloud();
    if (!readingPlansResult.success) {
      return readingPlansResult;
    }

    return { success: true, merged: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
