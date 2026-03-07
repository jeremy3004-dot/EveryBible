import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';
import { useProgressStore } from '../../stores/progressStore';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import type { UserProgress, UserPreferences } from '../supabase/types';

export interface SyncResult {
  success: boolean;
  error?: string;
  merged?: boolean;
}

interface LocalReadingSnapshot {
  chaptersRead: Record<string, number>;
  streakDays: number;
  lastReadDate: string | null;
  currentBook: string;
  currentChapter: number;
}

const progressMapsEqual = (
  left: Record<string, number>,
  right: Record<string, number>
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

const mergeProgress = (
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> => {
  const merged = { ...local };

  for (const [key, remoteTimestamp] of Object.entries(remote)) {
    const localTimestamp = local[key];
    if (!localTimestamp || remoteTimestamp > localTimestamp) {
      merged[key] = remoteTimestamp;
    }
  }

  return merged;
};

const getLatestDateString = (left: string | null, right: string | null): string | null => {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left > right ? left : right;
};

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

const getChapterTimestamp = (
  chaptersRead: Record<string, number>,
  bookId: string,
  chapter: number
): number => {
  return chaptersRead[`${bookId}_${chapter}`] ?? 0;
};

const resolveReadingPosition = (
  localState: LocalReadingSnapshot,
  remoteData: UserProgress | null,
  mergedChaptersRead: Record<string, number>
): { bookId: string; chapter: number; fromRemote: boolean } => {
  if (!remoteData?.current_book || !remoteData.current_chapter) {
    return {
      bookId: localState.currentBook,
      chapter: localState.currentChapter,
      fromRemote: false,
    };
  }

  const remoteTimestamp =
    getChapterTimestamp(mergedChaptersRead, remoteData.current_book, remoteData.current_chapter) ||
    Date.parse(remoteData.synced_at || '') ||
    0;
  const localTimestamp = getChapterTimestamp(
    mergedChaptersRead,
    localState.currentBook,
    localState.currentChapter
  );

  const shouldUseRemote =
    (localState.currentBook === 'GEN' &&
      localState.currentChapter === 1 &&
      Object.keys(localState.chaptersRead).length === 0) ||
    remoteTimestamp > localTimestamp;

  if (shouldUseRemote) {
    return {
      bookId: remoteData.current_book,
      chapter: remoteData.current_chapter,
      fromRemote: true,
    };
  }

  return {
    bookId: localState.currentBook,
    chapter: localState.currentChapter,
    fromRemote: false,
  };
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
    const remoteChapters = (remoteData?.chapters_read as Record<string, number>) || {};
    const mergedChaptersRead = mergeProgress(localState.chaptersRead, remoteChapters);
    const mergedProgress = !progressMapsEqual(mergedChaptersRead, localState.chaptersRead);

    if (mergedProgress) {
      useProgressStore.setState({ chaptersRead: mergedChaptersRead });
    }

    const resolvedReading = resolveReadingPosition(localState, remoteData, mergedChaptersRead);

    if (
      resolvedReading.fromRemote &&
      (resolvedReading.bookId !== localState.currentBook ||
        resolvedReading.chapter !== localState.currentChapter)
    ) {
      useBibleStore.setState({
        currentBook: resolvedReading.bookId,
        currentChapter: resolvedReading.chapter,
      });
    }

    const { error: upsertError } = await supabase.from('user_progress').upsert(
      {
        user_id: userId,
        chapters_read: mergedChaptersRead,
        streak_days: Math.max(localState.streakDays, remoteData?.streak_days ?? 0),
        last_read_date: getLatestDateString(
          localState.lastReadDate,
          remoteData?.last_read_date ?? null
        ),
        current_book: resolvedReading.bookId,
        current_chapter: resolvedReading.chapter,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true, merged: mergedProgress || resolvedReading.fromRemote };
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

  const authState = useAuthStore.getState();
  const localPrefs = authState.preferences;

  try {
    const { error: upsertError } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        font_size: localPrefs.fontSize,
        theme: localPrefs.theme,
        language: localPrefs.language,
        country_code: localPrefs.countryCode,
        country_name: localPrefs.countryName,
        content_language_code: localPrefs.contentLanguageCode,
        content_language_name: localPrefs.contentLanguageName,
        content_language_native_name: localPrefs.contentLanguageNativeName,
        onboarding_completed: localPrefs.onboardingCompleted,
        notifications_enabled: localPrefs.notificationsEnabled,
        reminder_time: localPrefs.reminderTime,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true };
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
      const remoteChapters = (progressData.chapters_read as Record<string, number>) || {};
      const mergedChapters = mergeProgress(localState.chaptersRead, remoteChapters);
      const resolvedReading = resolveReadingPosition(localState, progressData, mergedChapters);

      useProgressStore.setState({
        chaptersRead: mergedChapters,
        streakDays: Math.max(localState.streakDays, progressData.streak_days),
        lastReadDate: getLatestDateString(
          localState.lastReadDate,
          progressData.last_read_date || null
        ),
      });

      if (
        resolvedReading.fromRemote &&
        (resolvedReading.bookId !== localState.currentBook ||
          resolvedReading.chapter !== localState.currentChapter)
      ) {
        useBibleStore.setState({
          currentBook: resolvedReading.bookId,
          currentChapter: resolvedReading.chapter,
        });
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
      const localPreferences = useAuthStore.getState().preferences;
      useAuthStore.setState({
        preferences: {
          ...localPreferences,
          fontSize: prefsData.font_size || localPreferences.fontSize,
          theme: prefsData.theme || localPreferences.theme,
          language: prefsData.language || localPreferences.language,
          countryCode: prefsData.country_code ?? localPreferences.countryCode,
          countryName: prefsData.country_name ?? localPreferences.countryName,
          contentLanguageCode:
            prefsData.content_language_code ?? localPreferences.contentLanguageCode,
          contentLanguageName:
            prefsData.content_language_name ?? localPreferences.contentLanguageName,
          contentLanguageNativeName:
            prefsData.content_language_native_name ?? localPreferences.contentLanguageNativeName,
          onboardingCompleted:
            prefsData.onboarding_completed ?? localPreferences.onboardingCompleted,
          notificationsEnabled: prefsData.notifications_enabled,
          reminderTime: prefsData.reminder_time,
        },
      });
    }

    return { success: true, merged: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
