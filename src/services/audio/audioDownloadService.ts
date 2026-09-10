import type { BibleBook } from '../../constants/books';
import { assertSafeAssetId } from '../bible/assetIdentifiers';
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
      signal?: AbortSignal;
      onProgress?: (progress: { bytesDownloaded: number; bytesTotal: number }) => void;
    }
  ) => Promise<void>;
  readTextFile?: (fileUri: string) => Promise<string | null>;
  writeTextFile?: (fileUri: string, contents: string) => Promise<void>;
  deleteFile?: (fileUri: string) => Promise<void>;
  getFileSize?: (fileUri: string) => Promise<number | null>;
  // Base64 payload of a downloaded chapter, used only for sha256 verification. Optional so
  // adapters without it simply fall back to size-only validation.
  readBase64File?: (fileUri: string) => Promise<string | null>;
  // Free bytes on the volume holding the audio root, for the pre-flight in (N25).
  getFreeDiskBytes?: () => Promise<number | null>;
}

export interface AudioDownloadTransport {
  downloadFile: AudioFileSystemAdapter['downloadFile'];
  reattachJob?: (jobId: string) => Promise<void>;
  cancelJob?: (jobId: string) => Promise<void>;
}

export interface RemoteAudioAsset {
  url: string;
  duration: number;
  // Integrity metadata when the source publishes it (EL manifests do). When present these
  // replace the crude 1KB floor: an exact byte count and/or a sha256 is the only way to tell a
  // truncated/interrupted transfer apart from a complete chapter, since nothing here resumes
  // partials — see verifyDownloadedChapterAudio. (N23)
  bytes?: number;
  sha256?: string;
}

export type ResolveRemoteAudio = (
  translationId: string,
  bookId: string,
  chapter: number
) => Promise<RemoteAudioAsset | null>;

export const AUDIO_DOWNLOAD_JOB_ID_PREFIX = 'audio-download:';

export function createAudioDownloadJobId({
  translationId,
  scope,
  bookId,
}: {
  translationId: string;
  scope: AudioDownloadJobScope;
  bookId?: string;
}): string {
  return `audio-download:${translationId}:${scope}:${scope === 'book' ? (bookId ?? 'unknown') : 'all'}`;
}

// Native background-downloader task ids are always `${bookJobId}:${bookId}:${chapter}` — even for
// chapters spawned by a TRANSLATION-scope job, whose id shares only the
// `audio-download:<translationId>:` namespace with them. Matching a translation job by its own id
// prefix therefore found zero tasks, so cancelling/reattaching a whole-Bible download did nothing
// on the native side. A book-scope job still matches only its own tasks. (N22)
export function audioDownloadTaskIdMatchesJob(taskId: string, jobId: string): boolean {
  if (taskId === jobId || taskId.startsWith(`${jobId}:`)) {
    return true;
  }

  const segments = jobId.split(':');
  if (segments.length < 4 || segments[2] !== 'translation') {
    return false;
  }

  return taskId.startsWith(`${segments[0]}:${segments[1]}:`);
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
  // Set by the translation-scope path: the collection already ran one pre-flight for every book,
  // and its own lifecycle hooks own the UI-visible job id.
  skipFreeSpacePreflight?: boolean;
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
  const { createPersistentAudioDownloadJobStore } = await import('./audioDownloadJobStore');
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
    createJobRecord(
      existing.translationId,
      existing.scope,
      existing.bookId,
      'downloading',
      existing
    )
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

// Translation and book ids reach here from a remote catalog / manifest, and this URI is
// the base for every download, delete and directory-listing call below. A `../` segment in
// either id would walk out of the audio root, so both are validated before interpolation.
export function getBookAudioDirectoryUri(
  translationId: string,
  bookId: string,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${rootUri}${assertSafeAssetId(translationId, 'translation id')}/${assertSafeAssetId(
    bookId,
    'book id'
  )}/`;
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
  if (await isValidDownloadedAudioFile(fileSystem, fileUri)) {
    return fileUri;
  }

  const legacyFileUri = getLegacyChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  if (legacyFileUri !== fileUri && (await isValidDownloadedAudioFile(fileSystem, legacyFileUri))) {
    return legacyFileUri;
  }

  return null;
}

function createAudioDownloadTaskId(jobId: string, bookId: string, chapter: number): string {
  return `${jobId}:${bookId}:${chapter}`;
}

// Size metadata establishes existence too, avoiding two native filesystem reads.
// Playback lookup must not delete a partial file an active download is writing.
// The download worker opts into cleanup before retrying a corrupted cached file.
async function isValidDownloadedAudioFile(
  fileSystem: AudioFileSystemAdapter,
  fileUri: string,
  deleteInvalid = false
): Promise<boolean> {
  if (!fileSystem.getFileSize) {
    return fileSystem.fileExists(fileUri);
  }

  const size = await fileSystem.getFileSize(fileUri);
  if (size != null && Number.isFinite(size) && size >= AUDIO_DOWNLOAD_MIN_VALID_BYTES) {
    return true;
  }

  if (deleteInvalid && size != null) await fileSystem.deleteFile?.(fileUri);
  return false;
}

const AUDIO_DOWNLOAD_TIMEOUT_MS = 60_000;

// Per-chapter download tuning. The timeout is an INACTIVITY timeout (reset on every progress tick)
// rather than a fixed wall-clock budget, so a large chapter on a slow-but-progressing connection no
// longer hits a false failure — only a genuinely stalled transfer trips it. (L6) Each chapter is
// retried a few times with exponential backoff before the failure bubbles up and fails the job. (L7)
const AUDIO_DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;
const AUDIO_DOWNLOAD_MAX_ATTEMPTS = 3;
const AUDIO_DOWNLOAD_RETRY_BASE_DELAY_MS = 1_000;

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

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AudioDownloadCancelledError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AudioDownloadCancelledError());
    };

    signal?.addEventListener('abort', onAbort);
  });
}

// A transport must settle only after cancellation has stopped its native writer.
// Waiting for that settlement prevents retries from writing the same path concurrently.
async function downloadChapterWithInactivityTimeoutAndRetry(
  run: (onActivity: () => boolean, attemptSignal: AbortSignal) => Promise<void>,
  signal: AbortSignal | undefined,
  { inactivityTimeoutMs = AUDIO_DOWNLOAD_INACTIVITY_TIMEOUT_MS } = {}
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= AUDIO_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new AudioDownloadCancelledError();
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let active = true;
    const controller = new AbortController();

    const clearInactivityTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onAbort = () => {
      clearInactivityTimer();
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort);
    const onActivity = () => {
      if (!active || controller.signal.aborted) return false;
      clearInactivityTimer();
      timer = setTimeout(() => {
        timedOut = true;
        onAbort();
      }, inactivityTimeoutMs);
      return true;
    };

    try {
      onActivity();
      await run(onActivity, controller.signal);
      if (signal?.aborted) throw new AudioDownloadCancelledError();
      if (timedOut) throw new Error('Chapter download stalled (no progress).');
      return;
    } catch (error) {
      // A failed native stop leaves the destination unsafe for another writer.
      if (error instanceof AudioDownloadStopError) throw error;
      if (signal?.aborted || (!timedOut && isAudioDownloadCancellation(error))) {
        throw new AudioDownloadCancelledError();
      }
      lastError = timedOut
        ? new Error('Chapter download stalled (no progress).')
        : error instanceof Error
          ? error
          : new Error(String(error));
    } finally {
      active = false;
      clearInactivityTimer();
      signal?.removeEventListener('abort', onAbort);
    }
    if (attempt < AUDIO_DOWNLOAD_MAX_ATTEMPTS) {
      await delay(AUDIO_DOWNLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }

  throw lastError ?? new Error('Chapter download failed.');
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
  // Progress-aware transports use the chapter inactivity deadline instead.
  timeoutMs?: number | null;
  minValidBytes?: number;
}): Promise<void> {
  let result: { status: number };
  try {
    result =
      timeoutMs === null
        ? await runDownload()
        : await withTimeout(
            runDownload(),
            timeoutMs,
            `Download timed out after ${timeoutMs}ms: ${sourceUrl}`
          );
  } catch (error) {
    if (isAudioDownloadCancellation(error) || error instanceof AudioDownloadStopError) throw error;
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

export class AudioDownloadCancelledError extends Error {
  constructor() {
    super('Audio download was cancelled.');
    this.name = 'AudioDownloadCancelledError';
  }
}

// Thrown BEFORE any job record is created so a refused download leaves nothing behind. The
// message is user-facing: the translation picker surfaces `error.message` verbatim. (N25)
export class AudioDownloadInsufficientSpaceError extends Error {
  readonly requiredBytes: number;
  readonly freeBytes: number;

  constructor(requiredBytes: number, freeBytes: number) {
    super(
      `Not enough free space for this audio download. It needs about ${formatBytes(
        requiredBytes
      )} but only ${formatBytes(freeBytes)} is free. Free up space and try again.`
    );
    this.name = 'AudioDownloadInsufficientSpaceError';
    this.requiredBytes = requiredBytes;
    this.freeBytes = freeBytes;
  }
}

export class AudioDownloadStopError extends Error {
  constructor(error: unknown) {
    super(`Audio download stop failed: ${error instanceof Error ? error.message : String(error)}`);
    this.name = 'AudioDownloadStopError';
  }
}

export function isAudioDownloadCancellation(error: unknown): boolean {
  return error instanceof AudioDownloadCancelledError;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Average size of one compressed chapter of narration, used only when the source publishes no real
// byte counts. Deliberately on the optimistic side: a whole-Bible download is ~1,189 chapters, so
// an inflated estimate would refuse downloads that would actually have succeeded. The point of the
// pre-flight is to catch a genuinely full device, not to be an accurate size predictor. Pass an
// exact manifest total through `estimateTotalBytes` when one is available.
export const AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES = 2 * 1024 * 1024;
// A little room for the OS on top of the payload itself.
const AUDIO_DOWNLOAD_FREE_SPACE_HEADROOM = 1.05;

// Refuses a 100MB+ download up front instead of failing chapter-by-chapter on a full device. A
// filesystem adapter without `getFreeDiskBytes` (or a volume that cannot report free space) simply
// skips the check. (N25)
async function assertEnoughFreeSpaceForAudioDownload({
  fileSystem,
  chapterCount,
  estimateTotalBytes,
}: {
  fileSystem: AudioFileSystemAdapter;
  chapterCount: number;
  estimateTotalBytes?: () => Promise<number | null>;
}): Promise<void> {
  if (!fileSystem.getFreeDiskBytes || chapterCount === 0) {
    return;
  }

  let freeBytes: number | null = null;
  try {
    freeBytes = await fileSystem.getFreeDiskBytes();
  } catch {
    return;
  }
  if (freeBytes == null || !Number.isFinite(freeBytes)) {
    return;
  }

  let totalBytes: number | null = null;
  if (estimateTotalBytes) {
    try {
      totalBytes = await estimateTotalBytes();
    } catch {
      totalBytes = null;
    }
  }
  if (totalBytes == null || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    totalBytes = chapterCount * AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES;
  }

  const requiredBytes = Math.ceil(totalBytes * AUDIO_DOWNLOAD_FREE_SPACE_HEADROOM);
  if (freeBytes < requiredBytes) {
    throw new AudioDownloadInsufficientSpaceError(requiredBytes, freeBytes);
  }
}

// Post-download validation. Preference order: an exact byte count, then a sha256, then the crude
// 1KB floor as the last-resort fallback when the source publishes neither. A failure deletes the
// file (nothing resumes partials) and throws a plain Error so the chapter retry loop can try
// again. (N23)
async function verifyDownloadedChapterAudio({
  fileSystem,
  fileUri,
  expected,
}: {
  fileSystem: AudioFileSystemAdapter;
  fileUri: string;
  expected: { bytes?: number; sha256?: string };
}): Promise<void> {
  const discard = async () => {
    await fileSystem.deleteFile?.(fileUri);
  };

  if (fileSystem.getFileSize) {
    const size = await fileSystem.getFileSize(fileUri);
    if (expected.bytes != null) {
      if (size !== expected.bytes) {
        await discard();
        throw new Error(
          `Downloaded audio size mismatch (expected ${expected.bytes} bytes, got ${
            size ?? 0
          }): ${fileUri}`
        );
      }
    } else if (size == null || !Number.isFinite(size) || size < AUDIO_DOWNLOAD_MIN_VALID_BYTES) {
      await discard();
      throw new Error(`Downloaded audio is missing or incomplete: ${fileUri}`);
    }
  }

  // Hermes has no Web Crypto, so this reuses the same pure-JS hasher as text-pack verification.
  if (expected.sha256 && fileSystem.readBase64File) {
    const [{ base64UrlToBytes, sha256HexSync }, base64] = await Promise.all([
      import('../elMedia/elEs256'),
      fileSystem.readBase64File(fileUri),
    ]);
    const bytes = base64 ? base64UrlToBytes(base64.replace(/\+/g, '-').replace(/\//g, '_')) : null;
    if (!bytes) {
      await discard();
      throw new Error(`Downloaded audio could not be read for verification: ${fileUri}`);
    }
    if (sha256HexSync(bytes) !== expected.sha256.toLowerCase()) {
      await discard();
      throw new Error(`Downloaded audio failed integrity verification (checksum): ${fileUri}`);
    }
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
  skipFreeSpacePreflight,
}: DownloadAudioBookParams): Promise<{ bookId: string; chapterCount: number }> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;
  const activeJobStore = jobStore ?? (await resolveJobStore(fileSystem, resolvedRootUri));
  const activeTransport = transport ?? { downloadFile: fileSystem.downloadFile };
  const directoryUri = getBookAudioDirectoryUri(translationId, book.id, resolvedRootUri);
  const chapterTargets = buildAudioChapterTargets([book]);
  const chapterProgressByNumber = new Map<number, number>();

  if (!skipFreeSpacePreflight) {
    await assertEnoughFreeSpaceForAudioDownload({
      fileSystem,
      chapterCount: chapterTargets.length,
    });
  }

  const job = await startAudioDownloadJob({
    translationId,
    scope: 'book',
    bookId: book.id,
    jobStore: activeJobStore,
    hooks,
  });

  // EVERY book job registers its own controller, including nested ones. Previously a nested book
  // job reused the parent's signal and was absent from the registry, so anything holding a book
  // job id (the native transport's task namespace, a reattach, a stale downloadProgress.jobId)
  // could not abort it. The parent signal is chained into the child so cancelling the translation
  // still stops every book. (N22)
  const ownAbortController = registerAudioDownloadAbortController(job.id);
  const signal = ownAbortController.signal;
  const onExternalAbort = () => ownAbortController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) ownAbortController.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

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

  try {
    await fileSystem.ensureDirectory(directoryUri);
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
        if (await isValidDownloadedAudioFile(fileSystem, fileUri, true)) {
          if (signal.aborted) throw new AudioDownloadCancelledError();
          chapterProgressByNumber.set(target.chapter, 100);
          emitBookProgress(target.chapter);
          return;
        }

        const remoteAudio = await resolveRemoteAudio(translationId, target.bookId, target.chapter);
        if (!remoteAudio?.url) {
          throw new Error(`Audio is not available for ${target.bookId} ${target.chapter}`);
        }

        await downloadChapterWithInactivityTimeoutAndRetry(async (onActivity, attemptSignal) => {
          await activeTransport.downloadFile(remoteAudio.url, fileUri, {
            jobId: job.id,
            taskId: createAudioDownloadTaskId(job.id, target.bookId, target.chapter),
            translationId,
            bookId: target.bookId,
            chapter: target.chapter,
            signal: attemptSignal,
            onProgress: ({ bytesDownloaded, bytesTotal }) => {
              if (!onActivity()) return;
              const chapterProgress =
                bytesTotal > 0
                  ? Math.min(99, clampProgress((bytesDownloaded / bytesTotal) * 100))
                  : 0;
              chapterProgressByNumber.set(target.chapter, chapterProgress);
              emitBookProgress(target.chapter);
            },
          });
          if (attemptSignal.aborted) throw new AudioDownloadCancelledError();
          await verifyDownloadedChapterAudio({
            fileSystem,
            fileUri,
            expected: { bytes: remoteAudio.bytes, sha256: remoteAudio.sha256 },
          });
        }, signal);

        if (signal.aborted) throw new AudioDownloadCancelledError();
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

    // A cancellation is a first-class terminal state, not a failure. Remove the persisted job so
    // it can't resurrect as a phantom "Loading… 0%" on the next launch, and skip failAudioDownloadJob
    // (which would fire onFailure → an error alert in the UI). (M2)
    if (failure instanceof AudioDownloadCancelledError) {
      await activeJobStore.removeJob(job.id);
      throw failure;
    }

    await failAudioDownloadJob({
      jobId: job.id,
      jobStore: activeJobStore,
      error: failure,
      hooks,
    });
    throw failure;
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort);
    releaseAudioDownloadAbortController(job.id);
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
  const totalChapters = buildAudioChapterTargets(books).length;

  await assertEnoughFreeSpaceForAudioDownload({ fileSystem, chapterCount: totalChapters });

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

  // Book-scope lifecycle events must NOT reach the caller: startAudioDownloadJob fires onStart for
  // each nested BOOK job, which used to overwrite the UI's downloadProgress.jobId with a job id
  // that cancelDownload could not act on. The collection's own hooks stay authoritative. (N22)
  const completedChaptersByBook = new Map<string, number>();
  let lastEmittedProgress = -1;
  let lastEmittedCompletedChapters = -1;
  const bookHooks: AudioDownloadLifecycleHooks = {
    // Aggregate chapters across every book so a whole-Bible download reports real progress instead
    // of sitting at 0% until an entire book finishes. Coalesced exactly like the per-book emitter
    // so the set() rate stays where the June ANR fix put it. (N25)
    onProgress: hooks?.onProgress
      ? (event) => {
          completedChaptersByBook.set(event.bookId, event.completedChapters);
          if (totalChapters === 0) return;
          let completedChapters = 0;
          completedChaptersByBook.forEach((count) => {
            completedChapters += count;
          });
          const progress = clampProgress((completedChapters / totalChapters) * 100);
          if (
            progress === lastEmittedProgress &&
            completedChapters === lastEmittedCompletedChapters
          ) {
            return;
          }
          lastEmittedProgress = progress;
          lastEmittedCompletedChapters = completedChapters;
          hooks.onProgress?.({
            translationId,
            bookId: event.bookId,
            chapter: event.chapter,
            progress,
            completedChapters,
            totalChapters,
            jobId: translationJob.id,
          });
        }
      : undefined,
  };

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
            hooks: bookHooks,
            transport: activeTransport,
            signal,
            skipFreeSpacePreflight: true,
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

      // Cancellation is terminal-but-not-a-failure: drop the persisted job and re-throw without
      // firing onFailure, so cancelling a full-Bible audio download doesn't surface an error alert
      // or leave a phantom job behind. (M2)
      if (failure instanceof AudioDownloadCancelledError) {
        await activeJobStore.removeJob(translationJob.id);
        throw failure;
      }

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
