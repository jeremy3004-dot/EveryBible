/** In-memory registry of running download loops, so a job id alone can cancel one. */
import { AudioDownloadCancelledError } from './errors';
import type { AudioDownloadJobRecord } from './types';

// Keep this registry independent of the persisted job store and remote audio resolver so
// store actions can register their request synchronously, before loading download services.
export const AUDIO_DOWNLOAD_JOB_ID_PREFIX = 'audio-download:';

/** Legacy records have no run identity; fresh standalone rows must never inherit parent ownership. */
export function isAudioDownloadBookOwnedByCollection(
  book: AudioDownloadJobRecord,
  parent: AudioDownloadJobRecord
): boolean {
  return (
    book.scope === 'book' &&
    parent.scope === 'translation' &&
    book.translationId === parent.translationId &&
    (!parent.requestedBookIds ||
      Boolean(book.bookId && parent.requestedBookIds.includes(book.bookId))) &&
    (book.runId ? Boolean(parent.runId && book.parentRunId === parent.runId) : !book.parentRunId)
  );
}

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

export interface AudioBookWriterSnapshot {
  readonly directoryUri: string;
}

// Identity is the generation: every writer claim invalidates earlier idle observations,
// including writers still queued behind a predecessor or cancelled before running.
const idleBookWriterSnapshots = new Map<string, AudioBookWriterSnapshot>();

export function captureIdleAudioBookWriter(directoryUri: string): AudioBookWriterSnapshot | null {
  if (bookDownloadTails.has(directoryUri)) return null;
  const snapshot = idleBookWriterSnapshots.get(directoryUri) ?? { directoryUri };
  idleBookWriterSnapshots.set(directoryUri, snapshot);
  return snapshot;
}

/** Deletes only the file observed before any newer writer claimed this book. */
export async function runAudioBookCleanupIfUnchanged(
  snapshot: AudioBookWriterSnapshot,
  cleanup: () => Promise<void>
): Promise<boolean> {
  const { directoryUri } = snapshot;
  if (idleBookWriterSnapshots.get(directoryUri) !== snapshot) return false;
  return runUnderAudioBookLease(directoryUri, async () => {
    if (idleBookWriterSnapshots.get(directoryUri) !== snapshot) return false;
    // Retire before the asynchronous delete, so another playback cannot reuse this claim.
    idleBookWriterSnapshots.delete(directoryUri);
    await cleanup();
    return true;
  });
}

// Native cancellation enumerates tasks asynchronously and removes the stable job record.
// A retry with overlapping book/translation scope must wait before creating either of them.
const audioCancellationTails = new Map<string, Promise<void>>();

/** A UI Cancel tail owns final record removal after all of this job's writers settle. */
export function hasPendingAudioDownloadCancellationCleanup(jobId: string): boolean {
  return audioCancellationTails.has(jobId);
}

export function runAudioDownloadCancellationCleanup(
  jobId: string,
  cleanup: () => Promise<void>
): void {
  const previous = audioCancellationTails.get(jobId) ?? Promise.resolve();
  const pending = previous
    .then(cleanup)
    .catch(() => {}) // Cancellation cleanup is best effort, including native module setup.
    .finally(() => {
      if (audioCancellationTails.get(jobId) === pending) audioCancellationTails.delete(jobId);
    });
  audioCancellationTails.set(jobId, pending);
}

function cancellationScopesOverlap(jobId: string, cleanupJobId: string): boolean {
  const [prefix, translationId, scope] = jobId.split(':');
  const translationPrefix = `${prefix}:${translationId}:`;
  return (
    cleanupJobId === jobId ||
    (cleanupJobId.startsWith(translationPrefix) &&
      (scope === 'translation' || cleanupJobId.startsWith(`${translationPrefix}translation:`)))
  );
}

/** Nonblocking admission check while holding the book lease; never await cleanup under it. */
export function hasOverlappingAudioDownloadCancellationCleanup(jobId: string): boolean {
  return Array.from(audioCancellationTails.keys()).some((id) =>
    cancellationScopesOverlap(jobId, id)
  );
}

export async function waitForAudioDownloadCancellationCleanup(
  jobId: string,
  signal?: AbortSignal
): Promise<void> {
  while (true) {
    if (signal?.aborted) return;
    const pending = Array.from(audioCancellationTails.entries())
      .filter(([cleanupJobId]) => cancellationScopesOverlap(jobId, cleanupJobId))
      .map(([, tail]) => tail);
    if (pending.length === 0) return;
    if (!signal) {
      await Promise.all(pending);
      continue;
    }
    let onAbort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      onAbort = resolve;
    });
    signal.addEventListener('abort', onAbort);
    try {
      await Promise.race([Promise.all(pending), aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export function runAudioBookExclusively<T>(
  directoryUri: string,
  signal: AbortSignal,
  run: () => Promise<T>
): Promise<T> {
  idleBookWriterSnapshots.delete(directoryUri);
  return runUnderAudioBookLease(directoryUri, async () => {
    if (signal.aborted) throw new AudioDownloadCancelledError();
    return run();
  });
}

async function runUnderAudioBookLease<T>(
  directoryUri: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = bookDownloadTails.get(directoryUri) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  bookDownloadTails.set(directoryUri, tail);
  try {
    await previous;
    return await run();
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

// Capture at the cancellation boundary: a retry registered later must not wait on itself.
export async function waitForAudioDownloadOwnersToSettle(jobId: string): Promise<void> {
  const running = Array.from(activeAudioDownloads.entries())
    .filter(([activeJobId]) => activeJobId === jobId || activeJobId.startsWith(`${jobId}:request:`))
    .flatMap(([, entries]) => Array.from(entries));
  await Promise.all(running.map((entry) => entry.settled));
}

export function requestAudioDownloadCancellation(jobId: string): void {
  for (const [activeJobId, entries] of activeAudioDownloads) {
    if (activeJobId === jobId || activeJobId.startsWith(`${jobId}:request:`)) {
      entries.forEach((entry) => entry.controller.abort());
    }
  }
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
