export interface VerseFormattingLine {
  text: string;
  indentLevel?: number;
  /**
   * A run of ordinary prose inside an otherwise poetic verse — typically the lead-in that
   * introduces a quotation ("For to which of the angels did God ever say:"). Stored poetry
   * lines cover only the quoted couplets, so these are recovered from the verse text at read
   * time by reconcileVerseFormattingWithText. Rendered flush left, never indented as poetry.
   */
  prose?: boolean;
}

export interface VerseFormatting {
  mode: 'lines' | 'poetry';
  lines: VerseFormattingLine[];
}

export interface Verse {
  id: number;
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
  heading?: string;
  formatting?: VerseFormatting;
}

export type AudioGranularity = 'none' | 'chapter' | 'verse';
export type AudioProvider = 'bible-is' | 'ebible-webbe';
type TranslationSource = 'bundled' | 'runtime';
export type TranslationInstallState =
  | 'seeded'
  | 'remote-only'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'rollback-available'
  | 'update-available';
type TranslationTextFormat = 'sqlite';
type TranslationAudioStrategy = 'provider' | 'stream-template' | 'audio-pack' | 'el-manifest';
type TranslationTimingStrategy = 'stream-template';
export type TranslationAudioCoverage = 'full-bible' | 'new-testament' | 'partial';
type TranslationDownloadJobKind = 'text-pack' | 'audio-pack' | 'audio-book' | 'translation-audio';
type TranslationDownloadJobState =
  | 'queued'
  | 'running'
  | 'paused'
  | 'reattaching'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface TranslationTextCatalog {
  format: TranslationTextFormat;
  version: string;
  downloadUrl: string;
  sha256: string;
  verseCount?: number;
  signature?: string;
}

export interface TranslationAudioBookCatalog {
  totalChapters?: number;
  totalBytes?: number;
}

export interface TranslationAudioCatalog {
  strategy: TranslationAudioStrategy;
  coverage?: TranslationAudioCoverage;
  provider?: AudioProvider;
  baseUrl?: string;
  chapterPathTemplate?: string;
  fileExtension?: string;
  mimeType?: string;
  downloadUrl?: string;
  sha256?: string;
  signature?: string;
  books?: Record<string, TranslationAudioBookCatalog>;
  // Fields for the 'el-manifest' strategy (Every Language signed audio manifests).
  // Chapter URLs are resolved from a verified, immutable manifest fetched via
  // `manifestUrl` (resolved against `catalogBaseUrl`) rather than a path template.
  manifestUrl?: string;
  audioVersion?: string;
  catalogBaseUrl?: string;
}

export interface TranslationTimingCatalog {
  strategy: TranslationTimingStrategy;
  baseUrl: string;
  chapterPathTemplate: string;
  fileExtension?: string;
  mimeType?: string;
}

export interface TranslationCatalog {
  version: string;
  updatedAt: string;
  minimumAppVersion?: string;
  text?: TranslationTextCatalog;
  audio?: TranslationAudioCatalog;
  timing?: TranslationTimingCatalog;
}

export interface TranslationDownloadJob {
  id: string;
  kind: TranslationDownloadJobKind;
  state: TranslationDownloadJobState;
  progress: number;
  startedAt: number;
  updatedAt: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  error?: string;
}

export interface TranslationCatalogManifestTranslation {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  description: string;
  copyright: string;
  hasText: boolean;
  hasAudio: boolean;
  audioGranularity: AudioGranularity;
  totalBooks: number;
  sizeInMB: number;
  text?: TranslationTextCatalog;
  audio?: TranslationAudioCatalog;
  timing?: TranslationTimingCatalog;
}

export interface TranslationCatalogManifest {
  manifestVersion: string;
  issuedAt: string;
  translations: TranslationCatalogManifestTranslation[];
}

export interface SignedCatalogEnvelope {
  keyId: string;
  algorithm: 'ES256' | 'RS256';
  compactJws: string;
}

// Bible Translations
export interface BibleTranslation {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  description: string;
  copyright: string;
  isDownloaded: boolean;
  downloadedBooks: string[]; // Book IDs that are downloaded
  downloadedAudioBooks: string[];
  totalBooks: number;
  sizeInMB: number;
  hasText: boolean;
  hasAudio: boolean;
  audioGranularity: AudioGranularity;
  audioProvider?: AudioProvider;
  audioFilesetId?: string;
  source?: TranslationSource;
  installState?: TranslationInstallState;
  activeTextPackVersion?: string | null;
  pendingTextPackVersion?: string | null;
  pendingTextPackLocalPath?: string | null;
  textPackLocalPath?: string | null;
  rollbackTextPackVersion?: string | null;
  rollbackTextPackLocalPath?: string | null;
  lastInstallError?: string | null;
  catalog?: TranslationCatalog;
  activeDownloadJob?: TranslationDownloadJob | null;
}

export interface TranslationDownloadProgress {
  translationId: string;
  operationId?: string;
  jobId?: string;
  bookId?: string;
  progress: number; // 0-100
  status: 'idle' | 'downloading' | 'verifying' | 'installing' | 'completed' | 'error';
  bytesDownloaded?: number;
  bytesTotal?: number;
  isIndeterminate?: boolean;
  error?: string;
}

type DailyScriptureKind = 'verse-text' | 'verse-audio' | 'section-audio' | 'empty';
type DailyScripturePlayScope = 'none' | 'verse' | 'chapter';

export interface DailyScriptureReference {
  bookId: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

export interface DailyScripture {
  kind: DailyScriptureKind;
  bookId: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
  text: string | null;
  playScope: DailyScripturePlayScope;
  /**
   * Set when `text` was read from this translation because the reader's own has none
   * for today's reference (the bundled BSB standing in for a New Testament-only pack).
   */
  fallbackTranslationId?: string;
}
