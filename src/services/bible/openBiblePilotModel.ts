import type {
  TranslationAudioBookCatalog,
  TranslationAudioCoverage,
  TranslationCatalog,
} from '../../types';

export type OpenBiblePilotStatus =
  | 'planned'
  | 'staged'
  | 'published'
  | 'verified'
  | 'skipped';

export type OpenBiblePilotTimingMode = 'full-only' | 'none';
export type OpenBiblePilotTextDirection = 'ltr' | 'rtl';

export interface OpenBiblePilotRegistryTranslation {
  translationId: string;
  name: string;
  abbreviation: string;
  sortOrder: number;
  languageCode: string;
  languageName: string;
  textDirection: OpenBiblePilotTextDirection;
  licenseType: string | null;
  sourceUrl: string;
  sourceExtIds: string[];
  audioCoverage: TranslationAudioCoverage;
  timingMode: OpenBiblePilotTimingMode;
  selected: boolean;
  status: OpenBiblePilotStatus;
  hasTextPack: boolean;
  textPackTranslationId?: string;
  lastActionAt?: string;
  lastPublishedVersion?: string;
  lastStagedVersion?: string;
  notes?: string;
}

export interface OpenBiblePilotRegistry {
  schemaVersion: number;
  updatedAt: string;
  openBibleRoot: string;
  translations: OpenBiblePilotRegistryTranslation[];
}

export interface OpenBiblePilotTextCatalogSeed {
  downloadUrl: string;
  sha256: string;
  version: string;
}

export interface OpenBiblePilotManifestChapter {
  chapter: number;
  bytes: number;
  path: string;
}

export interface OpenBiblePilotManifestBook {
  chapters: OpenBiblePilotManifestChapter[];
  totalBytes: number;
  totalChapters: number;
}

export interface OpenBiblePilotAudioManifest {
  audioVersion: string;
  baseUrl: string;
  books: Record<string, OpenBiblePilotManifestBook>;
  deliveryMode: 'chapter';
  fileExt: 'mp3';
  mimeType: 'audio/mpeg';
  storageProvider: 'cloudflare-r2';
  timingBaseUrl?: string;
  timingPublished: boolean;
  totalBooks: number;
  totalBytes: number;
  totalChapters: number;
  translationId: string;
  updatedAt: string;
}

export interface OpenBiblePilotCatalogRow {
  abbreviation: string;
  catalog: TranslationCatalog;
  distribution_state: 'published';
  has_audio: boolean;
  has_text: boolean;
  is_available: boolean;
  is_bundled: boolean;
  language_code: string;
  language_name: string;
  license_type: string | null;
  name: string;
  source_url: string;
  sort_order: number;
  text_direction: OpenBiblePilotTextDirection;
  translation_id: string;
}

export interface BuildOpenBiblePilotCatalogOptions {
  translation: OpenBiblePilotRegistryTranslation;
  version: string;
  updatedAt: string;
  audioBooks: Record<string, TranslationAudioBookCatalog>;
  totalAudioChapters: number;
  totalTimingChapters: number;
  textCatalog?: OpenBiblePilotTextCatalogSeed | null;
}

export function buildOpenBiblePilotAudioBasePath(
  translationId: string,
  version: string
): string {
  return `audio/${translationId}/${version}`;
}

export function buildOpenBiblePilotTimingBasePath(
  translationId: string,
  version: string
): string {
  return `timing/${translationId}/${version}`;
}

export function buildOpenBiblePilotAudioChapterPath(
  bookId: string,
  chapter: number
): string {
  return `chapters/${bookId}/${chapter}.mp3`;
}

export function buildOpenBiblePilotTimingChapterPath(
  bookId: string,
  chapter: number
): string {
  return `${bookId}/${chapter}.json`;
}

export function shouldPublishOpenBiblePilotTiming(
  translation: Pick<OpenBiblePilotRegistryTranslation, 'timingMode'>,
  totalAudioChapters: number,
  totalTimingChapters: number
): boolean {
  if (translation.timingMode === 'none') {
    return false;
  }

  if (totalAudioChapters <= 0 || totalTimingChapters <= 0) {
    return false;
  }

  return totalAudioChapters === totalTimingChapters;
}

export function buildOpenBiblePilotCatalog({
  translation,
  version,
  updatedAt,
  audioBooks,
  totalAudioChapters,
  totalTimingChapters,
  textCatalog,
}: BuildOpenBiblePilotCatalogOptions): TranslationCatalog {
  const publishTiming = shouldPublishOpenBiblePilotTiming(
    translation,
    totalAudioChapters,
    totalTimingChapters
  );

  return {
    version,
    updatedAt,
    ...(textCatalog
      ? {
          text: {
            format: 'sqlite',
            downloadUrl: textCatalog.downloadUrl,
            sha256: textCatalog.sha256,
            version: textCatalog.version,
          },
        }
      : {}),
    audio: {
      strategy: 'stream-template',
      coverage: translation.audioCoverage,
      baseUrl: buildOpenBiblePilotAudioBasePath(translation.translationId, version),
      chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
      fileExtension: 'mp3',
      mimeType: 'audio/mpeg',
      books: audioBooks,
    },
    ...(publishTiming
      ? {
          timing: {
            strategy: 'stream-template',
            baseUrl: buildOpenBiblePilotTimingBasePath(translation.translationId, version),
            chapterPathTemplate: '{bookId}/{chapter}.json',
            fileExtension: 'json',
            mimeType: 'application/json',
          },
        }
      : {}),
  };
}

export function buildOpenBiblePilotAudioManifest(options: {
  translation: OpenBiblePilotRegistryTranslation;
  version: string;
  updatedAt: string;
  books: Record<string, OpenBiblePilotManifestBook>;
  totalAudioBytes: number;
  totalAudioChapters: number;
  totalTimingChapters: number;
}): OpenBiblePilotAudioManifest {
  const timingPublished = shouldPublishOpenBiblePilotTiming(
    options.translation,
    options.totalAudioChapters,
    options.totalTimingChapters
  );

  return {
    translationId: options.translation.translationId,
    audioVersion: options.version,
    updatedAt: options.updatedAt,
    deliveryMode: 'chapter',
    storageProvider: 'cloudflare-r2',
    baseUrl: buildOpenBiblePilotAudioBasePath(
      options.translation.translationId,
      options.version
    ),
    ...(timingPublished
      ? {
          timingBaseUrl: buildOpenBiblePilotTimingBasePath(
            options.translation.translationId,
            options.version
          ),
        }
      : {}),
    timingPublished,
    fileExt: 'mp3',
    mimeType: 'audio/mpeg',
    totalBooks: Object.keys(options.books).length,
    totalChapters: options.totalAudioChapters,
    totalBytes: options.totalAudioBytes,
    books: options.books,
  };
}

export function buildOpenBiblePilotCatalogRow(options: {
  translation: OpenBiblePilotRegistryTranslation;
  catalog: TranslationCatalog;
}): OpenBiblePilotCatalogRow {
  return {
    translation_id: options.translation.translationId,
    name: options.translation.name,
    abbreviation: options.translation.abbreviation,
    sort_order: options.translation.sortOrder,
    language_code: options.translation.languageCode,
    language_name: options.translation.languageName,
    license_type: options.translation.licenseType,
    source_url: options.translation.sourceUrl,
    has_text: Boolean(options.catalog.text),
    has_audio: Boolean(options.catalog.audio),
    is_bundled: false,
    is_available: true,
    distribution_state: 'published',
    text_direction: options.translation.textDirection,
    catalog: options.catalog,
  };
}
