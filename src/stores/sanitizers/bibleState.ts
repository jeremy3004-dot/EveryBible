/** Sanitizer for the persisted `bible-storage` blob: reader position and translations. */
import { bibleTranslations } from '../../constants/translations';
import { getBookById } from '../../constants/books';
import type { BibleTranslation, TranslationInstallState } from '../../types';
import { sanitizeBookId, sanitizeBookIds } from './bibleIds';
import {
  isRecord,
  sanitizeOptionalFiniteNumber,
  sanitizeOptionalString,
  sanitizeRequiredString,
} from './guards';
import {
  sanitizePersistedRuntimeTranslation,
  type RuntimeCatalogSnapshotEntry,
} from './runtimeTranslation';
import {
  sanitizeTranslationCatalog,
  sanitizeTranslationDownloadJob,
  validAudioGranularities,
  validAudioProviders,
  validInstallStates,
} from './translationCatalog';

const isReadableTranslation = (translation: BibleTranslation): boolean => {
  if (translation.isDownloaded) {
    return true;
  }

  // Audio-only translations (no text) are valid selections when they have audio.
  // The write path (setCurrentTranslation) already validated canPlayAudio before saving,
  // so the stored value can be trusted on rehydration.
  if (!translation.hasText && translation.hasAudio) {
    return true;
  }

  if (!translation.hasText) {
    return false;
  }

  return translation.source !== 'runtime' || Boolean(translation.textPackLocalPath);
};

const getDefaultInstallState = (translation: BibleTranslation): TranslationInstallState =>
  translation.hasText || translation.isDownloaded ? 'seeded' : 'remote-only';

const hydrateSeededTranslation = (
  defaultTranslation: BibleTranslation,
  persisted?: Record<string, unknown>
): BibleTranslation => {
  const isRuntimeSeed = defaultTranslation.source === 'runtime';
  const downloadedBooks = sanitizeBookIds(
    persisted?.downloadedBooks,
    defaultTranslation.downloadedBooks
  );
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
    sizeInMB:
      isRuntimeSeed && sizeInMB !== null && sizeInMB >= 0 ? sizeInMB : defaultTranslation.sizeInMB,
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
      validAudioGranularities.has(
        persisted?.audioGranularity as BibleTranslation['audioGranularity']
      )
        ? (persisted?.audioGranularity as BibleTranslation['audioGranularity'])
        : defaultTranslation.audioGranularity,
    audioProvider:
      isRuntimeSeed &&
      validAudioProviders.has(
        persisted?.audioProvider as NonNullable<BibleTranslation['audioProvider']>
      )
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

  // A runtime translation is readable only when its text pack is actually on disk —
  // isTranslationReadableLocally encodes the same rule. Any persisted row that claims to be
  // downloaded without a local path is stale and must be walked back, or the reader treats it
  // as installed and renders empty chapters with no way to recover. This deliberately covers
  // 'seeded' as well as 'installed': devices that ran an earlier build still carry a Hindi row
  // seeded as bundled text, which was never in the bundled database.
  if (hydrated.source === 'runtime' && !hydrated.textPackLocalPath) {
    hydrated.isDownloaded = false;
    if (hydrated.installState === 'installed' || hydrated.installState === 'seeded') {
      hydrated.installState = 'remote-only';
    }
  }

  return hydrated;
};

export const getDefaultBibleTranslations = (): BibleTranslation[] =>
  bibleTranslations.map((translation) => hydrateSeededTranslation(translation));

const sanitizeBibleTranslations = (
  value: unknown,
  runtimeCatalogById: ReadonlyMap<string, RuntimeCatalogSnapshotEntry> | null = null
): BibleTranslation[] => {
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
    const runtimeTranslation = sanitizePersistedRuntimeTranslation(entry, runtimeCatalogById);
    if (runtimeTranslation) {
      runtimeTranslationsById.set(runtimeTranslation.id, runtimeTranslation);
    }
  });

  return [...seededTranslations, ...runtimeTranslationsById.values()];
};

export const sanitizePersistedBibleState = (
  value: unknown,
  // Cached static metadata for runtime translations, read once by the caller (bibleStore.merge)
  // so hydration never iterates the catalog more than once.
  runtimeCatalogById: ReadonlyMap<string, RuntimeCatalogSnapshotEntry> | null = null
) => {
  const persisted = isRecord(value) ? value : {};
  const translations = sanitizeBibleTranslations(persisted.translations, runtimeCatalogById);
  const translationIds = new Set(translations.map((translation) => translation.id));
  const persistedCurrentBook = sanitizeBookId(persisted.currentBook);
  // The chapter belongs to its book: without a valid book it would land on Genesis at that
  // chapter, and past the book's end (Jude 2) it opens a reader with nothing in it.
  const persistedCurrentChapter =
    typeof persisted.currentChapter === 'number' &&
    Number.isInteger(persisted.currentChapter) &&
    persisted.currentChapter > 0 &&
    persisted.currentChapter <= (getBookById(persistedCurrentBook ?? '')?.chapters ?? 0)
      ? persisted.currentChapter
      : null;
  const currentBook = persistedCurrentBook ?? 'GEN';
  const currentChapter = persistedCurrentChapter ?? 1;
  const preferredChapterLaunchMode: 'listen' | 'read' =
    persisted.preferredChapterLaunchMode === 'read' ? 'read' : 'listen';
  const preferredTranslationLanguage =
    typeof persisted.preferredTranslationLanguage === 'string' &&
    persisted.preferredTranslationLanguage.trim().length > 0
      ? persisted.preferredTranslationLanguage.trim()
      : null;
  const normalizedCurrentTranslation =
    typeof persisted.currentTranslation === 'string'
      ? persisted.currentTranslation.trim().toLowerCase()
      : null;
  const selectedTranslation = normalizedCurrentTranslation
    ? translations.find((translation) => translation.id === normalizedCurrentTranslation)
    : null;
  const keepsCurrentTranslation = Boolean(
    normalizedCurrentTranslation &&
    translationIds.has(normalizedCurrentTranslation) &&
    selectedTranslation &&
    isReadableTranslation(selectedTranslation)
  );

  return {
    currentBook,
    currentChapter,
    hasReaderHistory: persistedCurrentBook != null && persistedCurrentChapter != null,
    preferredChapterLaunchMode,
    preferredTranslationLanguage,
    currentTranslation:
      keepsCurrentTranslation && normalizedCurrentTranslation
        ? normalizedCurrentTranslation
        : 'bsb',
    // The stamp belongs to the persisted choice; a choice that fell back to BSB has none.
    currentTranslationChosenAt:
      keepsCurrentTranslation &&
      typeof persisted.currentTranslationChosenAt === 'string' &&
      Number.isFinite(Date.parse(persisted.currentTranslationChosenAt))
        ? persisted.currentTranslationChosenAt
        : null,
    translations,
  };
};
