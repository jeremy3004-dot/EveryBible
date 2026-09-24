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

/** Which Bible (and, for audio, which book) the shared banner names, without how far it has got. */
export type TranslationDownloadTarget = Pick<
  TranslationDownloadProgress,
  'translationId' | 'bookId'
>;

/** Selects the banner's target (use with `useShallow`); percent and byte ticks leave it unchanged. */
export function selectDownloadTarget(
  progress: TranslationDownloadProgress | null
): TranslationDownloadTarget | null {
  return progress ? { translationId: progress.translationId, bookId: progress.bookId } : null;
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
  downloadProgress: TranslationDownloadTarget | null
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

const getDownloadStatus = (
  { isActiveAudioJob, isTextDownloadActive }: TranslationDownloadActivity,
  isQueued: boolean
): TranslationRowDownloadStatus =>
  isActiveAudioJob || isTextDownloadActive ? 'downloading' : isQueued ? 'queued' : 'idle';

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
    status: getDownloadStatus(activity, isQueued),
    needsTextDownload:
      !isTextDownloaded && Boolean(translation.catalog?.text?.downloadUrl) && !translation.hasAudio,
  };
}

/** The status words a picker row already shows, spoken when a Bible's download state changes. */
export type DownloadStatusAnnouncementKey =
  | 'translations.downloading'
  | 'translations.queued'
  | 'translations.installed'
  | 'translations.available';

export interface DownloadStatusAnnouncements {
  /** Each listed Bible's status now; pass it back as `previous` next time. */
  statuses: ReadonlyMap<string, TranslationRowDownloadStatus>;
  /** Each names its Bible: with a queue, "Downloading" alone did not say which one. */
  announcements: { key: DownloadStatusAnnouncementKey; name: string }[];
}

/**
 * What to announce as the listed Bibles' downloads start, queue and settle. Tracked by Bible id,
 * not by row: a finished download moves its Bible from Available to My Translations under a new
 * row key, and a row that remounted there started idle and never said it was installed. A Bible
 * that leaves the list is forgotten, so one that comes back is announced as if newly drawn.
 */
export function getDownloadStatusAnnouncements(
  previous: ReadonlyMap<string, TranslationRowDownloadStatus>,
  translations: readonly (StatusTranslation & Pick<BibleTranslation, 'name'>)[],
  downloadTarget: TranslationDownloadTarget | null,
  queuedId: string | null
): DownloadStatusAnnouncements {
  const statuses = new Map<string, TranslationRowDownloadStatus>();
  const announcements: DownloadStatusAnnouncements['announcements'] = [];

  for (const translation of translations) {
    const activity = getTranslationDownloadActivity(translation, downloadTarget);
    const status = getDownloadStatus(activity, translation.id === queuedId);
    const previousStatus = previous.get(translation.id) ?? 'idle';
    statuses.set(translation.id, status);
    if (status === previousStatus) continue;

    if (status === 'downloading') {
      announcements.push({ key: 'translations.downloading', name: translation.name });
    } else if (status === 'queued') {
      announcements.push({ key: 'translations.queued', name: translation.name });
    } else if (previousStatus === 'downloading') {
      announcements.push({
        key: activity.isTextDownloaded ? 'translations.installed' : 'translations.available',
        name: translation.name,
      });
    }
  }

  return { statuses, announcements };
}
