import type { UserPreferences } from '../../types';
import type {
  UserPreferences as RemoteUserPreferences,
  UserProgress as RemoteUserProgress,
} from '../supabase/types';

export interface LocalReadingSnapshot {
  chaptersRead: Record<string, number>;
  streakDays: number;
  lastReadDate: string | null;
  currentBook: string;
  currentChapter: number;
}

export interface LocalPreferenceSnapshot {
  preferences: UserPreferences;
  updatedAt: string | null;
}

type PositionSource = 'local' | 'remote';
type PreferenceSource = 'local' | 'remote';

interface ReadingPosition {
  bookId: string;
  chapter: number;
}

export interface ReadingMergeResult {
  progress: Pick<LocalReadingSnapshot, 'chaptersRead' | 'streakDays' | 'lastReadDate'>;
  readingPosition: ReadingPosition;
  positionSource: PositionSource;
  changed: boolean;
}

export interface PreferenceMergeResult {
  preferences: UserPreferences;
  updatedAt: string | null;
  source: PreferenceSource;
  changed: boolean;
}

export const mergeChapterProgress = (
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

const getChapterTimestamp = (
  chaptersRead: Record<string, number>,
  bookId: string,
  chapter: number
): number => chaptersRead[`${bookId}_${chapter}`] ?? 0;

const resolveReadingPosition = (
  localState: LocalReadingSnapshot,
  remoteData: RemoteUserProgress | null,
  mergedChaptersRead: Record<string, number>
): { readingPosition: ReadingPosition; positionSource: PositionSource } => {
  if (!remoteData?.current_book || !remoteData.current_chapter) {
    return {
      readingPosition: {
        bookId: localState.currentBook,
        chapter: localState.currentChapter,
      },
      positionSource: 'local',
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
      readingPosition: {
        bookId: remoteData.current_book,
        chapter: remoteData.current_chapter,
      },
      positionSource: 'remote',
    };
  }

  return {
    readingPosition: {
      bookId: localState.currentBook,
      chapter: localState.currentChapter,
    },
    positionSource: 'local',
  };
};

export const mergeReadingSnapshot = (
  localState: LocalReadingSnapshot,
  remoteData: RemoteUserProgress | null
): ReadingMergeResult => {
  const remoteChapters = (remoteData?.chapters_read as Record<string, number>) || {};
  const chaptersRead = mergeChapterProgress(localState.chaptersRead, remoteChapters);
  const { readingPosition, positionSource } = resolveReadingPosition(
    localState,
    remoteData,
    chaptersRead
  );
  const progress = {
    chaptersRead,
    streakDays: Math.max(localState.streakDays, remoteData?.streak_days ?? 0),
    lastReadDate: getLatestDateString(localState.lastReadDate, remoteData?.last_read_date ?? null),
  };

  return {
    progress,
    readingPosition,
    positionSource,
    changed:
      positionSource === 'remote' ||
      progress.streakDays !== localState.streakDays ||
      progress.lastReadDate !== localState.lastReadDate ||
      Object.keys(progress.chaptersRead).length !== Object.keys(localState.chaptersRead).length ||
      Object.entries(progress.chaptersRead).some(([key, value]) => localState.chaptersRead[key] !== value),
  };
};

const mapRemotePreferences = (remotePreferences: RemoteUserPreferences): UserPreferences => ({
  fontSize: remotePreferences.font_size,
  theme: remotePreferences.theme,
  language: remotePreferences.language,
  countryCode: remotePreferences.country_code,
  countryName: remotePreferences.country_name,
  contentLanguageCode: remotePreferences.content_language_code,
  contentLanguageName: remotePreferences.content_language_name,
  contentLanguageNativeName: remotePreferences.content_language_native_name,
  chapterFeedbackName: remotePreferences.chapter_feedback_name,
  chapterFeedbackRole: remotePreferences.chapter_feedback_role,
  onboardingCompleted: remotePreferences.onboarding_completed,
  chapterFeedbackEnabled: remotePreferences.chapter_feedback_enabled,
  notificationsEnabled: remotePreferences.notifications_enabled,
  reminderTime: remotePreferences.reminder_time,
});

const preferencesEqual = (left: UserPreferences, right: UserPreferences): boolean =>
  left.fontSize === right.fontSize &&
  left.theme === right.theme &&
  left.language === right.language &&
  left.countryCode === right.countryCode &&
  left.countryName === right.countryName &&
  left.contentLanguageCode === right.contentLanguageCode &&
  left.contentLanguageName === right.contentLanguageName &&
  left.contentLanguageNativeName === right.contentLanguageNativeName &&
  left.chapterFeedbackName === right.chapterFeedbackName &&
  left.chapterFeedbackRole === right.chapterFeedbackRole &&
  left.onboardingCompleted === right.onboardingCompleted &&
  left.chapterFeedbackEnabled === right.chapterFeedbackEnabled &&
  left.notificationsEnabled === right.notificationsEnabled &&
  left.reminderTime === right.reminderTime;

export const mergePreferences = (
  localSnapshot: LocalPreferenceSnapshot,
  remotePreferences: RemoteUserPreferences | null
): PreferenceMergeResult => {
  if (!remotePreferences) {
    return {
      preferences: localSnapshot.preferences,
      updatedAt: localSnapshot.updatedAt,
      source: 'local',
      changed: false,
    };
  }

  const remoteSnapshot = mapRemotePreferences(remotePreferences);
  const remoteUpdatedAt = remotePreferences.synced_at ?? null;
  const remoteWouldReopenOnboarding =
    localSnapshot.preferences.onboardingCompleted && !remoteSnapshot.onboardingCompleted;

  if (remoteWouldReopenOnboarding) {
    return {
      preferences: localSnapshot.preferences,
      updatedAt: localSnapshot.updatedAt,
      source: 'local',
      changed: false,
    };
  }

  const shouldUseRemote =
    !localSnapshot.updatedAt ||
    (remoteUpdatedAt !== null && remoteUpdatedAt > localSnapshot.updatedAt);

  if (shouldUseRemote) {
    return {
      preferences: remoteSnapshot,
      updatedAt: remoteUpdatedAt,
      source: 'remote',
      changed: !preferencesEqual(localSnapshot.preferences, remoteSnapshot),
    };
  }

  return {
    preferences: localSnapshot.preferences,
    updatedAt: localSnapshot.updatedAt,
    source: 'local',
    changed: false,
  };
};
