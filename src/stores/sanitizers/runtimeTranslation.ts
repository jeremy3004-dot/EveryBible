/**
 * Runtime (catalog-downloaded) translations: the legacy inline row, the format-1 delta joined to
 * its cached catalog snapshot, and the snapshot entries themselves.
 */
import type { BibleTranslation, TranslationCatalog, TranslationInstallState } from '../../types';
import { normalizeCatalogTranslationId } from '../../services/translations/translationCatalogModel';
import { sanitizeBookIds, supportedBibleTranslationIds } from './bibleIds';
import {
  isRecord,
  sanitizeOptionalFiniteNumber,
  sanitizeOptionalString,
  sanitizeRequiredString,
} from './guards';
import {
  sanitizeTranslationCatalog,
  sanitizeTranslationDownloadJob,
  validAudioGranularities,
  validAudioProviders,
  validInstallStates,
} from './translationCatalog';

const sanitizeRuntimeTranslation = (value: unknown): BibleTranslation | null => {
  if (!isRecord(value) || value.source !== 'runtime') {
    return null;
  }

  const id = sanitizeRequiredString(value.id)?.toLowerCase();
  const normalizedId = id ? normalizeCatalogTranslationId(id) : null;
  const name = sanitizeRequiredString(value.name);
  const abbreviation = sanitizeRequiredString(value.abbreviation);
  const language = sanitizeRequiredString(value.language);
  const description = sanitizeRequiredString(value.description);
  const copyright = sanitizeRequiredString(value.copyright);
  const totalBooks = sanitizeOptionalFiniteNumber(value.totalBooks);
  const sizeInMB = sanitizeOptionalFiniteNumber(value.sizeInMB);
  const rawCatalog = value.catalog;
  // Older EL builds persisted zero text books and a blank catalog timestamp. Migrate only
  // that known shape; epoch explicitly means unknown legacy time until a verified catalog
  // refresh supplies generatedAt. All other timestamp and audio validation stays intact.
  const isLegacyElCatalog =
    Boolean(normalizedId && /^(el-|lq)[a-z0-9][a-z0-9-]*$/.test(normalizedId)) &&
    totalBooks === 0 &&
    value.hasText === false &&
    value.hasAudio === true &&
    isRecord(rawCatalog) &&
    rawCatalog.updatedAt === '' &&
    rawCatalog.text == null &&
    isRecord(rawCatalog.audio) &&
    rawCatalog.audio.strategy === 'el-manifest' &&
    rawCatalog.version === rawCatalog.audio.audioVersion;
  const catalog = sanitizeTranslationCatalog(
    isLegacyElCatalog ? { ...rawCatalog, updatedAt: '1970-01-01T00:00:00.000Z' } : rawCatalog
  );
  const isElAudioOnly =
    value.hasText === false &&
    value.hasAudio === true &&
    catalog?.audio?.strategy === 'el-manifest';

  if (
    !normalizedId ||
    supportedBibleTranslationIds.has(normalizedId) ||
    !name ||
    !abbreviation ||
    !language ||
    !description ||
    !copyright ||
    totalBooks === null ||
    !Number.isInteger(totalBooks) ||
    totalBooks < 0 ||
    (totalBooks === 0 && !isElAudioOnly) ||
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
    id: normalizedId,
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
    audioProvider: catalog.audio?.strategy === 'provider' ? catalog.audio.provider : undefined,
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

/**
 * Static, catalog-owned half of a runtime (downloaded-language) translation.
 *
 * These fields never change in response to anything the user does — only a catalog refresh
 * replaces them — so they live in their own MMKV key instead of being re-serialized inside
 * `bible-storage` on every set() (chapter navigation, download progress ticks, …). The store
 * persists only the mutable delta and re-joins the two on hydration. See
 * bibleTranslationPersistence.ts for the storage side of this split.
 */
export interface RuntimeCatalogSnapshotEntry {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  description: string;
  copyright: string;
  totalBooks: number;
  sizeInMB: number;
  hasText: boolean;
  hasAudio: boolean;
  audioGranularity: BibleTranslation['audioGranularity'];
  audioProvider?: BibleTranslation['audioProvider'];
  audioFilesetId?: string;
  catalog?: TranslationCatalog;
}

const sanitizeRuntimeCatalogSnapshotEntry = (
  value: unknown
): RuntimeCatalogSnapshotEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rawId = sanitizeRequiredString(value.id)?.toLowerCase();
  const id = rawId ? normalizeCatalogTranslationId(rawId) : null;
  const name = sanitizeRequiredString(value.name);
  const abbreviation = sanitizeRequiredString(value.abbreviation);
  const language = sanitizeRequiredString(value.language);
  const totalBooks = sanitizeOptionalFiniteNumber(value.totalBooks);
  const sizeInMB = sanitizeOptionalFiniteNumber(value.sizeInMB);

  if (
    !id ||
    supportedBibleTranslationIds.has(id) ||
    !name ||
    !abbreviation ||
    !language ||
    totalBooks === null ||
    !Number.isInteger(totalBooks) ||
    totalBooks < 0 ||
    sizeInMB === null ||
    sizeInMB < 0 ||
    typeof value.hasText !== 'boolean' ||
    typeof value.hasAudio !== 'boolean' ||
    !validAudioGranularities.has(value.audioGranularity as BibleTranslation['audioGranularity'])
  ) {
    return null;
  }

  const catalog = sanitizeTranslationCatalog(value.catalog);

  return {
    id,
    name,
    abbreviation,
    language,
    // Unlike a legacy full-object row, a blank description or copyright does not disqualify the
    // entry: the catalog legitimately publishes rows with no license text, and dropping those
    // used to make the translation vanish from the picker on the next launch.
    description: sanitizeRequiredString(value.description) ?? '',
    copyright: sanitizeRequiredString(value.copyright) ?? '',
    totalBooks,
    sizeInMB,
    hasText: value.hasText,
    hasAudio: value.hasAudio,
    audioGranularity: value.audioGranularity as BibleTranslation['audioGranularity'],
    audioProvider: validAudioProviders.has(
      value.audioProvider as NonNullable<BibleTranslation['audioProvider']>
    )
      ? (value.audioProvider as NonNullable<BibleTranslation['audioProvider']>)
      : undefined,
    audioFilesetId: sanitizeOptionalString(value.audioFilesetId) ?? undefined,
    catalog: catalog ?? undefined,
  };
};

/**
 * Full validation of runtime catalog metadata. Deliberately runs on the WRITE path (once per
 * catalog refresh, off the startup path) so hydration only needs the cheap shape check in
 * isRuntimeCatalogSnapshotEntry — the ~800 regex evaluations this used to cost on every cold
 * boot were the single largest chunk of bible-storage rehydration.
 */
export const sanitizeRuntimeCatalogSnapshotEntries = (
  value: unknown
): RuntimeCatalogSnapshotEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: RuntimeCatalogSnapshotEntry[] = [];
  const seenIds = new Set<string>();

  for (const rawEntry of value) {
    const entry = sanitizeRuntimeCatalogSnapshotEntry(rawEntry);
    if (entry && !seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      entries.push(entry);
    }
  }

  return entries;
};

/**
 * Read-path guard for the runtime catalog snapshot: scalar typeof checks only, no regex and no
 * per-field URL parsing. The payload was already deep-validated when it was written, so this
 * only has to reject gross corruption (truncated writes, hand-edited storage).
 */
export const isRuntimeCatalogSnapshotEntry = (
  value: unknown
): value is RuntimeCatalogSnapshotEntry =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  typeof value.name === 'string' &&
  typeof value.abbreviation === 'string' &&
  typeof value.language === 'string' &&
  typeof value.description === 'string' &&
  typeof value.copyright === 'string' &&
  typeof value.totalBooks === 'number' &&
  typeof value.sizeInMB === 'number' &&
  typeof value.hasText === 'boolean' &&
  typeof value.hasAudio === 'boolean' &&
  typeof value.audioGranularity === 'string' &&
  (value.catalog === undefined ||
    (isRecord(value.catalog) && typeof value.catalog.version === 'string'));

/**
 * Rebuild a runtime translation from its persisted delta plus the cached catalog snapshot.
 *
 * Offline guarantee: a delta that proves local content exists (an installed text pack, or
 * downloaded audio books) is ALWAYS restored, even with no snapshot entry at all — losing it
 * would hide a Bible the user already paid metered data for. Such a row gets placeholder
 * metadata that the next successful catalog refresh overwrites. A row with neither cached
 * metadata nor local content is dropped instead: there is nothing to render, and the catalog
 * refresh brings it back.
 */
const buildRuntimeTranslationFromDelta = (
  delta: Record<string, unknown>,
  snapshotById: ReadonlyMap<string, RuntimeCatalogSnapshotEntry> | null
): BibleTranslation | null => {
  const rawId = sanitizeRequiredString(delta.id)?.toLowerCase();
  const id = rawId ? normalizeCatalogTranslationId(rawId) : null;

  if (!id || supportedBibleTranslationIds.has(id)) {
    return null;
  }

  const snapshot = snapshotById?.get(id) ?? null;
  const downloadedBooks = sanitizeBookIds(delta.downloadedBooks);
  const downloadedAudioBooks = sanitizeBookIds(delta.downloadedAudioBooks);
  const textPackLocalPath = sanitizeOptionalString(delta.textPackLocalPath);
  const catalog = snapshot?.catalog ?? null;
  const hasLocalContent = Boolean(textPackLocalPath) || downloadedAudioBooks.length > 0;

  if (!catalog && !hasLocalContent) {
    return null;
  }

  const hasText = snapshot?.hasText ?? Boolean(textPackLocalPath);
  const hasAudio = snapshot?.hasAudio ?? downloadedAudioBooks.length > 0;
  const placeholderLabel = id.toUpperCase();
  const installState = validInstallStates.has(delta.installState as TranslationInstallState)
    ? (delta.installState as TranslationInstallState)
    : 'remote-only';

  const runtimeTranslation: BibleTranslation = {
    id,
    name: snapshot?.name ?? placeholderLabel,
    abbreviation: snapshot?.abbreviation ?? placeholderLabel,
    language: snapshot?.language ?? 'Other',
    description: snapshot?.description ?? '',
    copyright: snapshot?.copyright ?? '',
    isDownloaded: delta.isDownloaded === true,
    downloadedBooks,
    downloadedAudioBooks,
    totalBooks: snapshot?.totalBooks ?? 66,
    sizeInMB: snapshot?.sizeInMB ?? 0,
    hasText,
    hasAudio,
    audioGranularity: snapshot?.audioGranularity ?? (hasAudio ? 'chapter' : 'none'),
    audioProvider:
      catalog?.audio?.strategy === 'provider' ? catalog.audio.provider : snapshot?.audioProvider,
    source: 'runtime',
    installState,
    activeTextPackVersion:
      sanitizeOptionalString(delta.activeTextPackVersion) ?? catalog?.version ?? null,
    pendingTextPackVersion: sanitizeOptionalString(delta.pendingTextPackVersion),
    pendingTextPackLocalPath: sanitizeOptionalString(delta.pendingTextPackLocalPath),
    textPackLocalPath,
    rollbackTextPackVersion: sanitizeOptionalString(delta.rollbackTextPackVersion),
    rollbackTextPackLocalPath: sanitizeOptionalString(delta.rollbackTextPackLocalPath),
    lastInstallError: sanitizeOptionalString(delta.lastInstallError),
    catalog: catalog ?? undefined,
    activeDownloadJob: sanitizeTranslationDownloadJob(delta.activeDownloadJob),
  };

  if (!runtimeTranslation.textPackLocalPath && runtimeTranslation.installState === 'installed') {
    runtimeTranslation.installState = 'remote-only';
    runtimeTranslation.isDownloaded = false;
  }

  return runtimeTranslation;
};

/**
 * Hydrate the format-0 (inline) runtime rows out of a persisted translations array.
 *
 * Used by the version-0 → 1 migration to build the catalog snapshot from exactly what a boot on
 * the old format would have produced — including sanitizeRuntimeTranslation's legacy Every
 * Language fixup for rows whose catalog carries a blank `updatedAt`. Re-deriving the snapshot
 * from the raw records instead would silently drop those EL rows' audio catalog.
 */
export const sanitizeLegacyPersistedRuntimeTranslations = (value: unknown): BibleTranslation[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const translations: BibleTranslation[] = [];

  for (const entry of value) {
    const translation = sanitizeRuntimeTranslation(entry);
    if (translation) {
      translations.push(translation);
    }
  }

  return translations;
};

// Accepts both persisted shapes. Format 1 stores a delta whose static half lives in the runtime
// catalog snapshot; format 0 (and any blob a failed migration left alone) inlines the full
// object, which still has to hydrate byte-for-byte.
export const sanitizePersistedRuntimeTranslation = (
  value: unknown,
  snapshotById: ReadonlyMap<string, RuntimeCatalogSnapshotEntry> | null
): BibleTranslation | null => {
  if (!isRecord(value) || value.source !== 'runtime') {
    return null;
  }

  if (typeof value.name === 'string') {
    return sanitizeRuntimeTranslation(value);
  }

  return buildRuntimeTranslationFromDelta(value, snapshotById);
};
