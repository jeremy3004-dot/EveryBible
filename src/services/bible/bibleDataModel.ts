import type {
  AudioGranularity,
  AudioProvider,
  BibleTranslation,
  SignedCatalogEnvelope,
  TranslationAudioBookCatalog,
  TranslationAudioCatalog,
  TranslationCatalogManifest,
  TranslationCatalogManifestTranslation,
  TranslationTextCatalog,
} from '../../types';
import { sanitizeBibleAssetReference } from './bibleAssetBaseUrl';

export const BUNDLED_BIBLE_SCHEMA_VERSION = 6;

const validAudioGranularities = new Set<AudioGranularity>(['none', 'chapter', 'verse']);
const validAudioStrategies = new Set<TranslationAudioCatalog['strategy']>([
  'provider',
  'stream-template',
  'audio-pack',
]);
const validAudioProviders = new Set<AudioProvider>([
  'bible-is',
  'ebible-webbe',
]);

export type BundledBibleDatabaseStatus = {
  verseCount: number;
  schemaVersion: number;
  hasSearchIndex: boolean;
  formattedVerseCount: number;
};

export type { SignedCatalogEnvelope, TranslationCatalogManifest };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeRequiredString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const sanitizeIsoDateString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
};

const sanitizeUrlString = (value: unknown): string | null =>
  sanitizeBibleAssetReference(value);

const parseAudioBooks = (
  value: unknown
): Record<string, TranslationAudioBookCatalog> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const books = Object.entries(value).reduce<Record<string, TranslationAudioBookCatalog>>(
    (accumulator, [bookId, bookValue]) => {
      if (!isRecord(bookValue)) {
        return accumulator;
      }

      const catalog: TranslationAudioBookCatalog = {};

      if (
        typeof bookValue.totalChapters === 'number' &&
        Number.isFinite(bookValue.totalChapters) &&
        bookValue.totalChapters > 0
      ) {
        catalog.totalChapters = bookValue.totalChapters;
      }

      if (
        typeof bookValue.totalBytes === 'number' &&
        Number.isFinite(bookValue.totalBytes) &&
        bookValue.totalBytes >= 0
      ) {
        catalog.totalBytes = bookValue.totalBytes;
      }

      if (Object.keys(catalog).length > 0) {
        accumulator[bookId] = catalog;
      }

      return accumulator;
    },
    {}
  );

  return Object.keys(books).length > 0 ? books : undefined;
};

const parseTextCatalog = (value: unknown): TranslationTextCatalog | null => {
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
    ...(sanitizeRequiredString(value.signature)
      ? { signature: sanitizeRequiredString(value.signature) ?? undefined }
      : {}),
  };
};

const parseAudioCatalog = (value: unknown): TranslationAudioCatalog | null => {
  if (!isRecord(value) || !validAudioStrategies.has(value.strategy as TranslationAudioCatalog['strategy'])) {
    return null;
  }

  const strategy = value.strategy as TranslationAudioCatalog['strategy'];
  if (strategy === 'provider') {
    if (!validAudioProviders.has(value.provider as AudioProvider)) {
      return null;
    }

    const books = parseAudioBooks(value.books);

    return {
      strategy,
      provider: value.provider as AudioProvider,
      ...(sanitizeRequiredString(value.fileExtension)
        ? { fileExtension: sanitizeRequiredString(value.fileExtension) ?? undefined }
        : {}),
      ...(sanitizeRequiredString(value.mimeType)
        ? { mimeType: sanitizeRequiredString(value.mimeType) ?? undefined }
        : {}),
      ...(sanitizeRequiredString(value.signature)
        ? { signature: sanitizeRequiredString(value.signature) ?? undefined }
        : {}),
      ...(books ? { books } : {}),
    };
  }

  if (strategy === 'stream-template') {
    const baseUrl = sanitizeUrlString(value.baseUrl);
    const chapterPathTemplate = sanitizeRequiredString(value.chapterPathTemplate);
    if (!baseUrl || !chapterPathTemplate) {
      return null;
    }

    const books = parseAudioBooks(value.books);

    return {
      strategy,
      baseUrl,
      chapterPathTemplate,
      ...(sanitizeRequiredString(value.fileExtension)
        ? { fileExtension: sanitizeRequiredString(value.fileExtension) ?? undefined }
        : {}),
      ...(sanitizeRequiredString(value.mimeType)
        ? { mimeType: sanitizeRequiredString(value.mimeType) ?? undefined }
        : {}),
      ...(sanitizeRequiredString(value.signature)
        ? { signature: sanitizeRequiredString(value.signature) ?? undefined }
        : {}),
      ...(books ? { books } : {}),
    };
  }

  const downloadUrl = sanitizeUrlString(value.downloadUrl);
  const sha256 = sanitizeRequiredString(value.sha256);
  if (!downloadUrl || !sha256) {
    return null;
  }

  const books = parseAudioBooks(value.books);

  return {
    strategy,
    downloadUrl,
    sha256,
    ...(sanitizeRequiredString(value.fileExtension)
      ? { fileExtension: sanitizeRequiredString(value.fileExtension) ?? undefined }
      : {}),
    ...(sanitizeRequiredString(value.mimeType)
      ? { mimeType: sanitizeRequiredString(value.mimeType) ?? undefined }
      : {}),
    ...(sanitizeRequiredString(value.signature)
      ? { signature: sanitizeRequiredString(value.signature) ?? undefined }
      : {}),
    ...(books ? { books } : {}),
  };
};

const parseManifestTranslation = (value: unknown): TranslationCatalogManifestTranslation | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = sanitizeRequiredString(value.id);
  const name = sanitizeRequiredString(value.name);
  const abbreviation = sanitizeRequiredString(value.abbreviation);
  const language = sanitizeRequiredString(value.language);
  const description = sanitizeRequiredString(value.description);
  const copyright = sanitizeRequiredString(value.copyright);
  const totalBooks =
    typeof value.totalBooks === 'number' && Number.isInteger(value.totalBooks) && value.totalBooks > 0
      ? value.totalBooks
      : null;
  const sizeInMB =
    typeof value.sizeInMB === 'number' && Number.isFinite(value.sizeInMB) && value.sizeInMB >= 0
      ? value.sizeInMB
      : null;
  const text = parseTextCatalog(value.text);
  const audio = parseAudioCatalog(value.audio);

  if (
    !id ||
    !name ||
    !abbreviation ||
    !language ||
    !description ||
    !copyright ||
    typeof value.hasText !== 'boolean' ||
    typeof value.hasAudio !== 'boolean' ||
    !validAudioGranularities.has(value.audioGranularity as AudioGranularity) ||
    totalBooks === null ||
    sizeInMB === null ||
    (value.hasText && !text) ||
    (value.hasAudio && !audio)
  ) {
    return null;
  }

  return {
    id,
    name,
    abbreviation,
    language,
    description,
    copyright,
    hasText: value.hasText,
    hasAudio: value.hasAudio,
    audioGranularity: value.audioGranularity as AudioGranularity,
    totalBooks,
    sizeInMB,
    text: text ?? undefined,
    audio: audio ?? undefined,
  };
};

export function parseTranslationCatalogManifest(value: unknown): TranslationCatalogManifest {
  if (!isRecord(value)) {
    throw new Error('Signed manifest payload must be an object');
  }

  const manifestVersion = sanitizeRequiredString(value.manifestVersion);
  const issuedAt = sanitizeIsoDateString(value.issuedAt);
  const translations = Array.isArray(value.translations)
    ? value.translations
        .map((translation) => parseManifestTranslation(translation))
        .filter((translation): translation is TranslationCatalogManifestTranslation => translation !== null)
    : null;

  if (!manifestVersion || !issuedAt || !translations) {
    throw new Error('Signed manifest payload is missing required fields');
  }

  return {
    manifestVersion,
    issuedAt,
    translations,
  };
}

export function isManifestVerificationRuntimeSupported(): boolean {
  return typeof globalThis.TextDecoder === 'function' && Boolean(globalThis.crypto?.subtle);
}

async function loadJose() {
  return import('jose');
}

export async function verifySignedCatalogManifest(
  envelope: SignedCatalogEnvelope,
  publicKeyPem: string
): Promise<TranslationCatalogManifest> {
  if (!isManifestVerificationRuntimeSupported()) {
    throw new Error(
      'Signed manifest verification requires TextDecoder and WebCrypto subtle support on this runtime'
    );
  }

  const { compactVerify, importSPKI } = await loadJose();
  const publicKey = await importSPKI(publicKeyPem, envelope.algorithm);
  const { protectedHeader, payload } = await compactVerify(envelope.compactJws, publicKey, {
    algorithms: [envelope.algorithm],
  });

  if (protectedHeader.kid && protectedHeader.kid !== envelope.keyId) {
    throw new Error('Signed manifest key ID mismatch');
  }

  const decoded = new globalThis.TextDecoder().decode(payload);
  return parseTranslationCatalogManifest(JSON.parse(decoded));
}

export function stageTranslationPackCandidate(
  translation: BibleTranslation,
  candidate: { version: string; localPath: string }
): BibleTranslation {
  return {
    ...translation,
    installState: 'installing',
    pendingTextPackVersion: candidate.version,
    pendingTextPackLocalPath: candidate.localPath,
    lastInstallError: null,
  };
}

export function activateTranslationPackCandidate(translation: BibleTranslation): BibleTranslation {
  if (!translation.pendingTextPackVersion || !translation.pendingTextPackLocalPath) {
    return translation;
  }

  return {
    ...translation,
    isDownloaded: true,
    installState: 'installed',
    rollbackTextPackVersion: translation.activeTextPackVersion ?? null,
    rollbackTextPackLocalPath: translation.textPackLocalPath ?? null,
    activeTextPackVersion: translation.pendingTextPackVersion,
    textPackLocalPath: translation.pendingTextPackLocalPath,
    pendingTextPackVersion: null,
    pendingTextPackLocalPath: null,
    lastInstallError: null,
  };
}

export function failTranslationPackCandidate(
  translation: BibleTranslation,
  error: string
): BibleTranslation {
  const hasRollbackTarget = Boolean(
    translation.activeTextPackVersion || translation.textPackLocalPath
  );

  return {
    ...translation,
    installState: hasRollbackTarget ? 'rollback-available' : 'failed',
    pendingTextPackVersion: null,
    pendingTextPackLocalPath: null,
    lastInstallError: error,
  };
}

export function rollbackTranslationPack(translation: BibleTranslation): BibleTranslation {
  if (!translation.rollbackTextPackVersion || !translation.rollbackTextPackLocalPath) {
    return translation;
  }

  return {
    ...translation,
    installState: 'installed',
    activeTextPackVersion: translation.rollbackTextPackVersion,
    textPackLocalPath: translation.rollbackTextPackLocalPath,
    rollbackTextPackVersion: null,
    rollbackTextPackLocalPath: null,
    pendingTextPackVersion: null,
    pendingTextPackLocalPath: null,
    lastInstallError: null,
  };
}

export function buildInstalledBibleDatabaseSource(
  translationId: string,
  localPath: string
): {
  kind: 'installed';
  translationId: string;
  databaseName: string;
  directory: string;
} | null {
  const normalizedPath = localPath.replace(/\/+$/, '');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  if (lastSlashIndex <= 0 || lastSlashIndex === normalizedPath.length - 1) {
    return null;
  }

  return {
    kind: 'installed',
    translationId,
    databaseName: normalizedPath.slice(lastSlashIndex + 1),
    directory: normalizedPath.slice(0, lastSlashIndex),
  };
}

export function isBundledBibleDatabaseReady(
  status: BundledBibleDatabaseStatus,
  minimumReadyVerseCount: number
): boolean {
  return (
    status.verseCount >= minimumReadyVerseCount &&
    status.schemaVersion >= BUNDLED_BIBLE_SCHEMA_VERSION &&
    status.hasSearchIndex &&
    // Existing installs can keep an older copied DB with matching schema/count but no formatting data.
    status.formattedVerseCount > 0
  );
}

export function buildBibleSearchQuery(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.map((token) => token.trim()) ?? [];
  const normalizedTokens = tokens.filter((token) => token.length > 0);

  if (normalizedTokens.length === 0) {
    return null;
  }

  return normalizedTokens.map((token) => `${token}*`).join(' ');
}
