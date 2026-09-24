/** Sanitizers for a translation's catalog block (text, audio, timing) and its download job. */
import type {
  BibleTranslation,
  TranslationAudioCatalog,
  TranslationCatalog,
  TranslationDownloadJob,
  TranslationInstallState,
  TranslationTimingCatalog,
  TranslationTextCatalog,
} from '../../types';
import {
  requireSecureMediaUrl,
  sanitizeBibleAssetReference,
} from '../../services/bible/bibleAssetBaseUrl';
import {
  isRecord,
  sanitizeIsoDateString,
  sanitizeOptionalFiniteNumber,
  sanitizeOptionalString,
  sanitizeRequiredString,
} from './guards';

export const validAudioGranularities = new Set<BibleTranslation['audioGranularity']>([
  'none',
  'chapter',
  'verse',
]);
export const validAudioProviders = new Set<NonNullable<BibleTranslation['audioProvider']>>([
  'bible-is',
  'ebible-webbe',
]);
export const validInstallStates = new Set<TranslationInstallState>([
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
  'el-manifest',
]);

// Every Language catalogBaseUrl must be an absolute http(s) origin; relative refs are not
// valid here (unlike manifestUrl, which may be relative and is resolved against this base).
const HTTP_URL_RE = /^https?:\/\//i;
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

// A job in one of these states persisted across an app kill is stale — the
// download cannot still be running, so it is reset to 'failed' on rehydrate.
// Hoisted to module scope so it isn't reallocated per persisted download job.
const staleActiveDownloadJobStates = new Set<TranslationDownloadJob['state']>([
  'queued',
  'running',
  'reattaching',
]);

const sanitizeUrlString = (value: unknown): string | null => sanitizeBibleAssetReference(value);

const sanitizeTranslationTextCatalog = (value: unknown): TranslationTextCatalog | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = sanitizeRequiredString(value.version);
  const downloadUrl = sanitizeUrlString(value.downloadUrl);
  const sha256 = sanitizeRequiredString(value.sha256);
  const verseCount =
    typeof value.verseCount === 'number' &&
    Number.isSafeInteger(value.verseCount) &&
    value.verseCount > 0
      ? value.verseCount
      : undefined;

  if (value.format !== 'sqlite' || !version || !downloadUrl || !sha256) {
    return null;
  }

  return {
    format: 'sqlite',
    version,
    downloadUrl,
    sha256,
    ...(verseCount !== undefined ? { verseCount } : {}),
    signature: sanitizeOptionalString(value.signature) ?? undefined,
  };
};

const sanitizeTranslationAudioCatalog = (value: unknown): TranslationAudioCatalog | null => {
  if (
    !isRecord(value) ||
    !validAudioStrategies.has(value.strategy as TranslationAudioCatalog['strategy'])
  ) {
    return null;
  }

  const strategy = value.strategy as TranslationAudioCatalog['strategy'];
  if (strategy === 'provider') {
    if (
      !validAudioProviders.has(value.provider as NonNullable<BibleTranslation['audioProvider']>)
    ) {
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

  if (strategy === 'el-manifest') {
    // Every Language signed-manifest audio. Chapter URLs are resolved from a verified,
    // immutable manifest fetched via manifestUrl (relative or absolute) against
    // catalogBaseUrl (absolute http(s) only). Any missing/invalid field rejects the whole
    // block to null — an audio-only EL entry then drops out during catalog sanitization.
    const manifestUrl = sanitizeRequiredString(value.manifestUrl);
    const audioVersion = sanitizeRequiredString(value.audioVersion);
    const catalogBaseUrl = sanitizeRequiredString(value.catalogBaseUrl);
    if (!manifestUrl || !audioVersion || !catalogBaseUrl || !HTTP_URL_RE.test(catalogBaseUrl)) {
      return null;
    }

    return {
      strategy,
      manifestUrl,
      audioVersion,
      catalogBaseUrl: requireSecureMediaUrl(catalogBaseUrl),
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

const sanitizeTranslationTimingCatalog = (value: unknown): TranslationTimingCatalog | null => {
  if (!isRecord(value) || value.strategy !== 'stream-template') {
    return null;
  }

  const baseUrl = sanitizeUrlString(value.baseUrl);
  const chapterPathTemplate = sanitizeRequiredString(value.chapterPathTemplate);
  if (!baseUrl || !chapterPathTemplate) {
    return null;
  }

  return {
    strategy: 'stream-template',
    baseUrl,
    chapterPathTemplate,
    fileExtension: sanitizeOptionalString(value.fileExtension) ?? undefined,
    mimeType: sanitizeOptionalString(value.mimeType) ?? undefined,
  };
};

export const sanitizeTranslationCatalog = (value: unknown): TranslationCatalog | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = sanitizeRequiredString(value.version);
  const updatedAt = sanitizeIsoDateString(value.updatedAt);
  const text = sanitizeTranslationTextCatalog(value.text);
  const audio = sanitizeTranslationAudioCatalog(value.audio);
  const timing = sanitizeTranslationTimingCatalog(value.timing);

  if (!version || !updatedAt || (!text && !audio)) {
    return null;
  }

  return {
    version,
    updatedAt,
    minimumAppVersion: sanitizeOptionalString(value.minimumAppVersion) ?? undefined,
    text: text ?? undefined,
    audio: audio ?? undefined,
    timing: timing ?? undefined,
  };
};

export const sanitizeTranslationDownloadJob = (value: unknown): TranslationDownloadJob | null => {
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

  const rawState = value.state as TranslationDownloadJob['state'];
  const state: TranslationDownloadJob['state'] = staleActiveDownloadJobStates.has(rawState)
    ? 'failed'
    : rawState;

  return {
    id,
    kind: value.kind as TranslationDownloadJob['kind'],
    state,
    progress: Math.max(0, Math.min(100, progress)),
    startedAt,
    updatedAt,
    bytesDownloaded: sanitizeOptionalFiniteNumber(value.bytesDownloaded) ?? undefined,
    bytesTotal: sanitizeOptionalFiniteNumber(value.bytesTotal) ?? undefined,
    error: sanitizeOptionalString(value.error) ?? undefined,
  };
};
