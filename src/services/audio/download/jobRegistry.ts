/**
 * Persisted download job records: ids, the job store (file-backed, with an in-memory fallback)
 * and the start / reattach / fail / complete transitions.
 */
import type {
  AudioDownloadJobRecord,
  AudioDownloadJobScope,
  AudioDownloadJobStatus,
  AudioDownloadJobStore,
  AudioDownloadLifecycleHooks,
  AudioFileSystemAdapter,
  DownloadContext,
} from './types';
import { DEFAULT_AUDIO_ROOT_URI } from './audioFileLocations';

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
  const { createPersistentAudioDownloadJobStore } = await import('../audioDownloadJobStore');
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

export const resolveJobStore = async (fileSystem: AudioFileSystemAdapter, rootUri?: string) => {
  try {
    return await createAudioDownloadJobStore({
      fileSystem,
      rootUri,
    });
  } catch {
    return createFallbackAudioDownloadJobStore(rootUri ?? DEFAULT_AUDIO_ROOT_URI);
  }
};

// The in-memory fallback keeps records (rather than discarding them) because fail/complete
// treat a job missing from the store as removed and skip it.
const MEMORY_JOB_STORE_KEY = 'memory://everybible-audio-jobs/';

const resolveJobStoreOrMemory = (jobStore?: AudioDownloadJobStore): AudioDownloadJobStore =>
  jobStore ?? createFallbackAudioDownloadJobStore(MEMORY_JOB_STORE_KEY);

const isDevRuntime = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

// A job disappears from the store when the user cancels or deletes the translation's audio while
// a transfer is still settling. Writing a record for it would invent an
// `audio-download:unknown:translation:all` entry, so the caller's late fail/complete is dropped.
const logMissingAudioJob = (action: 'fail' | 'complete', jobId: string) => {
  if (isDevRuntime()) {
    console.debug(`[AudioDownload] Skipping ${action} for job no longer in the store: ${jobId}`);
  }
};

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
}: FailJobParams): Promise<AudioDownloadJobRecord | null> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const existing = await activeJobStore.getJob(jobId);
  if (!existing) {
    logMissingAudioJob('fail', jobId);
    return null;
  }
  const failed = createJobRecord(
    existing.translationId,
    existing.scope,
    existing.bookId,
    'failed',
    existing
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
}): Promise<AudioDownloadJobRecord | null> {
  const activeJobStore = resolveJobStoreOrMemory(jobStore);
  const existing = await activeJobStore.getJob(jobId);
  if (!existing) {
    logMissingAudioJob('complete', jobId);
    return null;
  }
  const completed = createJobRecord(
    existing.translationId,
    existing.scope,
    existing.bookId,
    'completed',
    existing
  );
  await upsertJob(activeJobStore, completed);
  hooks?.onComplete?.(completed);
  return completed;
}
