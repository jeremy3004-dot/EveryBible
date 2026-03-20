import { bibleTranslations } from '../constants/translations';
import { getBookById } from '../constants/books';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { PLAYBACK_RATES, SLEEP_TIMER_OPTIONS } from '../types/audio';
import type {
  BibleTranslation,
  PlaybackRate,
  SleepTimerOption,
  User,
  UserPreferences,
} from '../types';

const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const validFontSizes = new Set<UserPreferences['fontSize']>(['small', 'medium', 'large']);
const validThemes = new Set<UserPreferences['theme']>(['dark', 'light']);
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

    return {
      ...defaultTranslation,
      isDownloaded:
        typeof persisted.isDownloaded === 'boolean'
          ? persisted.isDownloaded
          : defaultTranslation.isDownloaded,
      downloadedBooks,
      downloadedAudioBooks,
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
  const preferredChapterLaunchMode: 'listen' | 'read' =
    persisted.preferredChapterLaunchMode === 'listen' ? 'listen' : 'read';

  return {
    currentBook,
    currentChapter,
    preferredChapterLaunchMode,
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
  const queue = Array.isArray(persisted.queue)
    ? persisted.queue.filter(
        (entry): entry is { id: string; bookId: string; chapter: number; addedAt: number } =>
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.bookId === 'string' &&
          Boolean(getBookById(entry.bookId)) &&
          typeof entry.chapter === 'number' &&
          Number.isInteger(entry.chapter) &&
          entry.chapter > 0 &&
          typeof entry.addedAt === 'number' &&
          Number.isFinite(entry.addedAt)
      )
    : [];

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
    queue,
    queueIndex:
      typeof persisted.queueIndex === 'number' &&
      Number.isInteger(persisted.queueIndex) &&
      persisted.queueIndex >= 0 &&
      persisted.queueIndex < Math.max(queue.length, 1)
        ? persisted.queueIndex
        : 0,
    lastPlayedBookId: sanitizeBookId(persisted.lastPlayedBookId),
    lastPlayedChapter:
      typeof persisted.lastPlayedChapter === 'number' &&
      Number.isInteger(persisted.lastPlayedChapter) &&
      persisted.lastPlayedChapter > 0
        ? persisted.lastPlayedChapter
        : null,
    lastPosition:
      typeof persisted.lastPosition === 'number' &&
      Number.isFinite(persisted.lastPosition) &&
      persisted.lastPosition >= 0
        ? persisted.lastPosition
        : 0,
  };
};

export const sanitizePersistedLibraryState = (value: unknown) => {
  const persisted = isRecord(value) ? value : {};
  const favorites = Array.isArray(persisted.favorites)
    ? persisted.favorites.filter(
        (entry): entry is { id: string; bookId: string; chapter: number; addedAt: number } =>
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.bookId === 'string' &&
          Boolean(getBookById(entry.bookId)) &&
          typeof entry.chapter === 'number' &&
          Number.isInteger(entry.chapter) &&
          entry.chapter > 0 &&
          typeof entry.addedAt === 'number' &&
          Number.isFinite(entry.addedAt)
      )
    : [];

  const playlists = Array.isArray(persisted.playlists)
    ? persisted.playlists.filter(isRecord).map((playlist) => ({
        id: typeof playlist.id === 'string' ? playlist.id : `playlist-${Date.now()}`,
        title:
          typeof playlist.title === 'string' && playlist.title.trim().length > 0
            ? playlist.title
            : 'Untitled',
        createdAt:
          typeof playlist.createdAt === 'number' && Number.isFinite(playlist.createdAt)
            ? playlist.createdAt
            : Date.now(),
        updatedAt:
          typeof playlist.updatedAt === 'number' && Number.isFinite(playlist.updatedAt)
            ? playlist.updatedAt
            : Date.now(),
        entries: Array.isArray(playlist.entries)
          ? playlist.entries.filter(
              (entry): entry is { id: string; bookId: string; chapter: number; addedAt: number } =>
                isRecord(entry) &&
                typeof entry.id === 'string' &&
                typeof entry.bookId === 'string' &&
                Boolean(getBookById(entry.bookId)) &&
                typeof entry.chapter === 'number' &&
                Number.isInteger(entry.chapter) &&
                entry.chapter > 0 &&
                typeof entry.addedAt === 'number' &&
                Number.isFinite(entry.addedAt)
            )
          : [],
      }))
    : [];

  const history = Array.isArray(persisted.history)
    ? persisted.history.filter(
        (entry): entry is {
          id: string;
          bookId: string;
          chapter: number;
          listenedAt: number;
          progress: number;
        } =>
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.bookId === 'string' &&
          Boolean(getBookById(entry.bookId)) &&
          typeof entry.chapter === 'number' &&
          Number.isInteger(entry.chapter) &&
          entry.chapter > 0 &&
          typeof entry.listenedAt === 'number' &&
          Number.isFinite(entry.listenedAt) &&
          typeof entry.progress === 'number' &&
          Number.isFinite(entry.progress)
      )
    : [];

  return {
    favorites,
    playlists,
    history,
  };
};
