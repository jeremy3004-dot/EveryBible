/** In-memory registry of running download loops, so a job id alone can cancel one. */
import { AUDIO_DOWNLOAD_JOB_ID_PREFIX } from './jobRegistry';
import { AudioDownloadCancelledError } from './errors';

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
const activeAudioDownloads = new Map<string, Set<ActiveAudioDownload>>();

// Requests may overlap (one book plus a collection). A book's files and verification
// receipts share ownership, so the later request sees the completed files and receipts.
const bookDownloadTails = new Map<string, Promise<void>>();

export async function runAudioBookExclusively(
  directoryUri: string,
  signal: AbortSignal,
  run: () => Promise<void>
): Promise<void> {
  const previous = bookDownloadTails.get(directoryUri) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  bookDownloadTails.set(directoryUri, tail);
  try {
    await previous;
    if (signal.aborted) throw new AudioDownloadCancelledError();
    await run();
  } finally {
    release();
    if (bookDownloadTails.get(directoryUri) === tail) bookDownloadTails.delete(directoryUri);
  }
}

export function registerAudioDownloadAbortController(jobId: string): ActiveAudioDownload {
  let markSettled = () => {};
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const entry = { controller: new AbortController(), settled, markSettled };
  const entries = activeAudioDownloads.get(jobId) ?? new Set<ActiveAudioDownload>();
  entries.add(entry);
  activeAudioDownloads.set(jobId, entries);
  return entry;
}

export function releaseAudioDownloadAbortController(
  jobId: string,
  entry: ActiveAudioDownload
): void {
  const entries = activeAudioDownloads.get(jobId);
  entries?.delete(entry);
  if (entries?.size === 0) activeAudioDownloads.delete(jobId);
  entry.markSettled();
}

export function requestAudioDownloadCancellation(jobId: string): void {
  activeAudioDownloads.get(jobId)?.forEach((entry) => entry.controller.abort());
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
    .flatMap(([, entries]) => Array.from(entries));
  running.forEach((entry) => entry.controller.abort());
  await Promise.all(running.map((entry) => entry.settled));
}
