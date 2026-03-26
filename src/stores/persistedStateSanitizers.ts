import { bibleTranslations } from '../constants/translations';
import { getBookById } from '../constants/books';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import {
  BACKGROUND_MUSIC_CHOICES,
  PLAYBACK_RATES,
  REPEAT_MODES,
  SLEEP_TIMER_OPTIONS,
} from '../types/audio';
import { getAudioTrackId } from './audioQueueModel';
import type {
  BibleTranslation,
  PlaybackRate,
  BackgroundMusicChoice,
  RepeatMode,
  SleepTimerOption,
  TranslationAudioCatalog,
  TranslationCatalog,
  TranslationDownloadJob,
  TranslationInstallState,
  TranslationTextCatalog,
  User,
  UserPreferences,
} from '../types';

const supportedBibleTranslationIds = new Set(bibleTranslations.map((translation) => translation.id));
const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const validFontSizes = new Set<UserPreferences['fontSize']>(['small', 'medium', 'large']);
const validThemes = new Set<UserPreferences['theme']>(['dark', 'light', 'low-light']);
const validPlaybackRates = new Set<PlaybackRate>(PLAYBACK_RATES);
const validRepeatModes = new Set<RepeatMode>(REPEAT_MODES);
const validSleepTimers = new Set<SleepTimerOption>(SLEEP_TIMER_OPTIONS.map((option) => option.value));
const validBackgroundMusicChoices = new Set<BackgroundMusicChoice>(BACKGROUND_MUSIC_CHOICES);
const validAudioGranularities = new Set<BibleTranslation['audioGranularity']>([
  'none',
  'chapter',
  'verse',
]);
const validAudioProviders = new Set<NonNullable<BibleTranslation['audioProvider']>>([
  'bible-is',
  'ebible-webbe',
]);
const validInstallStates = new Set<TranslationInstallState>([
  'seeded',
  'remote-only',
  'downloading',
  'verifying',
  'installing',
  'installed',
  'failed',
  'rollback-available',
  'update-available',
]);
const validAudioStrategies = new Set<TranslationAudioCatalog['strategy']>([
  'provider',
  'stream-template',
  'audio-pack',
]);
const validDownloadJobKinds = new Set<TranslationDownloadJob['kind']>([
  'text-pack',
  'audio-pack',
  'audio-book',
  'translation-audio',
]);
const validDownloadJobStates = new Set<TranslationDownloadJob['state']>([
  'queued',
  'running',
  'paused',
  'reattaching',
  'failed',
  'completed',
  'cancelled',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const sanitizeRequiredString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const sanitizeOptionalFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const sanitizeUrlString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
};

const sanitizeIsoDateString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
};

const sanitizeTranslationId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return supportedBibleTranslationIds.has(normalized) ? normalized : null;
};

const isReadableTranslation = (translation: BibleTranslation): boolean => {
  if (translation.isDownloaded) {
    return true;
  }

  if (!translation.hasText) {
    return false;
  }

  return translation.source !== 'runtime' || Boolean(translation.textPackLocalPath);
};
const sanitizeBookId = (value: unknown): string | null =>
  typeof value === 'string' && getBookById(value) ? value : null;

const sanitizeBookIds = (value: unknown, fallback: string[] = []): string[] =>
  Array.isArray(value)
    ? value.filter(
        (bookId): bookId is string => typeof bookId === 'string' && Boolean(getBookById(bookId))
      )
    : fallback;

const sanitizeTranslationTextCatalog = (value: unknown): TranslationTextCatalog | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = sanitizeRequiredString(value.version);
  const downloadUrl = sanitizeUrlString(value.downloadUrl);
  const sha256 = sanitizeRequiredString(value.sha256);

  if (value.format !== 'sqlite' || !version || !downloadUrl || !sha256) {
    return null;
  }

  return {
    format: 'sqlite',
    version,
    downloadUrl,
    sha256,
    signature: sanitizeOptionalString(value.signature) ?? undefined,
  };
};

const sanitizeTranslationAudioCatalog = (value: unknown): TranslationAudioCatalog | null => {
  if (!isRecord(value) || !validAudioStrategies.has(value.strategy as TranslationAudioCatalog['strategy'])) {
    return null;
  }

  const strategy = value.strategy as TranslationAudioCatalog['strategy'];
  if (strategy === 'provider') {
    if (!validAudioProviders.has(value.provider as NonNullable<BibleTranslation['audioProvider']>)) {
      return null;
    }

    return {
      strategy,
      provider: value.provider as NonNullable<BibleTranslation['audioProvider']>,
      fileExtension: sanitizeOptionalString(value.fileExtension) ?? undefined,
      mimeType: sanitizeOptionalString(value.mimeType) ?? undefined,
      signature: sanitizeOptionalString(value.signature) ?? undefined,
    };
  }

  if (strategy === 'stream-template') {
    const baseUrl = sanitizeUrlString(value.baseUrl);
    const chapterPathTemplate = sanitizeRequiredString(value.chapterPathTemplate);
    if (!baseUrl || !chapterPathTemplate) {
      return null;
    }

    return {
      strategy,
      baseUrl,
      chapterPathTemplate,
      fileExtension: sanitizeOptionalString(value.fileExtension) ?? undefined,
      mimeType: sanitizeOptionalString(value.mimeType) ?? undefined,
      signature: sanitizeOptionalString(value.signature) ?? undefined,
    };
  }

  const downloadUrl = sanitizeUrlString(value.downloadUrl);
  const sha256 = sanitizeRequiredString(value.sha256);
  if (!downloadUrl || !sha256) {
    return null;
  }

  return {
    strategy,
    downloadUrl,
    sha256,
    fileExtension: sanitizeOptionalString(value.fileExtension) ?? undefined,
    mimeType: sanitizeOptionalString(value.mimeType) ?? undefined,
    signature: sanitizeOptionalString(value.signature) ?? undefined,
  };
};

const sanitizeTranslationCatalog = (value: unknown): TranslationCatalog | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = sanitizeRequiredString(value.version);
  const updatedAt = sanitizeIsoDateString(value.updatedAt);
  const text = sanitizeTranslationTextCatalog(value.text);
  const audio = sanitizeTranslationAudioCatalog(value.audio);

  if (!version || !updatedAt || (!text && !audio)) {
    return null;
  }

  return {
    version,
    updatedAt,
    minimumAppVersion: sanitizeOptionalString(value.minimumAppVersion) ?? undefined,
    text: text ?? undefined,
    audio: audio ?? undefined,
  };
};

const sanitizeTranslationDownloadJob = (value: unknown): TranslationDownloadJob | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = sanitizeRequiredString(value.id);
  const progress = sanitizeOptionalFiniteNumber(value.progress);
  const startedAt = sanitizeOptionalFiniteNumber(value.startedAt);
  const updatedAt = sanitizeOptionalFiniteNumber(value.updatedAt);

  if (
    !id ||
    progress === null ||
    startedAt === null ||
    updatedAt === null ||
    !validDownloadJobKinds.has(value.kind as TranslationDownloadJob['kind']) ||
    !validDownloadJobStates.has(value.state as TranslationDownloadJob['state'])
  ) {
    return null;
  }

  return {
    id,
    kind: value.kind as TranslationDownloadJob['kind'],
    state: value.state as TranslationDownloadJob['state'],
    progress: Math.max(0, Math.min(100, progress)),
    startedAt,
    updatedAt,
    bytesDownloaded: sanitizeOptionalFiniteNumber(value.bytesDownloaded) ?? undefined,
    bytesTotal: sanitizeOptionalFiniteNumber(value.bytesTotal) ?? undefined,
    error: sanitizeOptionalString(value.error) ?? undefined,
  };
};

const getDefaultInstallState = (translation: BibleTranslation): TranslationInstallState =>
  translation.hasText || translation.isDownloaded ? 'seeded' : 'remote-only';

const hydrateSeededTranslation = (
  defaultTranslation: BibleTranslation,
  persisted?: Record<string, unknown>
): BibleTranslation => {
  const isRuntimeSeed = defaultTranslation.source === 'runtime';
  const downloadedBooks = sanitizeBookIds(persisted?.downloadedBooks, defaultTranslation.downloadedBooks);
  const downloadedAudioBooks = sanitizeBookIds(
    persisted?.downloadedAudioBooks,
    defaultTranslation.downloadedAudioBooks
  );
  const textPackLocalPath = sanitizeOptionalString(persisted?.textPackLocalPath);
  const totalBooks = sanitizeOptionalFiniteNumber(persisted?.totalBooks);
  const sizeInMB = sanitizeOptionalFiniteNumber(persisted?.sizeInMB);
  const installState = validInstallStates.has(persisted?.installState as TranslationInstallState)
    ? (persisted?.installState as TranslationInstallState)
    : getDefaultInstallState(defaultTranslation);
  const hydrated: BibleTranslation = {
    ...defaultTranslation,
    name:
      (isRuntimeSeed ? sanitizeRequiredString(persisted?.name) : null) ?? defaultTranslation.name,
    abbreviation:
      (isRuntimeSeed ? sanitizeRequiredString(persisted?.abbreviation) : null) ??
      defaultTranslation.abbreviation,
    language:
      (isRuntimeSeed ? sanitizeRequiredString(persisted?.language) : null) ??
      defaultTranslation.language,
    description:
      (isRuntimeSeed ? sanitizeRequiredString(persisted?.description) : null) ??
      defaultTranslation.description,
    copyright:
      (isRuntimeSeed ? sanitizeRequiredString(persisted?.copyright) : null) ??
      defaultTranslation.copyright,
    isDownloaded:
      typeof persisted?.isDownloaded === 'boolean'
        ? persisted.isDownloaded
        : defaultTranslation.isDownloaded,
    downloadedBooks,
    downloadedAudioBooks,
    totalBooks:
      isRuntimeSeed && totalBooks !== null && Number.isInteger(totalBooks) && totalBooks > 0
        ? totalBooks
        : defaultTranslation.totalBooks,
    sizeInMB: isRuntimeSeed && sizeInMB !== null && sizeInMB >= 0 ? sizeInMB : defaultTranslation.sizeInMB,
    hasText:
      isRuntimeSeed && typeof persisted?.hasText === 'boolean'
        ? persisted.hasText
        : defaultTranslation.hasText,
    hasAudio:
      isRuntimeSeed && typeof persisted?.hasAudio === 'boolean'
        ? persisted.hasAudio
        : defaultTranslation.hasAudio,
    audioGranularity:
      isRuntimeSeed &&
      validAudioGranularities.has(persisted?.audioGranularity as BibleTranslation['audioGranularity'])
        ? (persisted?.audioGranularity as BibleTranslation['audioGranularity'])
        : defaultTranslation.audioGranularity,
    audioProvider:
      isRuntimeSeed &&
      validAudioProviders.has(persisted?.audioProvider as NonNullable<BibleTranslation['audioProvider']>)
        ? (persisted?.audioProvider as NonNullable<BibleTranslation['audioProvider']>)
        : defaultTranslation.audioProvider,
    source: isRuntimeSeed ? 'runtime' : 'bundled',
    installState,
    activeTextPackVersion: sanitizeOptionalString(persisted?.activeTextPackVersion),
    pendingTextPackVersion: sanitizeOptionalString(persisted?.pendingTextPackVersion),
    pendingTextPackLocalPath: sanitizeOptionalString(persisted?.pendingTextPackLocalPath),
    textPackLocalPath,
    rollbackTextPackVersion: sanitizeOptionalString(persisted?.rollbackTextPackVersion),
    rollbackTextPackLocalPath: sanitizeOptionalString(persisted?.rollbackTextPackLocalPath),
    lastInstallError: sanitizeOptionalString(persisted?.lastInstallError),
    catalog: sanitizeTranslationCatalog(persisted?.catalog) ?? defaultTranslation.catalog,
    activeDownloadJob: sanitizeTranslationDownloadJob(persisted?.activeDownloadJob),
  };

  if (hydrated.source === 'bundled' && hydrated.hasText) {
    hydrated.isDownloaded = true;
    if (hydrated.installState === 'remote-only') {
      hydrated.installState = 'seeded';
    }
  }

  if (hydrated.source === 'runtime' && !hydrated.textPackLocalPath && hydrated.installState === 'installed') {
    hydrated.isDownloaded = false;
    hydrated.installState = 'remote-only';
  }

  return hydrated;
};

const sanitizeRuntimeTranslation = (value: unknown): BibleTranslation | null => {
  if (!isRecord(value) || value.source !== 'runtime') {
    return null;
  }

  const id = sanitizeRequiredString(value.id)?.toLowerCase();
  const name = sanitizeRequiredString(value.name);
  const abbreviation = sanitizeRequiredString(value.abbreviation);
  const language = sanitizeRequiredString(value.language);
  const description = sanitizeRequiredString(value.description);
  const copyright = sanitizeRequiredString(value.copyright);
  const totalBooks = sanitizeOptionalFiniteNumber(value.totalBooks);
  const sizeInMB = sanitizeOptionalFiniteNumber(value.sizeInMB);
  const catalog = sanitizeTranslationCatalog(value.catalog);

  if (
    !id ||
    supportedBibleTranslationIds.has(id) ||
    !name ||
    !abbreviation ||
    !language ||
    !description ||
    !copyright ||
    totalBooks === null ||
    !Number.isInteger(totalBooks) ||
    totalBooks <= 0 ||
    sizeInMB === null ||
    sizeInMB < 0 ||
    typeof value.hasText !== 'boolean' ||
    typeof value.hasAudio !== 'boolean' ||
    !validAudioGranularities.has(value.audioGranularity as BibleTranslation['audioGranularity']) ||
    !validInstallStates.has(value.installState as TranslationInstallState) ||
    !catalog
  ) {
    return null;
  }

  if (value.hasText && !catalog.text) {
    return null;
  }

  if (value.hasAudio && !catalog.audio) {
    return null;
  }

  const runtimeTranslation: BibleTranslation = {
    id,
    name,
    abbreviation,
    language,
    description,
    copyright,
    isDownloaded: value.isDownloaded === true,
    downloadedBooks: sanitizeBookIds(value.downloadedBooks),
    downloadedAudioBooks: sanitizeBookIds(value.downloadedAudioBooks),
    totalBooks,
    sizeInMB,
    hasText: value.hasText,
    hasAudio: value.hasAudio,
    audioGranularity: value.audioGranularity as BibleTranslation['audioGranularity'],
    audioProvider:
      catalog.audio?.strategy === 'provider' ? catalog.audio.provider : undefined,
    source: 'runtime',
    installState: value.installState as TranslationInstallState,
    activeTextPackVersion: sanitizeOptionalString(value.activeTextPackVersion) ?? catalog.version,
    pendingTextPackVersion: sanitizeOptionalString(value.pendingTextPackVersion),
    pendingTextPackLocalPath: sanitizeOptionalString(value.pendingTextPackLocalPath),
    textPackLocalPath: sanitizeOptionalString(value.textPackLocalPath),
    rollbackTextPackVersion: sanitizeOptionalString(value.rollbackTextPackVersion),
    rollbackTextPackLocalPath: sanitizeOptionalString(value.rollbackTextPackLocalPath),
    lastInstallError: sanitizeOptionalString(value.lastInstallError),
    catalog,
    activeDownloadJob: sanitizeTranslationDownloadJob(value.activeDownloadJob),
  };

  if (!runtimeTranslation.textPackLocalPath && runtimeTranslation.installState === 'installed') {
    runtimeTranslation.installState = 'remote-only';
    runtimeTranslation.isDownloaded = false;
  }

  return runtimeTranslation;
};

export const getDefaultBibleTranslations = (): BibleTranslation[] =>
  bibleTranslations.map((translation) => hydrateSeededTranslation(translation));

const sanitizeBibleTranslations = (value: unknown): BibleTranslation[] => {
  if (!Array.isArray(value)) {
    return getDefaultBibleTranslations();
  }

  const persistedById = new Map<string, Record<string, unknown>>();

  value.forEach((entry) => {
    if (isRecord(entry) && typeof entry.id === 'string') {
      persistedById.set(entry.id, entry);
    }
  });

  const seededTranslations = bibleTranslations.map((defaultTranslation) =>
    hydrateSeededTranslation(defaultTranslation, persistedById.get(defaultTranslation.id))
  );

  const runtimeTranslationsById = new Map<string, BibleTranslation>();
  value.forEach((entry) => {
    const runtimeTranslation = sanitizeRuntimeTranslation(entry);
    if (runtimeTranslation) {
      runtimeTranslationsById.set(runtimeTranslation.id, runtimeTranslation);
    }
  });

  return [...seededTranslations, ...runtimeTranslationsById.values()];
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
  const normalizedCurrentTranslation =
    typeof persisted.currentTranslation === 'string'
      ? persisted.currentTranslation.trim().toLowerCase()
      : null;
  const selectedTranslation = normalizedCurrentTranslation
    ? translations.find((translation) => translation.id === normalizedCurrentTranslation)
    : null;

  return {
    currentBook,
    currentChapter,
    preferredChapterLaunchMode,
    currentTranslation:
      normalizedCurrentTranslation &&
      translationIds.has(normalizedCurrentTranslation) &&
      selectedTranslation &&
      isReadableTranslation(selectedTranslation)
        ? normalizedCurrentTranslation
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
    ? persisted.queue.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }

        const translationId = sanitizeTranslationId(entry.translationId);
        const bookId = sanitizeBookId(entry.bookId);
        const chapter =
          typeof entry.chapter === 'number' && Number.isInteger(entry.chapter) && entry.chapter > 0
            ? entry.chapter
            : null;
        const addedAt =
          typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : null;

        if (!translationId || !bookId || chapter == null || addedAt == null) {
          return [];
        }

        return [
          {
            id: getAudioTrackId(translationId, bookId, chapter),
            translationId,
            bookId,
            chapter,
            addedAt,
          },
        ];
      })
    : [];

  return {
    playbackRate:
      typeof persisted.playbackRate === 'number' &&
      validPlaybackRates.has(persisted.playbackRate as PlaybackRate)
        ? (persisted.playbackRate as PlaybackRate)
        : 1.0,
    autoAdvanceChapter:
      typeof persisted.autoAdvanceChapter === 'boolean' ? persisted.autoAdvanceChapter : true,
    repeatMode: validRepeatModes.has(persisted.repeatMode as RepeatMode)
      ? (persisted.repeatMode as RepeatMode)
      : 'off',
    sleepTimerMinutes: validSleepTimers.has(persisted.sleepTimerMinutes as SleepTimerOption)
      ? ((persisted.sleepTimerMinutes as SleepTimerOption) ?? null)
      : null,
    backgroundMusicChoice: validBackgroundMusicChoices.has(
      persisted.backgroundMusicChoice as BackgroundMusicChoice
    )
      ? (persisted.backgroundMusicChoice as BackgroundMusicChoice)
      : 'off',
    queue,
    queueIndex:
      typeof persisted.queueIndex === 'number' &&
      Number.isInteger(persisted.queueIndex) &&
      persisted.queueIndex >= 0 &&
      persisted.queueIndex < Math.max(queue.length, 1)
        ? persisted.queueIndex
        : 0,
    lastPlayedTranslationId: sanitizeTranslationId(persisted.lastPlayedTranslationId),
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
