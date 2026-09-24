import { bibleBooks, newTestamentBooks, type BibleBook } from '../../../constants/books';
import {
  isAudioBookDownloaded,
  isTranslationAudioDownloaded,
} from '../../../services/audio/audioDownloads';
import { hasTranslationDownloadData } from '../../../stores/bibleStoreModel';
import type { BibleTranslation } from '../../../types';
import type { TranslationAudioCollectionAction } from '../bibleTranslationModel';
import {
  getTranslationDownloadActivity,
  type TranslationRowDownloadProgress,
} from './translationDownloadStatusModel';

// The per-Bible manage sheet, as data: which library actions it offers and what each download
// row shows. The sheet component maps these onto labels, icons and handlers.

/** Which audio download the sheet itself started and is waiting on. */
export type ManageAudioDownloadKey = 'all' | 'nt' | `book:${string}`;

export type ManageLibraryAction = 'pin' | 'unpin' | 'hide' | 'delete';

export type ManageRowState = 'done' | 'download' | 'unavailable' | 'busy';

/**
 * What a manage row says about its state. The state is otherwise only a glyph
 * (tick, cloud, spinner), and a row that cannot start reads "dimmed" whether it
 * is already downloaded or cannot be downloaded at all.
 */
export function getManageRowAccessibilityValue(
  {
    state,
    progress = null,
    indeterminate = false,
    meta = null,
  }: {
    state: ManageRowState;
    progress?: number | null;
    indeterminate?: boolean;
    meta?: string | null;
  },
  t: (key: string) => string
): string {
  if (state === 'busy') {
    return progress != null && !indeterminate ? `${progress}%` : t('translations.downloading');
  }
  if (state === 'done') return t('translations.installed');
  if (state === 'unavailable') return t('bible.notAvailableYet');
  return [t('translations.download'), meta].filter(Boolean).join(', ');
}

export interface ManageDownloadRowModel {
  key: 'text' | 'full-bible' | 'new-testament';
  /** Size or downloaded-book count shown beside the status glyph. */
  meta?: string;
  state: ManageRowState;
  /** Percent while this row's download runs, otherwise null. */
  progress: number | null;
  indeterminate?: boolean;
  /** Tapping the row starts its download. */
  canStart: boolean;
}

export interface ManageAudioBookRowModel {
  bookId: string;
  state: ManageRowState;
  canStart: boolean;
}

export interface TranslationManageModelInput {
  translation: BibleTranslation;
  downloadProgress: TranslationRowDownloadProgress | null;
  activeAudioDownloadKey: ManageAudioDownloadKey | null;
  pinned: boolean;
  hidden: boolean;
  /** This is the Bible being read. */
  isSelected: boolean;
  /** Audio can be managed for the current book (streamable or already on the device). */
  canManageAudio: boolean;
  /** Audio can be downloaded for the current book. */
  canDownloadAudio: boolean;
  /** Per book, whether its audio can be downloaded (remote availability differs by book). */
  canDownloadBookAudio: (bookId: string) => boolean;
  audioBookIds: string[];
  collectionActions: TranslationAudioCollectionAction[];
}

export interface TranslationManageModel {
  libraryActions: ManageLibraryAction[];
  textRows: ManageDownloadRowModel[];
  audioRows: ManageDownloadRowModel[];
  /** Book-by-book audio rows; empty when the sheet shows no audio section. */
  audioBookRows: ManageAudioBookRowModel[];
  showsAudio: boolean;
}

/** The New Testament books this Bible has audio for, in canon order. */
export const getNewTestamentAudioBookIds = (audioBookIds: string[]): string[] =>
  newTestamentBooks.map((book) => book.id).filter((id) => audioBookIds.includes(id));

const downloadState = (isBusy: boolean, isDone: boolean, canDownload: boolean): ManageRowState =>
  isBusy ? 'busy' : isDone ? 'done' : canDownload ? 'download' : 'unavailable';

export function buildTranslationManageModel({
  translation,
  downloadProgress,
  activeAudioDownloadKey,
  pinned,
  hidden,
  isSelected,
  canManageAudio,
  canDownloadAudio,
  canDownloadBookAudio,
  audioBookIds,
  collectionActions,
}: TranslationManageModelInput): TranslationManageModel {
  const { isActiveAudioJob, isTextDownloadActive, isTextDownloaded } =
    getTranslationDownloadActivity(translation, downloadProgress);
  const activeAudioJob = translation.activeDownloadJob;
  const translationAudioBooks: BibleBook[] =
    audioBookIds.length > 0 ? bibleBooks.filter((book) => audioBookIds.includes(book.id)) : [];
  const showsAudio = canManageAudio && translationAudioBooks.length > 0;
  const isBusy = activeAudioDownloadKey !== null || isActiveAudioJob || isTextDownloadActive;

  const libraryActions: ManageLibraryAction[] = [pinned ? 'unpin' : 'pin'];
  if (!hidden && !isSelected && (translation.isDownloaded || pinned)) {
    libraryActions.push('hide');
  }
  // Deleting stops a running audio download first, so Delete stays available during one.
  if (
    (hasTranslationDownloadData(translation) ||
      isActiveAudioJob ||
      activeAudioDownloadKey !== null) &&
    !isTextDownloadActive
  ) {
    libraryActions.push('delete');
  }

  const textRows: ManageDownloadRowModel[] = [];
  const hasTextRow =
    translation.hasText || Boolean(translation.catalog?.text?.downloadUrl) || isTextDownloaded;
  if (hasTextRow) {
    textRows.push({
      key: 'text',
      meta: !isTextDownloaded && translation.sizeInMB ? `~${translation.sizeInMB} MB` : undefined,
      state: isTextDownloadActive ? 'busy' : isTextDownloaded ? 'done' : 'download',
      progress: isTextDownloadActive ? (downloadProgress?.progress ?? 0) : null,
      indeterminate: isTextDownloadActive && downloadProgress?.isIndeterminate,
      canStart: !(isTextDownloaded || isBusy || !translation.catalog?.text?.downloadUrl),
    });
  }

  const audioRows: ManageDownloadRowModel[] = [];
  if (showsAudio) {
    const collectionAction = collectionActions[0] ?? null;
    const isCollectionBusy =
      activeAudioDownloadKey === 'all' ||
      activeAudioDownloadKey === 'nt' ||
      (isActiveAudioJob && activeAudioJob?.kind === 'translation-audio');

    if (collectionAction === 'full-bible') {
      const isAudioDownloaded = isTranslationAudioDownloaded(
        translation.downloadedAudioBooks,
        translationAudioBooks
      );
      const downloadedAudioCount = translation.downloadedAudioBooks.filter((id) =>
        translationAudioBooks.some((book) => book.id === id)
      ).length;
      audioRows.push({
        key: 'full-bible',
        meta: `${downloadedAudioCount}/${translationAudioBooks.length}`,
        state: downloadState(isCollectionBusy, isAudioDownloaded, canDownloadAudio),
        progress: isCollectionBusy ? (activeAudioJob?.progress ?? 0) : null,
        canStart: !(isAudioDownloaded || isBusy || !canDownloadAudio),
      });
    }

    if (collectionActions.includes('new-testament')) {
      const ntBookIds = getNewTestamentAudioBookIds(audioBookIds);
      const ntDownloadedCount = ntBookIds.filter((id) =>
        isAudioBookDownloaded(translation.downloadedAudioBooks, id)
      ).length;
      const ntDownloaded = ntDownloadedCount === ntBookIds.length;
      const isNtBusy = activeAudioDownloadKey === 'nt';
      audioRows.push({
        key: 'new-testament',
        meta: `${ntDownloadedCount}/${ntBookIds.length}`,
        state: downloadState(isNtBusy, ntDownloaded, canDownloadAudio),
        progress: isNtBusy ? (activeAudioJob?.progress ?? 0) : null,
        canStart: !(ntDownloaded || isBusy || !canDownloadAudio),
      });
    }
  }

  const audioBookRows: ManageAudioBookRowModel[] = showsAudio
    ? translationAudioBooks.map((book) => {
        const isDownloaded = isAudioBookDownloaded(translation.downloadedAudioBooks, book.id);
        const canDownload = canDownloadBookAudio(book.id);
        return {
          bookId: book.id,
          state: downloadState(
            activeAudioDownloadKey === `book:${book.id}`,
            isDownloaded,
            canDownload
          ),
          canStart: !isDownloaded && !isBusy && canDownload,
        };
      })
    : [];

  return { libraryActions, textRows, audioRows, audioBookRows, showsAudio };
}
