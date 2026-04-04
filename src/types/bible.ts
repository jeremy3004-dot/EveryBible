export interface Verse {
  id: number;
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
  heading?: string;
}

export interface Chapter {
  bookId: string;
  chapter: number;
  verses: Verse[];
}

export interface ReadingProgress {
  bookId: string;
  chapter: number;
  verse?: number;
  timestamp: number;
}

export interface ChapterRead {
  [key: string]: number; // e.g., "GEN_1": timestamp
}

export type AudioGranularity = 'none' | 'chapter' | 'verse';
export type AudioProvider = 'bible-is' | 'ebible-webbe';
export type TranslationSource = 'bundled' | 'runtime';
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
export type TranslationTextFormat = 'sqlite';
export type TranslationAudioStrategy = 'provider' | 'stream-template' | 'audio-pack';
export type TranslationTimingStrategy = 'stream-template';
export type TranslationAudioCoverage = 'full-bible' | 'new-testament' | 'partial';
export type TranslationDownloadJobKind =
  | 'text-pack'
  | 'audio-pack'
  | 'audio-book'
  | 'translation-audio';
export type TranslationDownloadJobState =
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
  signature?: string;
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
  bookId?: string;
  progress: number; // 0-100
  status: 'idle' | 'downloading' | 'verifying' | 'installing' | 'completed' | 'error';
  error?: string;
}

export type DailyScriptureKind = 'verse-text' | 'verse-audio' | 'section-audio' | 'empty';
export type DailyScripturePlayScope = 'none' | 'verse' | 'chapter';

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
}
