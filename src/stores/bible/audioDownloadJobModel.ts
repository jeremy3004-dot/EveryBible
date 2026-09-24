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
 * The authoritative id is the one on the translation's active job. downloadProgress.jobId
 * is a best-effort mirror, and during a collection download a book-scope event could once
 * leave a nested book job id there — which requestAudioDownloadCancellation could not
 * resolve, so cancel silently did nothing while chapters kept downloading. (N22)
 * A text transfer has no audio job id. Never let a stale audio job on the same
 * translation hijack a text cancellation request.
 */
export function resolveAudioCancellationJobId(
  progress: TranslationDownloadProgress | null,
  translations: readonly BibleTranslation[]
): string | null {
  const cancelledTranslationId = progress?.translationId;
  const activeJobId = cancelledTranslationId
    ? (translations.find((item) => item.id === cancelledTranslationId)?.activeDownloadJob?.id ??
      null)
    : null;
  return progress?.jobId ? (activeJobId ?? progress.jobId) : null;
}
