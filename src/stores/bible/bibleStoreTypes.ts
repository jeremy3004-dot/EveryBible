import type { StoreApi } from 'zustand';
import type { Verse, BibleTranslation, TranslationDownloadProgress } from '../../types';

export interface BibleState {
  currentBook: string;
  currentChapter: number;
  hasReaderHistory: boolean;
  preferredChapterLaunchMode: 'listen' | 'read';
  verses: Verse[];
  isLoading: boolean;
  error: string | null;

  // Translation state
  currentTranslation: string;
  /**
   * When the reader chose `currentTranslation` (ISO time), or the saved account stamp it
   * was adopted with. Null until a choice is made. It makes the account preference last
   * write wins: a switch made offline outlives an older saved value at the next launch.
   */
  currentTranslationChosenAt: string | null;
  preferredTranslationLanguage: string | null;
  translations: BibleTranslation[];
  downloadProgress: TranslationDownloadProgress | null;

  // Basic actions
  setCurrentBook: (bookId: string) => void;
  setCurrentChapter: (chapter: number) => void;
  setPreferredChapterLaunchMode: (mode: 'listen' | 'read') => void;
  applySyncedReadingPosition: (readingPosition: { bookId: string; chapter: number }) => void;
  setVerses: (verses: Verse[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Translation actions
  /**
   * `adopted` applies a choice already saved to the account (from another device): it
   * keeps that choice's stamp and is not uploaded back.
   */
  setCurrentTranslation: (translationId: string, adopted?: { chosenAt: string | null }) => void;
  setPreferredTranslationLanguage: (language: string | null) => void;
  applyRuntimeCatalog: (runtimeTranslations: BibleTranslation[]) => void;
  reconcileTranslationPacks: () => Promise<void>;
  recoverMissingInstalledPack: (translationId: string) => Promise<void>;
  reattachAudioDownloads: () => Promise<void>;
  resetForSignOut: () => void;
  stageTranslationPack: (
    translationId: string,
    candidate: { version: string; localPath: string }
  ) => void;
  activateTranslationPack: (translationId: string) => void;
  failTranslationPack: (translationId: string, error: string) => void;
  rollbackTranslationPackInstall: (translationId: string) => void;
  getAvailableTranslations: () => BibleTranslation[];
  getCurrentTranslationInfo: () => BibleTranslation | undefined;
  downloadTranslation: (
    translationId: string,
    bookId?: string
  ) => Promise<'installed' | 'cancelled'>;
  downloadAllBooks: (translationId: string) => Promise<void>;
  downloadAudioForBook: (translationId: string, bookId: string) => Promise<void>;
  downloadAudioForBooks: (translationId: string, bookIds: string[]) => Promise<void>;
  downloadAudioForTranslation: (translationId: string) => Promise<void>;
  cancelDownload: () => void;
  deleteTranslation: (translationId: string) => Promise<void>;
  isBookDownloaded: (translationId: string, bookId: string) => boolean;
  isAudioBookDownloaded: (translationId: string, bookId: string) => boolean;
}

export type BibleSet = StoreApi<BibleState>['setState'];
export type BibleGet = StoreApi<BibleState>['getState'];

/** The two store handles a module outside the creator needs to read and write the store. */
export interface BibleStoreAccess {
  getState: BibleGet;
  setState: BibleSet;
}

/**
 * One slice of the single Bible store. Every slice is spread into the same `persist` creator,
 * so `set`/`get` see the whole state and cross-slice calls go through `get()`.
 */
export type BibleSliceCreator<Slice extends Partial<BibleState>> = (
  set: BibleSet,
  get: BibleGet
) => Slice;
