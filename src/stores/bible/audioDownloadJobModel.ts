/**
 * Pure mapping from the audio download service's persisted job records to the store's
 * per-translation job slot and the shared download progress banner.
 */
import type {
  BibleTranslation,
  TranslationDownloadJob,
  TranslationDownloadProgress,
} from '../../types';
import type { AudioDownloadJobRecord } from '../../services/audio/audioDownloadService';
import { isAudioDownloadBookOwnedByCollection } from '../../services/audio/download/activeDownloads';

export function mapAudioJobStatus(
  status: AudioDownloadJobRecord['status']
): TranslationDownloadJob['state'] {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'downloading':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

export function mapAudioJobKind(
  scope: AudioDownloadJobRecord['scope']
): TranslationDownloadJob['kind'] {
  return scope === 'translation' ? 'translation-audio' : 'audio-book';
}

export function mapAudioDownloadJob(job: AudioDownloadJobRecord): TranslationDownloadJob {
  return {
    id: job.id,
    kind: mapAudioJobKind(job.scope),
    ...(job.scope === 'translation' && job.requestedBookIds
      ? { requestedBookIds: job.requestedBookIds }
      : {}),
    state: mapAudioJobStatus(job.status),
    progress: job.status === 'completed' ? 100 : 0,
    startedAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
}

export function mapAudioDownloadProgress(job: AudioDownloadJobRecord): TranslationDownloadProgress {
  return {
    translationId: job.translationId,
    jobId: job.id,
    bookId: job.bookId,
    progress: job.status === 'completed' ? 100 : 0,
    status:
      job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'downloading',
    error: job.error,
  };
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function updateTranslationAudioJobState(
  translation: BibleTranslation,
  job: AudioDownloadJobRecord | null
): BibleTranslation {
  if (!job || translation.id !== job.translationId) {
    // Another translation's job: keep this row's identity so subscribers that select one
    // translation (the reader, a picker row) are not re-rendered by it. Only a row that
    // never had its job slot set is normalized to null.
    return translation.activeDownloadJob === undefined
      ? { ...translation, activeDownloadJob: null }
      : translation;
  }

  return {
    ...translation,
    activeDownloadJob: job.status === 'completed' ? null : mapAudioDownloadJob(job),
  };
}

export function updateTranslationAudioJobProgress(
  translation: BibleTranslation,
  progress: number
): BibleTranslation {
  if (!translation.activeDownloadJob) {
    return translation;
  }

  return {
    ...translation,
    activeDownloadJob: {
      ...translation.activeDownloadJob,
      progress: clampPercent(progress),
      updatedAt: Date.now(),
    },
  };
}

export function getLatestPersistedAudioJobByTranslation(
  jobs: AudioDownloadJobRecord[]
): Map<string, AudioDownloadJobRecord> {
  const jobsByTranslation = new Map<string, AudioDownloadJobRecord>();

  jobs.forEach((job) => {
    const existing = jobsByTranslation.get(job.translationId);
    if (!existing || job.updatedAt > existing.updatedAt) {
      jobsByTranslation.set(job.translationId, job);
    }
  });

  return jobsByTranslation;
}

/** A collection owns only its selected child books; other books remain independent jobs. */
export function getDisplayableActiveAudioJobs(
  jobs: AudioDownloadJobRecord[]
): AudioDownloadJobRecord[] {
  const active = jobs.filter((job) => job.status === 'downloading' || job.status === 'queued');
  const collections = new Map(
    active.filter((job) => job.scope === 'translation').map((job) => [job.translationId, job])
  );
  return active.filter((job) => {
    const parent = collections.get(job.translationId);
    return !parent || !isAudioDownloadBookOwnedByCollection(job, parent);
  });
}

/** Adds each newly completed book once, keeping the existing order. */
export function appendDownloadedAudioBooks(
  downloadedAudioBooks: string[],
  completedBookIds: string[]
): string[] {
  return completedBookIds.reduce(
    (books, completedBookId) =>
      books.includes(completedBookId) ? books : [...books, completedBookId],
    downloadedAudioBooks
  );
}

/**
 * The audio job a cancel request should stop, or null when the banner belongs to a text
 * transfer.
 *
 * The visible banner owns Cancel. An older collection path could put one of its covered
 * child book ids in that banner, so only that proven parent/child relationship maps back
 * to the collection. An independent book outside a selected collection retains its own id.
 * A text transfer has no audio job id. Never let a stale audio job on the same
 * translation hijack a text cancellation request.
 */
export function resolveAudioCancellationJobId(
  progress: TranslationDownloadProgress | null,
  translations: readonly BibleTranslation[]
): string | null {
  const cancelledTranslationId = progress?.translationId;
  if (!progress?.jobId) return null;
  const activeJob = translations.find(
    (item) => item.id === cancelledTranslationId
  )?.activeDownloadJob;
  const bookId = progress.bookId;
  if (
    activeJob?.kind === 'translation-audio' &&
    bookId &&
    progress.jobId === `audio-download:${cancelledTranslationId}:book:${bookId}` &&
    (!activeJob.requestedBookIds || activeJob.requestedBookIds.includes(bookId))
  ) {
    return activeJob.id;
  }
  return progress.jobId;
}
