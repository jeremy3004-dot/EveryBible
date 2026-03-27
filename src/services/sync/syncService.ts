import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import { useProgressStore } from '../../stores/progressStore';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
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

const getLocalReadingSnapshot = (): LocalReadingSnapshot => {
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

const applyMergedReadingState = (
  mergedReading: ReturnType<typeof mergeReadingSnapshot>
): void => {
  useProgressStore.getState().applySyncedProgress(mergedReading.progress);
  useBibleStore.getState().applySyncedReadingPosition({
    bookId: mergedReading.readingPosition.bookId,
    chapter: mergedReading.readingPosition.chapter,
  });
};

const ensureCloudProfile = async (): Promise<SyncResult> => {
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

  const localState = getLocalReadingSnapshot();

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
      applyMergedReadingState(mergedReading);
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
        language: mergedPreferences.preferences.language,
        country_code: mergedPreferences.preferences.countryCode,
        country_name: mergedPreferences.preferences.countryName,
        content_language_code: mergedPreferences.preferences.contentLanguageCode,
        content_language_name: mergedPreferences.preferences.contentLanguageName,
        content_language_native_name: mergedPreferences.preferences.contentLanguageNativeName,
        onboarding_completed: mergedPreferences.preferences.onboardingCompleted,
        chapter_feedback_enabled: mergedPreferences.preferences.chapterFeedbackEnabled,
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
  const progressResult = await syncProgress();
  if (!progressResult.success) {
    return progressResult;
  }

  const preferencesResult = await syncPreferences();
  if (!preferencesResult.success) {
    return preferencesResult;
  }

  return {
    success: true,
    merged: Boolean(progressResult.merged || preferencesResult.merged),
  };
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
    const localState = getLocalReadingSnapshot();

    if (progressData) {
      applyMergedReadingState(mergeReadingSnapshot(localState, progressData));
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

    return { success: true, merged: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
