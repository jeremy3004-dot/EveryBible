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
export type AudioProvider = 'bible-is' | 'ebible-webbe' | 'openbible-bsb-souer';

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
}

export interface TranslationDownloadProgress {
  translationId: string;
  bookId?: string;
  progress: number; // 0-100
  status: 'idle' | 'downloading' | 'completed' | 'error';
  error?: string;
}

export type DailyScriptureKind = 'verse-text' | 'verse-audio' | 'section-audio' | 'empty';
export type DailyScripturePlayScope = 'none' | 'verse' | 'chapter';

export interface DailyScriptureReference {
  bookId: string;
  chapter: number;
  verse?: number;
}

export interface DailyScripture {
  kind: DailyScriptureKind;
  bookId: string;
  chapter: number;
  verse?: number;
  text: string | null;
  playScope: DailyScripturePlayScope;
}
