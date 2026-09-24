import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import { useAuthStore } from '../../stores/authStore';
import type { UserProgress, UserPreferences } from '../supabase/types';
import {
  mapRemotePreferences,
  mergePreferences,
  mergeReadingSnapshot,
  readingMatchesRemote,
  readRemoteFieldStamps,
  toRemoteFieldStamps,
  type LocalPreferenceSnapshot,
  type PreferenceMergeResult,
} from './syncMerge';
import {
  createSyncIdentityBoundary,
  createSyncCycleCache,
  STALE_SYNC_ERROR,
  type SyncIdentityBoundary,
} from './syncIdentity';
import { createSyncOperationQueue, runSyncCycleSubsyncs } from './syncCycle';

export interface SyncResult {
  success: boolean;
  error?: string;
  merged?: boolean;
}

// Per-user memo for ensureCloudProfile so concurrent sub-syncs share one
// profile upsert without allowing account A's promise to be reused by B.
const ensureCloudProfileCycles = createSyncCycleCache<SyncResult>();
const activeSyncAllCycles = new Map<string, number>();
const queueProgressSync = createSyncOperationQueue();
const queuePreferenceSync = createSyncOperationQueue();

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

const getLocalPreferenceSnapshot = (): LocalPreferenceSnapshot => {
  const authState = useAuthStore.getState();

  return {
    preferences: authState.preferences,
    updatedAt: authState.preferencesUpdatedAt,
    base: authState.preferencesSyncBase ?? null,
    fieldStamps: authState.preferenceFieldStamps ?? {},
  };
};

/**
 * PostgREST's answer to a payload naming a column the database does not have
 * (PGRST204), or Postgres's (42703). The app can ship before the migration that
 * adds `field_updated_at` is applied; the upload then falls back to the legacy
 * payload instead of failing every preference sync.
 */
const isMissingFieldStampColumn = (error: { code?: string; message?: string } | null): boolean =>
  Boolean(
    error &&
    (error.code === 'PGRST204' || error.code === '42703') &&
    /field_updated_at/.test(error.message ?? '')
  );

/**
 * Applies a merge result to the store. A 'merged' result is shown locally at
 * once, but its sync base stays the server's copy until the upload lands: if the
 * upload fails, the next sync must still see these fields as local edits to
 * push, not as the server reverting them.
 */
const applyPreferenceMergeLocally = (
  merge: PreferenceMergeResult,
  localSnapshot: LocalPreferenceSnapshot
): void => {
  const fieldStamps = merge.fieldStamps ?? undefined;
  if (merge.source === 'remote') {
    useAuthStore
      .getState()
      .applySyncedPreferences(merge.preferences, merge.updatedAt, undefined, fieldStamps);
  } else if (merge.source === 'merged' && merge.remotePreferences) {
    useAuthStore
      .getState()
      .applySyncedPreferences(
        merge.preferences,
        localSnapshot.updatedAt,
        merge.remotePreferences,
        fieldStamps
      );
  }
};

const PROGRESS_MERGE_RPC = 'merge_user_progress';

/**
 * PostgREST (PGRST202, HTTP 404) or Postgres (42883) reporting that the merge
 * function does not exist: the app shipped before migration 20260924041000.
 */
const isMissingMergeRpcError = (
  error: { code?: string } | null | undefined,
  httpStatus: number | undefined
): boolean =>
  Boolean(error) && (error?.code === 'PGRST202' || error?.code === '42883' || httpStatus === 404);

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
  remoteData: UserProgress | null,
  identity: SyncIdentityBoundary
): Promise<ReturnType<typeof mergeReadingSnapshot> | null> => {
  const [{ useProgressStore }, { useBibleStore }] = await Promise.all([
    import('../../stores/progressStore'),
    import('../../stores/bibleStore'),
  ]);

  const result = await identity.runIfCurrent(() => {
    // Merge and commit in one synchronous boundary so a chapter completed during
    // the cloud request or lazy store import cannot be overwritten by a snapshot.
    const progressState = useProgressStore.getState();
    const bibleState = useBibleStore.getState();
    const mergedReading = mergeReadingSnapshot(
      {
        chaptersRead: progressState.chaptersRead,
        streakDays: progressState.streakDays,
        lastReadDate: progressState.lastReadDate,
        currentBook: bibleState.currentBook,
        currentChapter: bibleState.currentChapter,
      },
      remoteData
    );
    if (mergedReading.changed) {
      progressState.applySyncedProgress(mergedReading.progress);
      bibleState.applySyncedReadingPosition({
        bookId: mergedReading.readingPosition.bookId,
        chapter: mergedReading.readingPosition.chapter,
      });
    }
    return mergedReading;
  });
  return result.applied ? result.value! : null;
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
        // profiles.email is copied from auth.users by a database trigger; the client does not
        // write it, so a profile cannot claim someone else's address.
        id: user.id,
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

const syncProgressForIdentity = (identity: SyncIdentityBoundary): Promise<SyncResult> =>
  queueProgressSync(getSyncCycleKey(identity), () => syncProgressForIdentityImpl(identity));

const syncProgressForIdentityImpl = async (identity: SyncIdentityBoundary): Promise<SyncResult> => {
  if (!(await identity.isCurrent())) return staleSyncResult();
  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
  if (!profileResult.success) {
    return profileResult;
  }

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
    const mergedReading = await applyMergedReadingState(remoteData, identity);
    if (!mergedReading) {
      return staleSyncResult();
    }

    if (readingMatchesRemote(mergedReading, remoteData)) {
      return (await identity.isCurrent())
        ? { success: true, merged: mergedReading.changed }
        : staleSyncResult();
    }

    const row = {
      user_id: userId,
      chapters_read: mergedReading.progress.chaptersRead,
      streak_days: mergedReading.progress.streakDays,
      last_read_date: mergedReading.progress.lastReadDate,
      current_book: mergedReading.readingPosition.bookId,
      current_chapter: mergedReading.readingPosition.chapter,
      synced_at: new Date().toISOString(),
    };

    // The server-side merge unions this row into the stored one under the row
    // lock, so a second device that read the same row before either wrote cannot
    // erase this device's new chapters (finding 12). It returns what it stored,
    // which carries anything the other device added meanwhile.
    const merge = await identity.runIfCurrent(() =>
      supabase.rpc(PROGRESS_MERGE_RPC, { p_progress: row }).single()
    );
    if (!merge.applied) {
      return staleSyncResult();
    }
    const { data: storedRow, error: mergeError, status: mergeStatus } = await merge.value!;
    if (!isMissingMergeRpcError(mergeError, mergeStatus)) {
      if (mergeError) {
        return { success: false, error: mergeError.message };
      }
      if (!storedRow) {
        return (await identity.isCurrent())
          ? { success: true, merged: mergedReading.changed }
          : staleSyncResult();
      }
      const adopted = await applyMergedReadingState(storedRow as UserProgress, identity);
      if (!adopted) {
        return staleSyncResult();
      }
      return { success: true, merged: mergedReading.changed || adopted.changed };
    }

    // No merge function on this server yet: the plain upsert, as before.
    const write = await identity.runIfCurrent(() =>
      supabase.from('user_progress').upsert(row, { onConflict: 'user_id' })
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

const syncPreferencesForIdentity = (identity: SyncIdentityBoundary): Promise<SyncResult> =>
  queuePreferenceSync(getSyncCycleKey(identity), () => syncPreferencesForIdentityImpl(identity));

const syncPreferencesForIdentityImpl = async (
  identity: SyncIdentityBoundary
): Promise<SyncResult> => {
  if (!(await identity.isCurrent())) return staleSyncResult();
  const userId = identity.expectedUserId;
  const profileResult = await ensureCloudProfile(identity);
  if (!profileResult.success) {
    return profileResult;
  }

  try {
    const { data, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return { success: false, error: fetchError.message };
    }

    const merged = await identity.runIfCurrent(() => {
      const localSnapshot = getLocalPreferenceSnapshot();
      const mergedPreferences = mergePreferences(localSnapshot, data as UserPreferences | null);
      applyPreferenceMergeLocally(mergedPreferences, localSnapshot);
      return {
        localSnapshot,
        mergedPreferences,
        // What the store holds once the merge is applied; an edit made during the
        // upload replaces this object, which is how it is detected below.
        expectedPreferences:
          mergedPreferences.source === 'merged'
            ? mergedPreferences.preferences
            : localSnapshot.preferences,
      };
    });
    if (!merged.applied) {
      return staleSyncResult();
    }
    const remotePreferences = data as UserPreferences | null;
    const { localSnapshot, mergedPreferences, expectedPreferences } = merged.value!;

    if (mergedPreferences.source === 'remote') {
      return {
        success: true,
        merged:
          mergedPreferences.changed || mergedPreferences.updatedAt !== localSnapshot.updatedAt,
      };
    }

    const syncedAt = new Date().toISOString();
    const legacyRow = {
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
      hide_play_button_from_reading_tab: mergedPreferences.preferences.hidePlayButtonFromReadingTab,
      notifications_enabled: mergedPreferences.preferences.notificationsEnabled,
      reminder_time: mergedPreferences.preferences.reminderTime,
      synced_at: syncedAt,
    };
    const upload = (withFieldStamps: boolean) =>
      identity.runIfCurrent(() =>
        withFieldStamps && mergedPreferences.fieldStamps
          ? // Read the row back: the server may clamp a stamp or keep its own
            // newer value for a field another device changed meanwhile.
            supabase
              .from('user_preferences')
              .upsert(
                {
                  ...legacyRow,
                  field_updated_at: toRemoteFieldStamps(mergedPreferences.fieldStamps),
                },
                { onConflict: 'user_id' }
              )
              .select('*')
              .single()
          : supabase.from('user_preferences').upsert(legacyRow, { onConflict: 'user_id' })
      );

    let write = await upload(mergedPreferences.fieldStamps !== null);
    if (!write.applied) {
      return staleSyncResult();
    }
    let { data: storedRow, error: upsertError } = await write.value!;

    if (mergedPreferences.fieldStamps !== null && isMissingFieldStampColumn(upsertError)) {
      write = await upload(false);
      if (!write.applied) {
        return staleSyncResult();
      }
      ({ data: storedRow, error: upsertError } = await write.value!);
    }

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    const stored = storedRow as UserPreferences | null;
    const storedStamps = stored ? readRemoteFieldStamps(stored) : null;

    const applied = await identity.runIfCurrent(() => {
      const current = getLocalPreferenceSnapshot();
      if (
        current.preferences === expectedPreferences &&
        current.updatedAt === localSnapshot.updatedAt
      ) {
        if (stored && storedStamps) {
          const storedPreferences = mapRemotePreferences(stored);
          useAuthStore
            .getState()
            .applySyncedPreferences(storedPreferences, syncedAt, storedPreferences, storedStamps);
        } else {
          useAuthStore
            .getState()
            .applySyncedPreferences(
              mergedPreferences.preferences,
              syncedAt,
              undefined,
              mergedPreferences.fieldStamps ?? undefined
            );
        }
      } else {
        // An edit landed during the upload: keep it pending, but record what the
        // server now holds so the next merge compares against the right base.
        useAuthStore.getState().markPreferencesSynced(mergedPreferences.preferences);
      }
    });
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
    if (progressData) {
      const applied = await applyMergedReadingState(progressData, identity);
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

      const applied = await identity.runIfCurrent(() => {
        // A 'local' result is left for the next sync to upload; recording it as
        // synced here would mark values the server does not have as its own.
        const localSnapshot = getLocalPreferenceSnapshot();
        applyPreferenceMergeLocally(mergePreferences(localSnapshot, prefsData), localSnapshot);
      });
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
