/** In-memory registry of running download loops, so a job id alone can cancel one. */
import { AUDIO_DOWNLOAD_JOB_ID_PREFIX } from './jobRegistry';

export interface ActiveAudioDownload {
  controller: AbortController;
  // Resolves once the job's chapter loop has returned, i.e. every transport it started has
  // settled and nothing is still writing into the translation's directory.
  settled: Promise<void>;
  markSettled: () => void;
}

// Keyed by job id so a caller holding only the id (e.g. bibleStore's cancelDownload) can
// abort the exact in-flight runWithConcurrency loop driving that job, without needing a
// reference to the download promise itself.
const activeAudioDownloads = new Map<string, ActiveAudioDownload>();

export function registerAudioDownloadAbortController(jobId: string): ActiveAudioDownload {
  let markSettled = () => {};
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const entry = { controller: new AbortController(), settled, markSettled };
  activeAudioDownloads.set(jobId, entry);
  return entry;
}

export function releaseAudioDownloadAbortController(
  jobId: string,
  entry: ActiveAudioDownload
): void {
  if (activeAudioDownloads.get(jobId) === entry) activeAudioDownloads.delete(jobId);
  entry.markSettled();
}

export function requestAudioDownloadCancellation(jobId: string): void {
  activeAudioDownloads.get(jobId)?.controller.abort();
}

/**
 * Aborts every in-JS download loop for a translation (its translation job and every nested book
 * job) and resolves once they have all stopped. Deleting a translation's files while a loop is
 * still running would let it write chapters back into the deleted directory and report them
 * downloaded.
 */
export async function cancelAudioDownloadsForTranslation(translationId: string): Promise<void> {
  const prefix = `${AUDIO_DOWNLOAD_JOB_ID_PREFIX}${translationId}:`;
  const running = Array.from(activeAudioDownloads.entries())
    .filter(([jobId]) => jobId.startsWith(prefix))
    .map(([, entry]) => entry);
  running.forEach((entry) => entry.controller.abort());
  await Promise.all(running.map((entry) => entry.settled));
}
