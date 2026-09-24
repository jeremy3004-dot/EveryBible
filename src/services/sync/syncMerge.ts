import type { PreferenceFieldStamps, UserPreferences } from '../../types';
import {
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../../constants/appearancePalettes';
import { resolveThemeMode } from '../../design/themeMode';
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
  /**
   * The values the server held when this device last reconciled with it. With a
   * base, each field takes whichever side changed it; without one (first sync on
   * this device) the whole row goes to the newer stamp. Only used while the
   * server has no per-field stamps.
   */
  base?: UserPreferences | null;
  /** When each preference was last chosen, on this device or adopted from the server. */
  fieldStamps?: PreferenceFieldStamps;
}

type PositionSource = 'local' | 'remote';
// 'merged': both sides contributed fields, so the result must be applied
// locally and uploaded.
type PreferenceSource = 'local' | 'remote' | 'merged';

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
  /** The server's current values (normalised), or null when it has no row. */
  remotePreferences: UserPreferences | null;
  /**
   * The stamps that go with `preferences`, and that an upload sends as
   * `field_updated_at`. Null when the server row has no stamp column yet, so
   * the upload must not send one.
   */
  fieldStamps: PreferenceFieldStamps | null;
  /** The server's stamps, or null when it has no row or no stamp column. */
  remoteFieldStamps: PreferenceFieldStamps | null;
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

  const remoteStreak = remoteData?.streak_days ?? 0;
  const remoteLastReadDate = remoteData?.last_read_date ?? null;
  const lastReadDate = getLatestDateString(localState.lastReadDate, remoteLastReadDate);
  // Keep the streak consistent with whichever side owns the most recent
  // lastReadDate rather than ratcheting with Math.max. A Math.max ratchet would
  // resurrect a stale higher streak from an old remote row even after a
  // legitimate reset (see L13). Ties keep the local value.
  const streakDays =
    lastReadDate === remoteLastReadDate && lastReadDate !== localState.lastReadDate
      ? remoteStreak
      : localState.streakDays;

  const progress = {
    chaptersRead,
    streakDays,
    lastReadDate,
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
      Object.entries(progress.chaptersRead).some(
        ([key, value]) => localState.chaptersRead[key] !== value
      ),
  };
};

/** Compare content rather than synced_at or chapter-map insertion order. */
export const readingMatchesRemote = (
  reading: ReadingMergeResult,
  remote: RemoteUserProgress | null
): boolean => {
  // Older rows may have NULL here; keep the existing upload that repairs them.
  if (!remote?.chapters_read) return false;
  const chapters = remote.chapters_read;
  return (
    reading.progress.streakDays === remote.streak_days &&
    reading.progress.lastReadDate === remote.last_read_date &&
    reading.readingPosition.bookId === remote.current_book &&
    reading.readingPosition.chapter === remote.current_chapter &&
    Object.keys(reading.progress.chaptersRead).length === Object.keys(chapters).length &&
    Object.entries(reading.progress.chaptersRead).every(([key, value]) => chapters[key] === value)
  );
};

// The profiles row can still hold a theme retired by the EL reskin ('low-light',
// 'parchment', 'midnight') for anyone who has not synced since. Fold those onto
// Field dark at the boundary rather than letting them reach the theme provider.
const normalizeRemoteTheme = (theme: RemoteUserPreferences['theme']): UserPreferences['theme'] =>
  resolveThemeMode(theme);

// Same story for the accent palette: every user synced before the EL reskin has
// 'ember' (or an older retired id) in their row. Left unnormalized it round-trips
// back to Supabase and makes preferencesEqual report a diff on every sync.
const normalizeRemotePalette = (
  palette: RemoteUserPreferences['appearance_palette']
): UserPreferences['appearancePalette'] =>
  (APPEARANCE_PALETTE_IDS as readonly string[]).includes(palette)
    ? (palette as UserPreferences['appearancePalette'])
    : DEFAULT_APPEARANCE_PALETTE;

/**
 * The server column for each synced preference. Its values are also the keys of
 * `user_preferences.field_updated_at`, and must match the column list in the
 * stamp trigger (migration 20260924023259; a test pins the two together).
 * Typed as a full record so adding a preference field fails to compile until it
 * is listed here, which keeps the equality check and the merges complete.
 */
export const PREFERENCE_COLUMNS = {
  fontSize: 'font_size',
  theme: 'theme',
  appearancePalette: 'appearance_palette',
  language: 'language',
  countryCode: 'country_code',
  countryName: 'country_name',
  contentLanguageCode: 'content_language_code',
  contentLanguageName: 'content_language_name',
  contentLanguageNativeName: 'content_language_native_name',
  chapterFeedbackName: 'chapter_feedback_name',
  chapterFeedbackRole: 'chapter_feedback_role',
  onboardingCompleted: 'onboarding_completed',
  chapterFeedbackEnabled: 'chapter_feedback_enabled',
  hidePlayButtonFromReadingTab: 'hide_play_button_from_reading_tab',
  notificationsEnabled: 'notifications_enabled',
  reminderTime: 'reminder_time',
} as const satisfies Record<keyof UserPreferences, keyof RemoteUserPreferences>;

const PREFERENCE_FIELDS = Object.keys(PREFERENCE_COLUMNS) as (keyof UserPreferences)[];

export const mapRemotePreferences = (
  remotePreferences: RemoteUserPreferences
): UserPreferences => ({
  fontSize: remotePreferences.font_size,
  theme: normalizeRemoteTheme(remotePreferences.theme),
  appearancePalette: normalizeRemotePalette(remotePreferences.appearance_palette),
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
  hidePlayButtonFromReadingTab: remotePreferences.hide_play_button_from_reading_tab,
  notificationsEnabled: remotePreferences.notifications_enabled,
  reminderTime: remotePreferences.reminder_time,
});

const preferencesEqual = (left: UserPreferences, right: UserPreferences): boolean =>
  PREFERENCE_FIELDS.every((field) => left[field] === right[field]);

/** Milliseconds for a stamp, or null when it is missing or unparseable. */
const stampTime = (stamp: string | null | undefined): number | null => {
  if (typeof stamp !== 'string') {
    return null;
  }
  const time = Date.parse(stamp);
  return Number.isFinite(time) ? time : null;
};

/**
 * The server's per-field stamps, or null when the row was read from a database
 * that does not have the `field_updated_at` column yet (migration not applied).
 */
export const readRemoteFieldStamps = (
  remotePreferences: RemoteUserPreferences
): PreferenceFieldStamps | null => {
  if (remotePreferences.field_updated_at === undefined) {
    return null;
  }
  const raw = remotePreferences.field_updated_at ?? {};
  const stamps: PreferenceFieldStamps = {};
  for (const field of PREFERENCE_FIELDS) {
    const stamp = raw[PREFERENCE_COLUMNS[field]];
    if (stampTime(stamp) !== null) {
      stamps[field] = stamp;
    }
  }
  return stamps;
};

/** The `field_updated_at` payload for an upload. */
export const toRemoteFieldStamps = (stamps: PreferenceFieldStamps): Record<string, string> => {
  const remote: Record<string, string> = {};
  for (const field of PREFERENCE_FIELDS) {
    const stamp = stamps[field];
    if (stamp) {
      remote[PREFERENCE_COLUMNS[field]] = stamp;
    }
  }
  return remote;
};

const fieldStampsEqual = (left: PreferenceFieldStamps, right: PreferenceFieldStamps): boolean =>
  PREFERENCE_FIELDS.every((field) => (left[field] ?? null) === (right[field] ?? null));

/** The later of two stamps; the server's on a tie, since the server breaks ties that way. */
const laterStamp = (local: string | undefined, remote: string | undefined): string | undefined => {
  const localTime = stampTime(local);
  const remoteTime = stampTime(remote);
  if (remoteTime === null) {
    return localTime === null ? undefined : local;
  }
  return localTime === null || remoteTime >= localTime ? remote : local;
};

/**
 * Three-way merge against the last reconciled server values. A field changed on
 * one side only takes that side's value regardless of either device's clock;
 * only a field changed differently on both sides falls back to the stamps.
 * Used only while the server has no per-field stamps.
 */
const mergePreferenceFields = (
  local: UserPreferences,
  remote: UserPreferences,
  base: UserPreferences,
  remoteIsNewer: boolean
): UserPreferences => {
  const merged: UserPreferences = { ...local };
  const writable = merged as unknown as Record<keyof UserPreferences, unknown>;
  for (const field of PREFERENCE_FIELDS) {
    const localValue = local[field];
    const remoteValue = remote[field];
    if (localValue === remoteValue || remoteValue === base[field]) {
      continue;
    }
    if (localValue === base[field] || remoteIsNewer) {
      writable[field] = remoteValue;
    }
  }
  return merged;
};

/**
 * The merge used before the server has `field_updated_at`: whole-row stamps,
 * or the three-way merge once this device has a sync base.
 */
const mergeWithoutFieldStamps = (
  localSnapshot: LocalPreferenceSnapshot,
  remotePreferences: RemoteUserPreferences
): PreferenceMergeResult => {
  const remoteSnapshot = mapRemotePreferences(remotePreferences);
  const remoteUpdatedAt = remotePreferences.synced_at ?? null;
  const keepLocal: PreferenceMergeResult = {
    preferences: localSnapshot.preferences,
    updatedAt: localSnapshot.updatedAt,
    source: 'local',
    changed: false,
    remotePreferences: remoteSnapshot,
    fieldStamps: null,
    remoteFieldStamps: null,
  };
  const remoteWouldReopenOnboarding =
    localSnapshot.preferences.onboardingCompleted && !remoteSnapshot.onboardingCompleted;

  if (remoteWouldReopenOnboarding) {
    return keepLocal;
  }

  const shouldUseRemote =
    !localSnapshot.updatedAt ||
    (remoteUpdatedAt !== null && remoteUpdatedAt > localSnapshot.updatedAt);
  const useRemote: PreferenceMergeResult = {
    preferences: remoteSnapshot,
    updatedAt: remoteUpdatedAt,
    source: 'remote',
    changed: !preferencesEqual(localSnapshot.preferences, remoteSnapshot),
    remotePreferences: remoteSnapshot,
    fieldStamps: null,
    remoteFieldStamps: null,
  };

  if (localSnapshot.base) {
    const merged = mergePreferenceFields(
      localSnapshot.preferences,
      remoteSnapshot,
      localSnapshot.base,
      shouldUseRemote
    );
    if (preferencesEqual(merged, remoteSnapshot)) {
      return useRemote;
    }
    if (preferencesEqual(merged, localSnapshot.preferences)) {
      return keepLocal;
    }
    return {
      preferences: merged,
      updatedAt: localSnapshot.updatedAt,
      source: 'merged',
      changed: true,
      remotePreferences: remoteSnapshot,
      fieldStamps: null,
      remoteFieldStamps: null,
    };
  }

  return shouldUseRemote ? useRemote : keepLocal;
};

/**
 * Per-field merge on edit stamps: for each preference the value chosen most
 * recently wins, whichever device uploaded last. The server applies the same
 * rule when the upload lands (and clamps stamps from a clock running ahead), so
 * a race between two devices converges on the same answer.
 */
const mergeWithFieldStamps = (
  localSnapshot: LocalPreferenceSnapshot,
  remotePreferences: RemoteUserPreferences,
  remoteStamps: PreferenceFieldStamps
): PreferenceMergeResult => {
  const remoteSnapshot = mapRemotePreferences(remotePreferences);
  const local = localSnapshot.preferences;
  const localStamps = localSnapshot.fieldStamps ?? {};

  const preferences: UserPreferences = { ...local };
  const writable = preferences as unknown as Record<keyof UserPreferences, unknown>;
  const stamps: PreferenceFieldStamps = {};

  for (const field of PREFERENCE_FIELDS) {
    const localValue = local[field];
    const remoteValue = remoteSnapshot[field];
    const localStamp = localStamps[field];
    const remoteStamp = remoteStamps[field];

    if (localValue === remoteValue) {
      const stamp = laterStamp(localStamp, remoteStamp);
      if (stamp) {
        stamps[field] = stamp;
      }
      continue;
    }

    const localTime = stampTime(localStamp);
    const remoteTime = stampTime(remoteStamp);
    let takeRemote: boolean;
    if (field === 'onboardingCompleted') {
      // Finishing onboarding is never undone by another device's row.
      takeRemote = remoteValue === true;
    } else if (localTime !== null && remoteTime !== null) {
      takeRemote = remoteTime >= localTime;
    } else {
      // A value without a stamp was never chosen: on the server it is the
      // signup row's DB default (theme 'dark'), on the device the app default.
      // A real choice beats it; between two defaults the device's is current,
      // which is what keeps a first sign-in from importing the DB defaults.
      takeRemote = remoteTime !== null;
    }

    if (takeRemote) {
      writable[field] = remoteValue;
    }
    const stamp = takeRemote ? remoteStamp : localStamp;
    if (stamp) {
      stamps[field] = stamp;
    }
  }

  const needsUpload =
    !preferencesEqual(preferences, remoteSnapshot) || !fieldStampsEqual(stamps, remoteStamps);
  const changedLocally =
    !preferencesEqual(preferences, local) || !fieldStampsEqual(stamps, localStamps);
  const source: PreferenceSource = !needsUpload ? 'remote' : !changedLocally ? 'local' : 'merged';

  return {
    preferences: source === 'remote' ? remoteSnapshot : preferences,
    updatedAt:
      source === 'remote' ? (remotePreferences.synced_at ?? null) : localSnapshot.updatedAt,
    source,
    changed: !preferencesEqual(preferences, local),
    remotePreferences: remoteSnapshot,
    fieldStamps: stamps,
    remoteFieldStamps: remoteStamps,
  };
};

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
      remotePreferences: null,
      // Unknown whether the server has the stamp column: offer the stamps and let
      // the upload fall back if it is refused.
      fieldStamps: localSnapshot.fieldStamps ?? {},
      remoteFieldStamps: null,
    };
  }

  const remoteStamps = readRemoteFieldStamps(remotePreferences);
  return remoteStamps
    ? mergeWithFieldStamps(localSnapshot, remotePreferences, remoteStamps)
    : mergeWithoutFieldStamps(localSnapshot, remotePreferences);
};
