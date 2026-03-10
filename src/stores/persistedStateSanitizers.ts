import { bibleTranslations } from '../constants/translations';
import { getBookById } from '../constants/books';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { PLAYBACK_RATES, SLEEP_TIMER_OPTIONS } from '../types/audio';
import type {
  AudioGranularity,
  BibleTranslation,
  PlaybackRate,
  SleepTimerOption,
  User,
  UserPreferences,
} from '../types';

const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const validFontSizes = new Set<UserPreferences['fontSize']>(['small', 'medium', 'large']);
const validThemes = new Set<UserPreferences['theme']>(['dark', 'light']);
const validAudioGranularities = new Set<AudioGranularity>(['none', 'chapter', 'verse']);
const validPlaybackRates = new Set<PlaybackRate>(PLAYBACK_RATES);
const validSleepTimers = new Set<SleepTimerOption>(SLEEP_TIMER_OPTIONS.map((option) => option.value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const sanitizeBookId = (value: unknown): string | null =>
  typeof value === 'string' && getBookById(value) ? value : null;

const sanitizeBibleTranslations = (value: unknown): BibleTranslation[] => {
  if (!Array.isArray(value)) {
    return bibleTranslations;
  }

  const persistedById = new Map<string, Record<string, unknown>>();

  value.forEach((entry) => {
    if (isRecord(entry) && typeof entry.id === 'string') {
      persistedById.set(entry.id, entry);
    }
  });

  return bibleTranslations.map((defaultTranslation) => {
    const persisted = persistedById.get(defaultTranslation.id);
    if (!persisted) {
      return defaultTranslation;
    }

    const downloadedBooks = Array.isArray(persisted.downloadedBooks)
      ? persisted.downloadedBooks.filter(
          (bookId): bookId is string => typeof bookId === 'string' && Boolean(getBookById(bookId))
        )
      : defaultTranslation.downloadedBooks;

    const downloadedAudioBooks = Array.isArray(persisted.downloadedAudioBooks)
      ? persisted.downloadedAudioBooks.filter(
          (bookId): bookId is string => typeof bookId === 'string' && Boolean(getBookById(bookId))
        )
      : defaultTranslation.downloadedAudioBooks;

    const audioGranularity = validAudioGranularities.has(
      persisted.audioGranularity as AudioGranularity
    )
      ? (persisted.audioGranularity as AudioGranularity)
      : defaultTranslation.audioGranularity;

    return {
      ...defaultTranslation,
      isDownloaded:
        typeof persisted.isDownloaded === 'boolean'
          ? persisted.isDownloaded
          : defaultTranslation.isDownloaded,
      downloadedBooks,
      downloadedAudioBooks,
      hasText:
        typeof persisted.hasText === 'boolean' ? persisted.hasText : defaultTranslation.hasText,
      hasAudio:
        typeof persisted.hasAudio === 'boolean' ? persisted.hasAudio : defaultTranslation.hasAudio,
      audioGranularity,
      audioFilesetId:
        typeof persisted.audioFilesetId === 'string'
          ? persisted.audioFilesetId
          : defaultTranslation.audioFilesetId,
    };
  });
};

export const defaultAuthPreferences: UserPreferences = {
  fontSize: 'medium',
  theme: 'dark',
  language: 'en',
  countryCode: null,
  countryName: null,
  contentLanguageCode: null,
  contentLanguageName: null,
  contentLanguageNativeName: null,
  onboardingCompleted: false,
  notificationsEnabled: false,
  reminderTime: null,
};

export const sanitizeUserPreferences = (value: unknown): UserPreferences => {
  if (!isRecord(value)) {
    return defaultAuthPreferences;
  }

  const language =
    typeof value.language === 'string' &&
    supportedLanguageCodes.has(value.language as UserPreferences['language'])
      ? (value.language as UserPreferences['language'])
      : defaultAuthPreferences.language;

  const fontSize = validFontSizes.has(value.fontSize as UserPreferences['fontSize'])
    ? (value.fontSize as UserPreferences['fontSize'])
    : defaultAuthPreferences.fontSize;

  const theme = validThemes.has(value.theme as UserPreferences['theme'])
    ? (value.theme as UserPreferences['theme'])
    : defaultAuthPreferences.theme;

  const reminderTime =
    typeof value.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(value.reminderTime)
      ? value.reminderTime
      : null;

  return {
    fontSize,
    theme,
    language,
    countryCode:
      typeof value.countryCode === 'string' && /^[A-Za-z]{2}$/.test(value.countryCode)
        ? value.countryCode.toUpperCase()
        : null,
    countryName: sanitizeOptionalString(value.countryName),
    contentLanguageCode: sanitizeOptionalString(value.contentLanguageCode),
    contentLanguageName: sanitizeOptionalString(value.contentLanguageName),
    contentLanguageNativeName: sanitizeOptionalString(value.contentLanguageNativeName),
    onboardingCompleted: value.onboardingCompleted === true,
    notificationsEnabled: value.notificationsEnabled === true,
    reminderTime,
  };
};

export const sanitizePersistedAuthState = (
  value: unknown
): {
  user: User | null;
  isAuthenticated: boolean;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;
} => {
  const persisted = isRecord(value) ? value : {};
  const userValue = persisted.user;
  const user =
    isRecord(userValue) && typeof userValue.uid === 'string'
      ? {
          uid: userValue.uid,
          email: typeof userValue.email === 'string' ? userValue.email : null,
          displayName: sanitizeOptionalString(userValue.displayName),
          photoURL: sanitizeOptionalString(userValue.photoURL),
          createdAt:
            typeof userValue.createdAt === 'number' && Number.isFinite(userValue.createdAt)
              ? userValue.createdAt
              : Date.now(),
          lastActive:
            typeof userValue.lastActive === 'number' && Number.isFinite(userValue.lastActive)
              ? userValue.lastActive
              : Date.now(),
        }
      : null;

  return {
    user,
    isAuthenticated: user !== null && persisted.isAuthenticated === true,
    preferences: sanitizeUserPreferences(persisted.preferences),
    preferencesUpdatedAt:
      typeof persisted.preferencesUpdatedAt === 'string' && persisted.preferencesUpdatedAt.length > 0
        ? persisted.preferencesUpdatedAt
        : null,
  };
};

export const sanitizePersistedBibleState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const translations = sanitizeBibleTranslations(persisted.translations);
  const translationIds = new Set(translations.map((translation) => translation.id));
  const currentBook = sanitizeBookId(persisted.currentBook) ?? 'GEN';
  const currentChapter =
    typeof persisted.currentChapter === 'number' &&
    Number.isInteger(persisted.currentChapter) &&
    persisted.currentChapter > 0
      ? persisted.currentChapter
      : 1;

  return {
    currentBook,
    currentChapter,
    currentTranslation:
      typeof persisted.currentTranslation === 'string' &&
      translationIds.has(persisted.currentTranslation)
        ? persisted.currentTranslation
        : 'bsb',
    translations,
  };
};

export const sanitizePersistedProgressState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const chaptersReadSource = isRecord(persisted.chaptersRead) ? persisted.chaptersRead : {};
  const chaptersRead = Object.fromEntries(
    Object.entries(chaptersReadSource).filter(([key, timestamp]) => {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        return false;
      }

      const separatorIndex = key.lastIndexOf('_');
      if (separatorIndex <= 0) {
        return false;
      }

      const bookId = key.slice(0, separatorIndex);
      const chapter = Number(key.slice(separatorIndex + 1));
      return Boolean(getBookById(bookId)) && Number.isInteger(chapter) && chapter > 0;
    })
  ) as Record<string, number>;

  return {
    chaptersRead,
    streakDays:
      typeof persisted.streakDays === 'number' &&
      Number.isFinite(persisted.streakDays) &&
      persisted.streakDays >= 0
        ? Math.floor(persisted.streakDays)
        : 0,
    lastReadDate:
      typeof persisted.lastReadDate === 'string' && persisted.lastReadDate.length > 0
        ? persisted.lastReadDate
        : null,
  };
};

export const sanitizePersistedAudioState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};

  return {
    playbackRate:
      typeof persisted.playbackRate === 'number' &&
      validPlaybackRates.has(persisted.playbackRate as PlaybackRate)
        ? (persisted.playbackRate as PlaybackRate)
        : 1.0,
    autoAdvanceChapter:
      typeof persisted.autoAdvanceChapter === 'boolean' ? persisted.autoAdvanceChapter : true,
    sleepTimerMinutes: validSleepTimers.has(persisted.sleepTimerMinutes as SleepTimerOption)
      ? ((persisted.sleepTimerMinutes as SleepTimerOption) ?? null)
      : null,
  };
};
