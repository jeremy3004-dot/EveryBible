/**
 * Hydration sanitizers for every persisted store. Each store's sanitizer lives in its own module
 * under ./sanitizers/ (shared guard primitives in ./sanitizers/guards.ts); this file keeps the
 * public import path stable.
 */
export {
  defaultAuthPreferences,
  sanitizePersistedAuthState,
  sanitizePreferenceFieldStamps,
  sanitizeUserPreferences,
} from './sanitizers/authState';
export { sanitizePersistedAudioState } from './sanitizers/audioState';
export { getDefaultBibleTranslations, sanitizePersistedBibleState } from './sanitizers/bibleState';
export { sanitizePersistedLibraryState } from './sanitizers/libraryState';
export { sanitizePersistedProgressState } from './sanitizers/progressState';
export {
  isRuntimeCatalogSnapshotEntry,
  sanitizeLegacyPersistedRuntimeTranslations,
  sanitizeRuntimeCatalogSnapshotEntries,
  type RuntimeCatalogSnapshotEntry,
} from './sanitizers/runtimeTranslation';
