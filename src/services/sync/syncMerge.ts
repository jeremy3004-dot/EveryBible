import type { PreferenceFieldStamps, UserPreferences } from '../../types';
import {
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../../constants/appearancePalettes';
import { getBookById } from '../../constants/books';
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
    // A row written by an older build or by hand can hold null or a string here.
    // Adopting it would put a non-number in the store and in the next upload,
    // which merge_user_progress refuses outright (22023), stalling every sync.
    if (typeof remoteTimestamp !== 'number' || !Number.isFinite(remoteTimestamp)) {
      continue;
    }
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
  const remoteBook = remoteData?.current_book ? getBookById(remoteData.current_book) : undefined;
  const remoteChapter = remoteData?.current_chapter;
  const isRemotePositionReal =
    remoteBook != null &&
    typeof remoteChapter === 'number' &&
    Number.isInteger(remoteChapter) &&
    remoteChapter >= 1 &&
    remoteChapter <= remoteBook.chapters;
  if (!remoteData?.current_book || !remoteData.current_chapter || !isRemotePositionReal) {
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

  // Two positions read at the same instant: pick by the position itself, so both
  // devices make the same choice and the server stops alternating between them.
  const remoteWinsTie =
    remoteTimestamp === localTimestamp &&
    `${remoteData.current_book}_${remoteData.current_chapter}` >
      `${localState.currentBook}_${localState.currentChapter}`;
  const shouldUseRemote =
    (localState.currentBook === 'GEN' &&
      localState.currentChapter === 1 &&
      Object.keys(localState.chaptersRead).length === 0) ||
    remoteTimestamp > localTimestamp ||
    remoteWinsTie;

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

/**
 * The server applies the same rules atomically in merge_user_progress
 * (migration 20260924041000); keep the two in step.
 */
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
  // legitimate reset (see L13). When both sides read last on the same day, the
  // longer run wins: each device only counts the days it saw, so the longer one
  // is the truer count, and taking it on both sides is what lets two devices
  // agree (keeping the local value made each device re-upload its own streak on
  // every sync, flipping the server between them).
  const streakDays =
    localState.lastReadDate !== null && localState.lastReadDate === remoteLastReadDate
      ? Math.max(localState.streakDays, remoteStreak)
      : lastReadDate === remoteLastReadDate && lastReadDate !== localState.lastReadDate
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
      readingPosition.bookId !== localState.currentBook ||
      readingPosition.chapter !== localState.currentChapter ||
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

/** The row uploaded to merge_user_progress (or, on an older server, upserted). */
export interface RemoteProgressPayload {
  user_id: string;
  chapters_read: Record<string, number>;
  streak_days: number | null;
  last_read_date: string | null;
  current_book: string | null;
  current_chapter: number | null;
  synced_at: string;
}

const MAX_UPLOADED_CHAPTERS = 5000;

const isWholeNumberUpTo = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

const isCalendarDate = (value: unknown): value is string => {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const codePointLength = (text: string): number => Array.from(text).length;

/**
 * The upload for a merged reading state, shaped to what merge_user_progress
 * accepts (migration 20260924051658 raises 22023 on anything else, refusing
 * the whole call, so one bad value would stall this account's progress sync for
 * good). A chapter whose time is not a number is left out, an unusable streak,
 * date or position is sent as null, and the server keeps its own value for it.
 */
export const buildRemoteProgressPayload = (
  userId: string,
  reading: ReadingMergeResult,
  syncedAt: string
): RemoteProgressPayload => {
  const chapters = Object.entries(reading.progress.chaptersRead).filter(
    ([key, readAt]) =>
      typeof readAt === 'number' &&
      Number.isFinite(readAt) &&
      codePointLength(key) >= 1 &&
      codePointLength(key) <= 64
  );
  const { bookId, chapter } = reading.readingPosition;
  const hasPosition =
    typeof bookId === 'string' &&
    codePointLength(bookId) >= 1 &&
    codePointLength(bookId) <= 32 &&
    isWholeNumberUpTo(chapter, 999_999);

  return {
    user_id: userId,
    chapters_read: Object.fromEntries(chapters.slice(0, MAX_UPLOADED_CHAPTERS)),
    streak_days: isWholeNumberUpTo(reading.progress.streakDays, 999_999_999)
      ? reading.progress.streakDays
      : null,
    last_read_date: isCalendarDate(reading.progress.lastReadDate)
      ? reading.progress.lastReadDate
      : null,
    current_book: hasPosition ? bookId : null,
    current_chapter: hasPosition ? chapter : null,
    synced_at: syncedAt,
  };
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

// reminder_time is a Postgres TIME column, which reads back as "HH:MM:SS" for
// the "HH:MM" the app writes. Adopted as is, the seconds broke the equality with
// the device's value, and the persisted-state sanitizer (which accepts only
// "HH:MM") dropped the reminder at the next launch.
const normalizeRemoteReminderTime = (
  reminderTime: RemoteUserPreferences['reminder_time']
): UserPreferences['reminderTime'] => {
  const match =
    typeof reminderTime === 'string'
      ? /^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(reminderTime)
      : null;
  return match ? match[1] : null;
};

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
  reminderTime: normalizeRemoteReminderTime(remotePreferences.reminder_time),
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
    let stamp = takeRemote ? remoteStamp : localStamp;
    if (
      field === 'onboardingCompleted' &&
      !takeRemote &&
      remoteTime !== null &&
      (localTime === null || localTime <= remoteTime)
    ) {
      // Kept against a newer "not finished" (an installed build that never
      // finished onboarding upserts its whole row). The server refuses a value
      // whose stamp is not newer than its own, and the upload's read-back would
      // then reopen onboarding here, so re-assert it just after the server's.
      stamp = new Date(remoteTime + 1).toISOString();
    }
    if (stamp) {
      stamps[field] = stamp;
    }
  }

  // With the server's stamps unchanged, the only values that can still differ
  // are ones nobody chose on either side (the device's app default against the
  // row's DB default: theme 'light' against 'dark'), or finished onboarding.
  // The stamp trigger reads an upload whose stamps arrive unchanged as an
  // installed build's write and records every value it changes as chosen now,
  // so uploading a default here made it beat a real choice made earlier on
  // another device. Such a default stays on this device and is not uploaded.
  const needsUpload =
    !fieldStampsEqual(stamps, remoteStamps) ||
    preferences.onboardingCompleted !== remoteSnapshot.onboardingCompleted;
  const changedLocally =
    !preferencesEqual(preferences, local) || !fieldStampsEqual(stamps, localStamps);
  const source: PreferenceSource = !needsUpload ? 'remote' : !changedLocally ? 'local' : 'merged';

  return {
    // Equal to the server's values except for never-chosen defaults (above).
    preferences,
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
