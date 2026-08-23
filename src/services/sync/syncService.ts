import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import { useAuthStore } from '../../stores/authStore';
import type { UserProgress, UserPreferences } from '../supabase/types';
import {
  mergePreferences,
  mergeReadingSnapshot,
  type LocalPreferenceSnapshot,
  type LocalReadingSnapshot,
} from './syncMerge';
import {
  createSyncIdentityBoundary,
  createSyncCycleCache,
  STALE_SYNC_ERROR,
  type SyncIdentityBoundary,
} from './syncIdentity';
import { runSyncCycleSubsyncs } from './syncCycle';

export interface SyncResult {
  success: boolean;
  error?: string;
  merged?: boolean;
}

// Per-user memo for ensureCloudProfile so concurrent sub-syncs share one
// profile upsert without allowing account A's promise to be reused by B.
const ensureCloudProfileCycles = createSyncCycleCache<SyncResult>();
const activeSyncAllCycles = new Map<string, number>();

const getSyncCycleKey = (identity: SyncIdentityBoundary): string =>
  `${identity.expectedUserId}:${identity.expectedGeneration ?? 'legacy'}`;

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

const getAuthGeneration = (): number => useAuthStore.getState().authGeneration;

const staleSyncResult = (): SyncResult => ({
  success: false,
  error: STALE_SYNC_ERROR,
});

const captureSyncIdentity = async (
  expectedUserId?: string,
  expectedGeneration?: number
): Promise<SyncIdentityBoundary | null> => {
  const candidate = expectedUserId ?? useAuthStore.getState().user?.uid ?? null;
  if (!candidate) {
    return null;
  }

  const generation = expectedGeneration ?? getAuthGeneration();

  if (useAuthStore.getState().user?.uid !== candidate) {
    return null;
  }

  const liveUserId = await getCurrentUserId();
  if (liveUserId !== candidate || useAuthStore.getState().user?.uid !== candidate) {
    return null;
  }

  const boundary = createSyncIdentityBoundary(
    candidate,
    () => useAuthStore.getState().user?.uid ?? null,
    generation,
    getAuthGeneration
  );

  return (await boundary.isCurrent()) ? boundary : null;
};

const syncReadingPlansForIdentity = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
  if (!profileResult.success) {
    return profileResult;
  }

  const stores = await Promise.all([import('../../stores/readingPlansStore'), import('../plans')]);
  if (!(await identity.isCurrent())) {
    return staleSyncResult();
  }

  const [{ readingPlansStore }, { syncPlanProgress }] = stores;
  const localProgress = Object.values(readingPlansStore.getState().progressByPlanId);
  const result = await syncPlanProgress(
    localProgress,
    userId,
    identity.expectedGeneration,
    identity
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!(await identity.isCurrent())) {
    return staleSyncResult();
  }

  return { success: true, merged: false };
};

const pullReadingPlansFromCloud = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const { getUserPlanProgress } = await import('../plans');
  if (!(await identity.isCurrent())) {
    return staleSyncResult();
  }

  const result = await getUserPlanProgress(
    undefined,
    identity.expectedUserId,
    identity.expectedGeneration,
    identity
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!(await identity.isCurrent())) {
    return staleSyncResult();
  }

  return { success: true, merged: Boolean(result.data?.length) };
};

const applyMergedReadingState = async (
  mergedReading: ReturnType<typeof mergeReadingSnapshot>,
  identity: SyncIdentityBoundary
): Promise<boolean> => {
  const [{ useProgressStore }, { useBibleStore }] = await Promise.all([
    import('../../stores/progressStore'),
    import('../../stores/bibleStore'),
  ]);

  const result = await identity.runIfCurrent(() => {
    useProgressStore.getState().applySyncedProgress(mergedReading.progress);
    useBibleStore.getState().applySyncedReadingPosition({
      bookId: mergedReading.readingPosition.bookId,
      chapter: mergedReading.readingPosition.chapter,
    });
  });

  if (!result.applied) {
    return false;
  }

  return true;
};

const ensureCloudProfile = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  // Only retain the memo while at least one syncAll cycle is active. A failed
  // ensure is evicted by the cache so a later sub-sync can retry it.
  const cycleKey = getSyncCycleKey(identity);
  if (!activeSyncAllCycles.has(cycleKey)) {
    return ensureCloudProfileImpl(identity);
  }

  const result = await ensureCloudProfileCycles.getOrCreate(cycleKey, () =>
    ensureCloudProfileImpl(identity)
  );
  if (!result.success) {
    // Do not retain normal profile errors as a successful-cycle memo: the
    // bounded sub-sync retry must be able to attempt the profile again.
    ensureCloudProfileCycles.clear(cycleKey);
  }
  return result;
};

const ensureCloudProfileImpl = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { success: false, error: userError.message };
  }

  if (!user || user.id !== identity.expectedUserId || !(await identity.isCurrent())) {
    return staleSyncResult();
  }

  const write = await identity.runIfCurrent(() =>
    supabase.from('profiles').upsert(
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
    )
  );

  if (!write.applied) {
    return staleSyncResult();
  }

  const { error } = await write.value!;

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
};

const syncProgressForIdentity = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
  if (!profileResult.success) {
    return profileResult;
  }

  const localState = await getLocalReadingSnapshot();
  if (!(await identity.isCurrent())) {
    return staleSyncResult();
  }

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
      const applied = await applyMergedReadingState(mergedReading, identity);
      if (!applied) {
        return staleSyncResult();
      }
    }

    const write = await identity.runIfCurrent(() =>
      supabase.from('user_progress').upsert(
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
      )
    );

    if (!write.applied) {
      return staleSyncResult();
    }

    const { error: upsertError } = await write.value!;

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

export const syncProgress = async (
  expectedUserId?: string,
  expectedGeneration?: number
): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const identity = await captureSyncIdentity(expectedUserId, expectedGeneration);
  if (!identity) {
    return expectedUserId ? staleSyncResult() : { success: true };
  }

  return syncProgressForIdentity(identity);
};

const syncPreferencesForIdentity = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
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

    if (!(await identity.isCurrent())) {
      return staleSyncResult();
    }

    const remotePreferences = data as UserPreferences | null;
    const mergedPreferences = mergePreferences(localSnapshot, remotePreferences);

    if (mergedPreferences.source === 'remote') {
      const applied = await identity.runIfCurrent(() =>
        useAuthStore
          .getState()
          .applySyncedPreferences(mergedPreferences.preferences, mergedPreferences.updatedAt)
      );
      if (!applied.applied) {
        return staleSyncResult();
      }

      return {
        success: true,
        merged:
          mergedPreferences.changed || mergedPreferences.updatedAt !== localSnapshot.updatedAt,
      };
    }

    const syncedAt = new Date().toISOString();
    const write = await identity.runIfCurrent(() =>
      supabase.from('user_preferences').upsert(
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
      )
    );

    if (!write.applied) {
      return staleSyncResult();
    }

    const { error: upsertError } = await write.value!;

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    const applied = await identity.runIfCurrent(() =>
      useAuthStore.getState().applySyncedPreferences(mergedPreferences.preferences, syncedAt)
    );
    if (!applied.applied) {
      return staleSyncResult();
    }

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

export const syncPreferences = async (
  expectedUserId?: string,
  expectedGeneration?: number
): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const identity = await captureSyncIdentity(expectedUserId, expectedGeneration);
  if (!identity) {
    return expectedUserId ? staleSyncResult() : { success: true };
  }

  return syncPreferencesForIdentity(identity);
};

export const syncAll = async (
  expectedUserId?: string,
  expectedGeneration?: number
): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  let cycleKey: string | null = null;

  try {
    const cycle = await runSyncCycleSubsyncs(
      () => captureSyncIdentity(expectedUserId, expectedGeneration),
      {
        progress: syncProgressForIdentity,
        readingPlans: syncReadingPlansForIdentity,
        preferences: syncPreferencesForIdentity,
      },
      withTransientRetry,
      (identity) => {
        cycleKey = getSyncCycleKey(identity);
        activeSyncAllCycles.set(cycleKey, (activeSyncAllCycles.get(cycleKey) ?? 0) + 1);
      }
    );
    if (!cycle.identity) {
      return expectedUserId ? staleSyncResult() : { success: true };
    }

    const { identity, results } = cycle;

    const firstFailure = results.find((result) => !result.success);
    if (!(await identity.isCurrent())) {
      return staleSyncResult();
    }

    return {
      success: !firstFailure,
      error: firstFailure?.error,
      merged: results.some((result) => result.merged),
    };
  } finally {
    if (cycleKey) {
      const remaining = (activeSyncAllCycles.get(cycleKey) ?? 1) - 1;
      if (remaining > 0) {
        activeSyncAllCycles.set(cycleKey, remaining);
      } else {
        activeSyncAllCycles.delete(cycleKey);
        ensureCloudProfileCycles.clear(cycleKey);
      }
    }
  }
};

export const pullFromCloud = async (expectedUserId?: string): Promise<SyncResult> => {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const identity = await captureSyncIdentity(expectedUserId);
  if (!identity) {
    return staleSyncResult();
  }

  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
  if (!profileResult.success) {
    return profileResult;
  }

  if (!(await identity.isCurrent())) {
    return staleSyncResult();
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
      const applied = await applyMergedReadingState(
        mergeReadingSnapshot(localState, progressData),
        identity
      );
      if (!applied) {
        return staleSyncResult();
      }
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
      if (!(await identity.isCurrent())) {
        return staleSyncResult();
      }

      const mergedPreferences = mergePreferences(getLocalPreferenceSnapshot(), prefsData);
      const applied = await identity.runIfCurrent(() =>
        useAuthStore
          .getState()
          .applySyncedPreferences(mergedPreferences.preferences, mergedPreferences.updatedAt)
      );
      if (!applied.applied) {
        return staleSyncResult();
      }
    }

    if (!(await identity.isCurrent())) {
      return staleSyncResult();
    }

    const readingPlansResult = await pullReadingPlansFromCloud(identity);
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
