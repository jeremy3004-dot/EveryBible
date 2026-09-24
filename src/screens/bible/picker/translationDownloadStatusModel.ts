import type { BibleTranslation, TranslationDownloadProgress } from '../../../types';

type StatusTranslation = Pick<
  BibleTranslation,
  'id' | 'isDownloaded' | 'textPackLocalPath' | 'activeDownloadJob'
>;

/** The parts of the store's shared download banner a picker row or the manage sheet draws. */
export type TranslationRowDownloadProgress = Pick<
  TranslationDownloadProgress,
  'translationId' | 'bookId' | 'progress' | 'isIndeterminate'
>;

/**
 * Selects the banner fields for one Bible (use with `useShallow`). A text pack reports its
 * bytes chunk by chunk, many times per visible percent; selecting the whole banner object
 * re-rendered the row on every chunk.
 */
export function selectRowDownloadProgress(
  progress: TranslationDownloadProgress | null,
  translationId: string
): TranslationRowDownloadProgress | null {
  return progress?.translationId === translationId
    ? {
        translationId,
        bookId: progress.bookId,
        progress: progress.progress,
        isIndeterminate: progress.isIndeterminate,
      }
    : null;
}

export interface TranslationDownloadActivity {
  /** An audio job is queued or running for this Bible (finished and failed jobs are not). */
  isActiveAudioJob: boolean;
  /** The store's shared progress belongs to this Bible's text pack. */
  isTextDownloadActive: boolean;
  isTextDownloaded: boolean;
}

/**
 * What is downloading for one Bible right now. `downloadProgress` is the store's single shared
 * progress; it counts for this Bible only when it names it, carries no book, and no audio job
 * is running (audio jobs report through the same field).
 */
export function getTranslationDownloadActivity(
  translation: StatusTranslation,
  downloadProgress: TranslationRowDownloadProgress | null
): TranslationDownloadActivity {
  const activeAudioJob = translation.activeDownloadJob;
  const isActiveAudioJob =
    activeAudioJob != null &&
    activeAudioJob.state !== 'completed' &&
    activeAudioJob.state !== 'failed';
  const isTextDownloadActive =
    downloadProgress?.translationId === translation.id &&
    !downloadProgress.bookId &&
    !isActiveAudioJob;

  return {
    isActiveAudioJob,
    isTextDownloadActive,
    isTextDownloaded: translation.isDownloaded || Boolean(translation.textPackLocalPath),
  };
}

export type TranslationRowDownloadStatus = 'downloading' | 'queued' | 'idle';

export interface TranslationRowDownloadState extends TranslationDownloadActivity {
  /** Percent shown on the row, or null when nothing is downloading. */
  activeDownloadProgress: number | null;
  isTextDownloadIndeterminate: boolean;
  /** Waiting behind another download (and not itself downloading yet). */
  showsQueued: boolean;
  status: TranslationRowDownloadStatus;
  /** Tapping the row would start a text download rather than open the Bible. */
  needsTextDownload: boolean;
}

/** Everything a picker row shows about downloads, derived from the Bible and the store. */
export function getTranslationRowDownloadState(
  translation: StatusTranslation & Pick<BibleTranslation, 'catalog' | 'hasAudio'>,
  downloadProgress: TranslationRowDownloadProgress | null,
  isQueued: boolean
): TranslationRowDownloadState {
  const activity = getTranslationDownloadActivity(translation, downloadProgress);
  const { isActiveAudioJob, isTextDownloadActive, isTextDownloaded } = activity;

  const activeDownloadProgress = isActiveAudioJob
    ? (translation.activeDownloadJob?.progress ?? null)
    : isTextDownloadActive
      ? (downloadProgress?.progress ?? 0)
      : null;
  const isDownloading = activeDownloadProgress != null;
  const showsQueued = isQueued && !isDownloading;

  return {
    ...activity,
    activeDownloadProgress,
    isTextDownloadIndeterminate: Boolean(isTextDownloadActive && downloadProgress?.isIndeterminate),
    showsQueued,
    status: isDownloading ? 'downloading' : showsQueued ? 'queued' : 'idle',
    needsTextDownload:
      !isTextDownloaded && Boolean(translation.catalog?.text?.downloadUrl) && !translation.hasAudio,
  };
}
