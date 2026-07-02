import type { BibleBook } from '../../constants/books';
import { buildAudioChapterTargets } from './audioDownloads';
import { getRemoteAudioFileExtension } from './audioRemote';

const DEFAULT_AUDIO_ROOT_URI = 'file:///everybible-audio/';
const DEFAULT_CHAPTER_DOWNLOAD_CONCURRENCY = 4;
const DEFAULT_BOOK_DOWNLOAD_CONCURRENCY = 2;

// Real chapter audio is always far larger than this. Anything smaller on disk is
// almost certainly a truncated download or an HTTP error body (404/500 page) that
// got written to the destination file — treat it as not-yet-downloaded rather than
// letting the fileExists short-circuit mark it "complete" forever.
export const AUDIO_DOWNLOAD_MIN_VALID_BYTES = 1024;

export type AudioDownloadJobScope = 'book' | 'translation';
export type AudioDownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface AudioDownloadJobRecord {
  id: string;
  translationId: string;
  scope: AudioDownloadJobScope;
  bookId?: string;
  status: AudioDownloadJobStatus;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  error?: string;
}

export interface AudioDownloadJobStore {
  listJobs: () => Promise<AudioDownloadJobRecord[]>;
  getJob: (jobId: string) => Promise<AudioDownloadJobRecord | null>;
  upsertJob: (job: AudioDownloadJobRecord) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
}

export interface AudioDownloadBookProgress {
  translationId: string;
  bookId: string;
  chapter?: number;
  progress: number;
  completedChapters: number;
  totalChapters: number;
  jobId: string;
}

export interface AudioDownloadCollectionProgress {
  translationId: string;
  bookId: string;
  completedBooks: number;
  totalBooks: number;
  jobId: string;
}

export interface AudioDownloadLifecycleHooks {
  onStart?: (job: AudioDownloadJobRecord) => void;
  onReattach?: (job: AudioDownloadJobRecord) => void;
  onFailure?: (job: AudioDownloadJobRecord, error: Error) => void;
  onComplete?: (job: AudioDownloadJobRecord) => void;
  onProgress?: (progress: AudioDownloadBookProgress) => void;
  onBookComplete?: (progress: AudioDownloadCollectionProgress) => void;
}

export interface AudioFileSystemAdapter {
  ensureDirectory: (directoryUri: string) => Promise<void>;
  fileExists: (fileUri: string) => Promise<boolean>;
  downloadFile: (
    from: string,
    to: string,
    options?: {
      jobId?: string;
      taskId?: string;
      translationId?: string;
      bookId?: string;
      chapter?: number;
      onProgress?: (progress: { bytesDownloaded: number; bytesTotal: number }) => void;
    }
  ) => Promise<void>;
  readTextFile?: (fileUri: string) => Promise<string | null>;
  writeTextFile?: (fileUri: string, contents: string) => Promise<void>;
  deleteFile?: (fileUri: string) => Promise<void>;
  getFileSize?: (fileUri: string) => Promise<number | null>;
}

export interface AudioDownloadTransport {
  downloadFile: AudioFileSystemAdapter['downloadFile'];
  reattachJob?: (jobId: string) => Promise<void>;
  cancelJob?: (jobId: string) => Promise<void>;
}

export interface RemoteAudioAsset {
  url: string;
  duration: number;
}

export type ResolveRemoteAudio = (
  translationId: string,
  bookId: string,
  chapter: number
) => Promise<RemoteAudioAsset | null>;

export function createAudioDownloadJobId({
  translationId,
  scope,
  bookId,
}: {
  translationId: string;
  scope: AudioDownloadJobScope;
  bookId?: string;
}): string {
  return `audio-download:${translationId}:${scope}:${scope === 'book' ? bookId ?? 'unknown' : 'all'}`;
}

// Keyed by job id so a caller holding only the id (e.g. bibleStore's cancelDownload) can
// abort the exact in-flight runWithConcurrency loop driving that job, without needing a
// reference to the download promise itself.
const activeDownloadAbortControllers = new Map<string, AbortController>();

function registerAudioDownloadAbortController(jobId: string): AbortController {
  const controller = new AbortController();
  activeDownloadAbortControllers.set(jobId, controller);
  return controller;
}

function releaseAudioDownloadAbortController(jobId: string): void {
  activeDownloadAbortControllers.delete(jobId);
}

export function requestAudioDownloadCancellation(jobId: string): void {
  activeDownloadAbortControllers.get(jobId)?.abort();
}

interface DownloadContext {
  rootUri?: string;
  jobStore?: AudioDownloadJobStore;
  hooks?: AudioDownloadLifecycleHooks;
  transport?: AudioDownloadTransport;
}

interface DownloadAudioBookParams extends DownloadContext {
  translationId: string;
  book: BibleBook;
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
  signal?: AbortSignal;
}

interface DownloadAudioTranslationParams extends DownloadContext {
  translationId: string;
  books: BibleBook[];
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
}

interface StartJobParams extends DownloadContext {
  translationId: string;
  scope: AudioDownloadJobScope;
  bookId?: string;
}

interface FailJobParams extends DownloadContext {
  jobId: string;
  error: Error;
}

const loadJobStoreFactory = async () => {
  const { createPersistentAudioDownloadJobStore } = await import('./audioDownloadStorage');
  return createPersistentAudioDownloadJobStore;
};

export async function createAudioDownloadJobStore({
  fileSystem,
  rootUri,
}: {
  fileSystem: AudioFileSystemAdapter;
  rootUri?: string;
}): Promise<AudioDownloadJobStore> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;

  try {
    const createStore = await loadJobStoreFactory();
    return createStore({
      fileSystem,
      rootUri: resolvedRootUri,
    });
  } catch {
    return createFallbackAudioDownloadJobStore(resolvedRootUri);
  }
}

const resolveJobStore = async (fileSystem: AudioFileSystemAdapter, rootUri?: string) => {
  try {
    return await createAudioDownloadJobStore({
      fileSystem,
      rootUri,
    });
  } catch {
    return memoryJobStore;
  }
};

const memoryJobStore: AudioDownloadJobStore = {
  listJobs: async () => [],
  getJob: async () => null,
  upsertJob: async () => undefined,
  removeJob: async () => undefined,
};

const resolveJobStoreOrMemory = (jobStore?: AudioDownloadJobStore): AudioDownloadJobStore =>
  jobStore ?? memoryJobStore;

const fallbackJobStores = new Map<string, Map<string, AudioDownloadJobRecord>>();

const createFallbackAudioDownloadJobStore = (rootUri: string): AudioDownloadJobStore => {
  const jobs = fallbackJobStores.get(rootUri) ?? new Map<string, AudioDownloadJobRecord>();
  fallbackJobStores.set(rootUri, jobs);

  return {
    listJobs: async () => Array.from(jobs.values()),
    getJob: async (jobId) => jobs.get(jobId) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (jobId) => {
      jobs.delete(jobId);
    },
  };
};

const createJobRecord = (
  translationId: string,
  scope: AudioDownloadJobScope,
  bookId?: string,
  status: AudioDownloadJobStatus = 'downloading',
  existing?: AudioDownloadJobRecord
): AudioDownloadJobRecord => {
  const now = Date.now();
  return existing
    ? {
        ...existing,
        translationId,
        scope,
        bookId,
        status,
        updatedAt: now,
        attemptCount: existing.attemptCount,
        error: status === 'failed' ? existing.error : undefined,
      }
    : {
        id: createAudioDownloadJobId({ translationId, scope, bookId }),
        translationId,
        scope,
        bookId,
        status,
        createdAt: now,
        updatedAt: now,
        attemptCount: 1,
      };
};

const upsertJob = async (
  jobStore: AudioDownloadJobStore,
  job: AudioDownloadJobRecord
): Promise<AudioDownloadJobRecord> => {
  await jobStore.upsertJob(job);
  return job;
};

export async function startAudioDownloadJob({
  translationId,
  scope,
  bookId,
  jobStore,
  hooks,
}: StartJobParams): Promise<AudioDownloadJobRecord> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const id = createAudioDownloadJobId({ translationId, scope, bookId });
  const existing = await activeJobStore.getJob(id);

  if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
    const reattached = await upsertJob(
      activeJobStore,
      createJobRecord(translationId, scope, bookId, 'downloading', existing)
    );
    hooks?.onReattach?.(reattached);
    return reattached;
  }

  const started = await upsertJob(
    activeJobStore,
    createJobRecord(translationId, scope, bookId, 'downloading', existing ?? undefined)
  );
  hooks?.onStart?.(started);
  return started;
}

export async function reattachAudioDownloadJob({
  jobId,
  jobStore,
  hooks,
}: {
  jobId: string;
  jobStore: AudioDownloadJobStore;
  hooks?: AudioDownloadLifecycleHooks;
}): Promise<AudioDownloadJobRecord | null> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const existing = await activeJobStore.getJob(jobId);
  if (!existing || (existing.status !== 'downloading' && existing.status !== 'queued')) {
    return null;
  }

  const reattached = await upsertJob(
    activeJobStore,
    createJobRecord(existing.translationId, existing.scope, existing.bookId, 'downloading', existing)
  );
  hooks?.onReattach?.(reattached);
  return reattached;
}

export async function failAudioDownloadJob({
  jobId,
  jobStore,
  error,
  hooks,
}: FailJobParams): Promise<AudioDownloadJobRecord> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const existing = await activeJobStore.getJob(jobId);
  const failed = createJobRecord(
    existing?.translationId ?? 'unknown',
    existing?.scope ?? 'translation',
    existing?.bookId,
    'failed',
    existing ?? undefined
  );
  failed.error = error.message;
  await upsertJob(activeJobStore, failed);
  hooks?.onFailure?.(failed, error);
  return failed;
}

export async function completeAudioDownloadJob({
  jobId,
  jobStore,
  hooks,
}: {
  jobId: string;
  jobStore: AudioDownloadJobStore;
  hooks?: AudioDownloadLifecycleHooks;
}): Promise<AudioDownloadJobRecord> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const existing = await activeJobStore.getJob(jobId);
  const completed = createJobRecord(
    existing?.translationId ?? 'unknown',
    existing?.scope ?? 'translation',
    existing?.bookId,
    'completed',
    existing ?? undefined
  );
  await upsertJob(activeJobStore, completed);
  hooks?.onComplete?.(completed);
  return completed;
}

export function getBookAudioDirectoryUri(
  translationId: string,
  bookId: string,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${rootUri}${translationId}/${bookId}/`;
}

export function getChapterAudioFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${getBookAudioDirectoryUri(translationId, bookId, rootUri)}${chapter}.${getRemoteAudioFileExtension(
    translationId
  )}`;
}

function getLegacyChapterAudioFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${getBookAudioDirectoryUri(translationId, bookId, rootUri)}${chapter}.mp3`;
}

export async function getDownloadedChapterAudioUri(
  translationId: string,
  bookId: string,
  chapter: number,
  fileSystem: AudioFileSystemAdapter,
  rootUri?: string
): Promise<string | null> {
  const fileUri = getChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  if (await fileSystem.fileExists(fileUri)) {
    return fileUri;
  }

  const legacyFileUri = getLegacyChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  if (legacyFileUri !== fileUri && (await fileSystem.fileExists(legacyFileUri))) {
    return legacyFileUri;
  }

  return null;
}

function createAudioDownloadTaskId(jobId: string, bookId: string, chapter: number): string {
  return `${jobId}:${bookId}:${chapter}`;
}

// Guards the fileExists short-circuit that decides whether a chapter is already
// downloaded. Adapters that can report file size (see expoAudioFileSystemAdapter)
// let this self-heal a previously corrupted download instead of treating it as
// permanently complete; adapters without getFileSize fall back to existence only.
async function isValidDownloadedAudioFile(
  fileSystem: AudioFileSystemAdapter,
  fileUri: string
): Promise<boolean> {
  if (!(await fileSystem.fileExists(fileUri))) {
    return false;
  }

  if (!fileSystem.getFileSize) {
    return true;
  }

  const size = await fileSystem.getFileSize(fileUri);
  if (size != null && size >= AUDIO_DOWNLOAD_MIN_VALID_BYTES) {
    return true;
  }

  await fileSystem.deleteFile?.(fileUri);
  return false;
}

const AUDIO_DOWNLOAD_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Validates a completed download before it is trusted: rejects HTTP error statuses
// and undersized files (a 404/500 error page saved to disk would otherwise look like
// a "successful" download), and deletes the bad file so it doesn't linger and get
// picked up by the fileExists short-circuit on a future run.
export async function downloadAndValidateAudioFile({
  sourceUrl,
  runDownload,
  getFileSize,
  deleteFile,
  timeoutMs = AUDIO_DOWNLOAD_TIMEOUT_MS,
  minValidBytes = AUDIO_DOWNLOAD_MIN_VALID_BYTES,
}: {
  sourceUrl: string;
  runDownload: () => Promise<{ status: number }>;
  getFileSize: () => Promise<number>;
  deleteFile: () => Promise<void>;
  timeoutMs?: number;
  minValidBytes?: number;
}): Promise<void> {
  let result: { status: number };
  try {
    result = await withTimeout(
      runDownload(),
      timeoutMs,
      `Download timed out after ${timeoutMs}ms: ${sourceUrl}`
    );
  } catch (error) {
    await deleteFile();
    throw error;
  }

  if (result.status < 200 || result.status >= 300) {
    await deleteFile();
    throw new Error(`Download failed with HTTP ${result.status}: ${sourceUrl}`);
  }

  const size = await getFileSize();
  if (size < minValidBytes) {
    await deleteFile();
    throw new Error(`Downloaded file too small (${size} bytes): ${sourceUrl}`);
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  let firstError: Error | null = null;

  const runners = Array.from({ length: limit }, async () => {
    while (firstError == null && !signal?.aborted) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        await worker(items[currentIndex] as T);
      } catch (error) {
        firstError = error instanceof Error ? error : new Error(String(error));
        return;
      }
    }
  });

  await Promise.all(runners);

  if (firstError) {
    throw firstError;
  }
}

class AudioDownloadCancelledError extends Error {
  constructor() {
    super('Audio download was cancelled.');
    this.name = 'AudioDownloadCancelledError';
  }
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(progress)));
}

export async function downloadAudioBook({
  rootUri,
  translationId,
  book,
  resolveRemoteAudio,
  fileSystem,
  jobStore,
  hooks,
  transport,
  signal: externalSignal,
}: DownloadAudioBookParams): Promise<{ bookId: string; chapterCount: number }> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;
  const activeJobStore = jobStore ?? (await resolveJobStore(fileSystem, resolvedRootUri));
  const activeTransport = transport ?? { downloadFile: fileSystem.downloadFile };
  const directoryUri = getBookAudioDirectoryUri(translationId, book.id, resolvedRootUri);
  const chapterTargets = buildAudioChapterTargets([book]);
  const chapterProgressByNumber = new Map<number, number>();
  const job = await startAudioDownloadJob({
    translationId,
    scope: 'book',
    bookId: book.id,
    jobStore: activeJobStore,
    hooks,
  });

  // A translation-level download passes its own signal down so cancelling the parent
  // job also stops every in-progress book's chapter loop. A standalone book download
  // registers its own controller keyed by this job's id, and cancelDownload() targets it.
  const ownAbortController = externalSignal ? null : registerAudioDownloadAbortController(job.id);
  const signal = externalSignal ?? ownAbortController!.signal;

  let lastEmittedProgress = -1;
  let lastEmittedCompletedChapters = -1;

  const emitBookProgress = (chapter?: number): void => {
    const totalChapters = chapterTargets.length;
    if (totalChapters === 0) {
      return;
    }

    const completedChapters = chapterTargets.reduce(
      (count, target) => count + (chapterProgressByNumber.get(target.chapter) === 100 ? 1 : 0),
      0
    );
    const aggregateProgress =
      chapterTargets.reduce(
        (sum, target) => sum + (chapterProgressByNumber.get(target.chapter) ?? 0),
        0
      ) / totalChapters;
    const progress = clampProgress(aggregateProgress);

    if (progress === lastEmittedProgress && completedChapters === lastEmittedCompletedChapters) {
      return;
    }

    lastEmittedProgress = progress;
    lastEmittedCompletedChapters = completedChapters;

    hooks?.onProgress?.({
      translationId,
      bookId: book.id,
      chapter,
      progress,
      completedChapters,
      totalChapters,
      jobId: job.id,
    });
  };

  await fileSystem.ensureDirectory(directoryUri);

  try {
    await runWithConcurrency(
      chapterTargets,
      DEFAULT_CHAPTER_DOWNLOAD_CONCURRENCY,
      async (target) => {
        chapterProgressByNumber.set(target.chapter, 0);
        const fileUri = getChapterAudioFileUri(
          translationId,
          target.bookId,
          target.chapter,
          resolvedRootUri
        );
        if (await isValidDownloadedAudioFile(fileSystem, fileUri)) {
          chapterProgressByNumber.set(target.chapter, 100);
          emitBookProgress(target.chapter);
          return;
        }

        const remoteAudio = await resolveRemoteAudio(translationId, target.bookId, target.chapter);
        if (!remoteAudio?.url) {
          throw new Error(`Audio is not available for ${target.bookId} ${target.chapter}`);
        }

        await activeTransport.downloadFile(remoteAudio.url, fileUri, {
          jobId: job.id,
          taskId: createAudioDownloadTaskId(job.id, target.bookId, target.chapter),
          translationId,
          bookId: target.bookId,
          chapter: target.chapter,
          onProgress: ({ bytesDownloaded, bytesTotal }) => {
            const chapterProgress =
              bytesTotal > 0 ? clampProgress((bytesDownloaded / bytesTotal) * 100) : 0;
            chapterProgressByNumber.set(target.chapter, chapterProgress);
            emitBookProgress(target.chapter);
          },
        });

        chapterProgressByNumber.set(target.chapter, 100);
        emitBookProgress(target.chapter);
      },
      signal
    );

    if (signal.aborted) {
      throw new AudioDownloadCancelledError();
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    await failAudioDownloadJob({
      jobId: job.id,
      jobStore: activeJobStore,
      error: failure,
      hooks,
    });
    throw failure;
  } finally {
    if (ownAbortController) {
      releaseAudioDownloadAbortController(job.id);
    }
  }

  await completeAudioDownloadJob({
    jobId: job.id,
    jobStore: activeJobStore,
    hooks,
  });

  return { bookId: book.id, chapterCount: chapterTargets.length };
}

export async function downloadAudioTranslation({
  rootUri,
  translationId,
  books,
  resolveRemoteAudio,
  fileSystem,
  jobStore,
  hooks,
  transport,
}: DownloadAudioTranslationParams): Promise<{ downloadedBookIds: string[] }> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;
  const activeJobStore = jobStore ?? (await resolveJobStore(fileSystem, resolvedRootUri));
  const activeTransport = transport ?? { downloadFile: fileSystem.downloadFile };
  const downloadedBookIds: string[] = [];
  const translationJob = await startAudioDownloadJob({
    translationId,
    scope: 'translation',
    jobStore: activeJobStore,
    hooks,
  });

  // Passing this signal into every nested downloadAudioBook means cancelling the
  // translation job also stops whichever book's chapter loop is currently in flight.
  const ownAbortController = registerAudioDownloadAbortController(translationJob.id);
  const signal = ownAbortController.signal;

  try {
    try {
      await runWithConcurrency(
        books,
        DEFAULT_BOOK_DOWNLOAD_CONCURRENCY,
        async (book) => {
          const result = await downloadAudioBook({
            rootUri: resolvedRootUri,
            translationId,
            book,
            resolveRemoteAudio,
            fileSystem,
            jobStore: activeJobStore,
            hooks,
            transport: activeTransport,
            signal,
          });
          downloadedBookIds.push(result.bookId);
          hooks?.onBookComplete?.({
            translationId,
            bookId: result.bookId,
            completedBooks: downloadedBookIds.length,
            totalBooks: books.length,
            jobId: translationJob.id,
          });
        },
        signal
      );

      if (signal.aborted) {
        throw new AudioDownloadCancelledError();
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      await failAudioDownloadJob({
        jobId: translationJob.id,
        jobStore: activeJobStore,
        error: failure,
        hooks,
      });
      throw failure;
    }
  } finally {
    releaseAudioDownloadAbortController(translationJob.id);
  }

  await completeAudioDownloadJob({
    jobId: translationJob.id,
    jobStore: activeJobStore,
    hooks,
  });

  return { downloadedBookIds };
}
