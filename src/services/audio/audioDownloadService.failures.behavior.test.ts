import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById, type BibleBook } from '../../constants/books';
import {
  AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES,
  AudioDownloadCancelledError,
  AudioDownloadInsufficientSpaceError,
  completeAudioDownloadJob,
  createAudioDownloadJobId,
  createAudioDownloadJobStore,
  downloadAndValidateAudioFile,
  downloadAudioBook,
  downloadAudioTranslation,
  reattachAudioDownloadJob,
  requestAudioDownloadCancellation,
  startAudioDownloadJob,
  type AudioDownloadJobRecord,
  type AudioDownloadJobStore,
  type AudioFileSystemAdapter,
  type ResolveRemoteAudio,
} from './audioDownloadService';

// Failure, cancellation and cleanup paths of the offline audio download service. Every
// collaborator is an injected double (AudioFileSystemAdapter, AudioDownloadJobStore,
// resolveRemoteAudio), so no module mocks are needed.

const VALID_BYTES = 4_096;
const PHM_JOB_ID = 'audio-download:bsb:book:PHM';
const TRANSLATION_JOB_ID = 'audio-download:bsb:translation:all';

type DownloadOptions = NonNullable<Parameters<AudioFileSystemAdapter['downloadFile']>[2]>;

function book(id: string): BibleBook {
  const found = getBookById(id);
  assert.ok(found, `unknown book ${id}`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

function memoryJobStore() {
  const jobs = new Map<string, AudioDownloadJobRecord>();
  const store: AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (id) => jobs.get(id) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (id) => {
      jobs.delete(id);
    },
  };
  return { jobs, store };
}

function jobRecord(overrides: Partial<AudioDownloadJobRecord>): AudioDownloadJobRecord {
  return {
    id: PHM_JOB_ID,
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    status: 'downloading',
    createdAt: 1,
    updatedAt: 2,
    attemptCount: 3,
    ...overrides,
  };
}

/** A sized in-memory file system: files map uri -> byte count. */
function sizedFileSystem() {
  const files = new Map<string, number>();
  const downloads: Array<{ from: string; to: string; options?: DownloadOptions }> = [];
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async (uri) => files.has(uri),
    getFileSize: async (uri) => files.get(uri) ?? null,
    deleteFile: async (uri) => {
      files.delete(uri);
    },
    downloadFile: async (from, to, options) => {
      downloads.push({ from, to, options });
      files.set(to, VALID_BYTES);
    },
  };
  return { files, downloads, fileSystem };
}

const resolvePhm: ResolveRemoteAudio = async (_translationId, bookId, chapter) => ({
  url: `https://audio.test/${bookId}/${chapter}.mp3`,
  duration: 10,
});

function recordingHooks() {
  const events: string[] = [];
  const failures: Error[] = [];
  const progress: number[] = [];
  return {
    events,
    failures,
    progress,
    hooks: {
      onStart: (job: AudioDownloadJobRecord) => events.push(`start:${job.id}`),
      onReattach: (job: AudioDownloadJobRecord) => events.push(`reattach:${job.id}`),
      onComplete: (job: AudioDownloadJobRecord) => events.push(`complete:${job.id}`),
      onFailure: (job: AudioDownloadJobRecord, error: Error) => {
        events.push(`failure:${job.id}`);
        failures.push(error);
      },
      onProgress: (event: { progress: number }) => progress.push(event.progress),
    },
  };
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

test('without a job store the in-memory fallback remembers a running job until it completes', async () => {
  const recorder = recordingHooks();
  // completeAudioDownloadJob types its store as required but falls back to memory without one.
  const noStore = undefined as unknown as AudioDownloadJobStore;
  const start = () =>
    startAudioDownloadJob({
      translationId: 'bsb',
      scope: 'book',
      bookId: 'PHM',
      hooks: recorder.hooks,
    });

  const first = await start();
  const second = await start();
  const completed = await completeAudioDownloadJob({
    jobId: PHM_JOB_ID,
    jobStore: noStore,
    hooks: recorder.hooks,
  });
  const restarted = await start();
  await completeAudioDownloadJob({
    jobId: PHM_JOB_ID,
    jobStore: noStore,
  });

  assert.equal(first.id, PHM_JOB_ID);
  assert.equal(first.status, 'downloading');
  assert.equal(first.attemptCount, 1);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.attemptCount, 1);
  assert.equal(completed?.status, 'completed');
  assert.equal(restarted.status, 'downloading');
  assert.deepEqual(recorder.events, [
    `start:${PHM_JOB_ID}`,
    `reattach:${PHM_JOB_ID}`,
    `complete:${PHM_JOB_ID}`,
    `start:${PHM_JOB_ID}`,
  ]);
});

test('starting a job that is still queued reattaches to it and keeps its history', async () => {
  const { jobs, store } = memoryJobStore();
  jobs.set(PHM_JOB_ID, jobRecord({ status: 'queued', createdAt: 5 }));
  const recorder = recordingHooks();

  const job = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    jobStore: store,
    hooks: recorder.hooks,
  });

  assert.equal(job.status, 'downloading');
  assert.equal(job.createdAt, 5);
  assert.equal(job.attemptCount, 3);
  assert.deepEqual(recorder.events, [`reattach:${PHM_JOB_ID}`]);
  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'downloading');
});

test('restarting a failed job starts it again and clears the previous error', async () => {
  const { jobs, store } = memoryJobStore();
  jobs.set(PHM_JOB_ID, jobRecord({ status: 'failed', error: 'network down' }));
  const recorder = recordingHooks();

  const job = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    jobStore: store,
    hooks: recorder.hooks,
  });

  assert.equal(job.status, 'downloading');
  assert.equal(job.error, undefined);
  assert.deepEqual(recorder.events, [`start:${PHM_JOB_ID}`]);
});

test('reattaching resumes a queued job but ignores finished and unknown jobs', async () => {
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();
  jobs.set(PHM_JOB_ID, jobRecord({ status: 'queued' }));
  jobs.set('done', jobRecord({ id: 'done', status: 'completed' }));
  jobs.set('broken', jobRecord({ id: 'broken', status: 'failed' }));

  const resumed = await reattachAudioDownloadJob({
    jobId: PHM_JOB_ID,
    jobStore: store,
    hooks: recorder.hooks,
  });

  assert.equal(resumed?.status, 'downloading');
  assert.equal(
    await reattachAudioDownloadJob({ jobId: 'done', jobStore: store, hooks: recorder.hooks }),
    null
  );
  assert.equal(
    await reattachAudioDownloadJob({ jobId: 'broken', jobStore: store, hooks: recorder.hooks }),
    null
  );
  assert.equal(
    await reattachAudioDownloadJob({ jobId: 'missing', jobStore: store, hooks: recorder.hooks }),
    null
  );
  assert.deepEqual(recorder.events, [`reattach:${PHM_JOB_ID}`]);
  assert.equal(jobs.get('done')?.status, 'completed');
});

test('a book job id without a book falls back to an explicit unknown segment', () => {
  assert.equal(
    createAudioDownloadJobId({ translationId: 'bsb', scope: 'book' }),
    'audio-download:bsb:book:unknown'
  );
});

test('the job registry defaults to the shared audio root when no root is given', async () => {
  const written = new Map<string, string>();
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    downloadFile: async () => {},
    readTextFile: async (uri) => written.get(uri) ?? null,
    writeTextFile: async (uri, contents) => {
      written.set(uri, contents);
    },
  };

  const store = await createAudioDownloadJobStore({ fileSystem });
  await store.upsertJob(jobRecord({}));

  assert.deepEqual([...written.keys()], ['file:///everybible-audio/download-jobs.json']);
});

// ---------------------------------------------------------------------------
// downloadAndValidateAudioFile
// ---------------------------------------------------------------------------

test('a transfer that fails before its deadline deletes the partial file and rethrows', async () => {
  let deletes = 0;

  await assert.rejects(
    downloadAndValidateAudioFile({
      sourceUrl: 'https://audio.test/PHM/1.mp3',
      runDownload: async () => {
        throw new Error('connection reset');
      },
      getFileSize: async () => VALID_BYTES,
      deleteFile: async () => {
        deletes += 1;
      },
    }),
    /connection reset/
  );

  assert.equal(deletes, 1);
});

test('a cancelled transfer is rethrown without touching the destination file', async () => {
  let deletes = 0;

  await assert.rejects(
    downloadAndValidateAudioFile({
      sourceUrl: 'https://audio.test/PHM/1.mp3',
      runDownload: async () => {
        throw new AudioDownloadCancelledError();
      },
      getFileSize: async () => VALID_BYTES,
      deleteFile: async () => {
        deletes += 1;
      },
    }),
    AudioDownloadCancelledError
  );

  assert.equal(deletes, 0);
});

// ---------------------------------------------------------------------------
// Book downloads: failures
// ---------------------------------------------------------------------------

test('a chapter the source has no audio for fails the book job', async () => {
  const { fileSystem, downloads } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      hooks: recorder.hooks,
      resolveRemoteAudio: async () => null,
    }),
    /Audio is not available for PHM 1/
  );

  assert.deepEqual(downloads, []);
  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'failed');
  assert.equal(jobs.get(PHM_JOB_ID)?.error, 'Audio is not available for PHM 1');
  assert.deepEqual(recorder.events, [`start:${PHM_JOB_ID}`, `failure:${PHM_JOB_ID}`]);
});

test('a resolver that rejects with a bare value still fails the job with a readable error', async () => {
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      hooks: recorder.hooks,
      resolveRemoteAudio: () => Promise.reject('catalog offline'),
    }),
    (error: unknown) => error instanceof Error && error.message === 'catalog offline'
  );

  assert.equal(jobs.get(PHM_JOB_ID)?.error, 'catalog offline');
  assert.equal(recorder.failures[0]?.message, 'catalog offline');
});

test('a directory failure reported as a bare value is recorded as an error on the job', async () => {
  const { fileSystem } = sizedFileSystem();
  fileSystem.ensureDirectory = () => Promise.reject('EACCES');
  const { jobs, store } = memoryJobStore();

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolvePhm,
    }),
    (error: unknown) => error instanceof Error && error.message === 'EACCES'
  );

  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'failed');
});

test('a transport that keeps throwing bare values is retried, then fails with that value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  let attempts = 0;
  fileSystem.downloadFile = () => {
    attempts += 1;
    return Promise.reject('socket hang up');
  };

  const rejected = assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolvePhm,
    }),
    (error: unknown) => error instanceof Error && error.message === 'socket hang up'
  );
  await flush();
  t.mock.timers.tick(1_000);
  await flush();
  t.mock.timers.tick(2_000);
  await rejected;

  assert.equal(attempts, 3);
  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'failed');
});

// ---------------------------------------------------------------------------
// Book downloads: cancellation
// ---------------------------------------------------------------------------

test('cancelling during the retry backoff stops without another attempt or a failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();
  let attempts = 0;
  fileSystem.downloadFile = async () => {
    attempts += 1;
    throw new Error('HTTP 503');
  };

  const rejected = assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      hooks: recorder.hooks,
      resolveRemoteAudio: resolvePhm,
    }),
    AudioDownloadCancelledError
  );
  await flush();
  assert.equal(attempts, 1);
  requestAudioDownloadCancellation(PHM_JOB_ID);
  t.mock.timers.tick(10_000);
  await rejected;

  assert.equal(attempts, 1);
  assert.equal(jobs.has(PHM_JOB_ID), false);
  assert.deepEqual(recorder.failures, []);
});

test('a download the caller already cancelled never resolves or fetches a chapter', async () => {
  const { fileSystem, downloads } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const controller = new AbortController();
  controller.abort();
  let resolved = 0;

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      signal: controller.signal,
      resolveRemoteAudio: async (...args) => {
        resolved += 1;
        return resolvePhm(...args);
      },
    }),
    AudioDownloadCancelledError
  );

  assert.equal(resolved, 0);
  assert.deepEqual(downloads, []);
  assert.equal(jobs.size, 0);
});

test('an abort that lands while a finished chapter is being verified cancels the book', async () => {
  const { fileSystem, files } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();
  const controller = new AbortController();
  let sizeReads = 0;
  fileSystem.getFileSize = async (uri) => {
    sizeReads += 1;
    // The first read is the cached-file check; the second is post-download verification.
    if (sizeReads === 2) controller.abort();
    return files.get(uri) ?? null;
  };

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      signal: controller.signal,
      hooks: recorder.hooks,
      resolveRemoteAudio: resolvePhm,
    }),
    AudioDownloadCancelledError
  );

  assert.equal(recorder.progress.includes(100), false);
  assert.deepEqual(recorder.failures, []);
  assert.equal(jobs.size, 0);
});

test('cancelling as the last chapter completes reports a cancellation, not a completed book', async () => {
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const controller = new AbortController();
  const events: string[] = [];

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: store,
      signal: controller.signal,
      resolveRemoteAudio: resolvePhm,
      hooks: {
        onProgress: (event) => {
          if (event.progress === 100) controller.abort();
        },
        onComplete: (job) => events.push(`complete:${job.id}`),
        onFailure: (job) => events.push(`failure:${job.id}`),
      },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(events, []);
  assert.equal(jobs.size, 0);
});

// ---------------------------------------------------------------------------
// Book downloads: stalls, progress and validation
// ---------------------------------------------------------------------------

test('a verification that outlasts the inactivity deadline counts as a stall and is retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { fileSystem, files } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const slowVerification = deferred<number>();
  let attempts = 0;
  let sizeReads = 0;
  fileSystem.downloadFile = async (_from, to) => {
    attempts += 1;
    files.set(to, VALID_BYTES);
  };
  fileSystem.getFileSize = async (uri) => {
    sizeReads += 1;
    if (sizeReads === 1) return null;
    if (sizeReads === 2) return slowVerification.promise;
    return files.get(uri) ?? null;
  };

  const result = downloadAudioBook({
    translationId: 'bsb',
    book: book('PHM'),
    fileSystem,
    jobStore: store,
    resolveRemoteAudio: resolvePhm,
  });
  await flush();
  assert.equal(attempts, 1);
  t.mock.timers.tick(60_000);
  slowVerification.resolve(VALID_BYTES);
  await flush();
  t.mock.timers.tick(1_000);
  await flush();

  assert.deepEqual(await result, { bookId: 'PHM', chapterCount: 1 });
  assert.equal(attempts, 2);
  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'completed');
});

test('progress without a usable byte total is reported as zero percent, never NaN', async () => {
  const { fileSystem, files } = sizedFileSystem();
  const recorder = recordingHooks();
  const { store } = memoryJobStore();
  fileSystem.downloadFile = async (_from, to, options) => {
    options?.onProgress?.({ bytesDownloaded: Number.NaN, bytesTotal: 100 });
    options?.onProgress?.({ bytesDownloaded: 512, bytesTotal: 0 });
    files.set(to, VALID_BYTES);
  };

  await downloadAudioBook({
    translationId: 'bsb',
    book: book('PHM'),
    fileSystem,
    jobStore: store,
    hooks: recorder.hooks,
    resolveRemoteAudio: resolvePhm,
  });

  assert.deepEqual(recorder.progress, [0, 100]);
});

test('a checksum is not required when the file system cannot read chunks back', async () => {
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();

  await downloadAudioBook({
    translationId: 'bsb',
    book: book('PHM'),
    fileSystem,
    jobStore: store,
    resolveRemoteAudio: async () => ({
      url: 'https://audio.test/PHM/1.mp3',
      duration: 10,
      bytes: VALID_BYTES,
      sha256: 'ab'.repeat(32),
    }),
  });

  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'completed');
});

test('a volume that cannot report its free space never blocks a download', async () => {
  for (const getFreeDiskBytes of [
    async () => {
      throw new Error('statfs unsupported');
    },
    async () => null,
    async () => Number.NaN,
  ]) {
    const { fileSystem, downloads } = sizedFileSystem();
    fileSystem.getFreeDiskBytes = getFreeDiskBytes;

    await downloadAudioBook({
      translationId: 'bsb',
      book: book('PHM'),
      fileSystem,
      jobStore: memoryJobStore().store,
      resolveRemoteAudio: resolvePhm,
    });

    assert.equal(downloads.length, 1);
  }
});

const CHAPTER_ESTIMATE_WITH_HEADROOM = AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES * 1.05;

/** A device with room for the pre-flight check that fills up once the transfers start. */
function fillingFileSystem(freeAfterFull: number | null) {
  const { fileSystem, downloads } = sizedFileSystem();
  let spaceChecks = 0;
  fileSystem.getFreeDiskBytes = async () => {
    spaceChecks += 1;
    return spaceChecks === 1 ? 10 * 1024 ** 3 : freeAfterFull;
  };
  fileSystem.downloadFile = async (from, to, options) => {
    downloads.push({ from, to, options });
    throw new Error('java.io.IOException: write failed: ENOSPC (No space left on device)');
  };
  return { fileSystem, downloads };
}

test('running out of space mid-download fails with the not-enough-space error, not a generic one', async () => {
  const { fileSystem, downloads } = fillingFileSystem(100 * 1024);
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();

  const error = await downloadAudioBook({
    translationId: 'bsb',
    book: book('RUT'),
    fileSystem,
    jobStore: store,
    hooks: recorder.hooks,
    resolveRemoteAudio: resolvePhm,
  }).then(
    () => assert.fail('the download should fail'),
    (failure: unknown) => failure
  );

  assert.ok(error instanceof AudioDownloadInsufficientSpaceError);
  assert.equal(error.freeBytes, 100 * 1024);
  assert.equal(error.requiredBytes, Math.ceil(4 * CHAPTER_ESTIMATE_WITH_HEADROOM));
  assert.equal(downloads.length, 4, 'a full disk is not retried');
  assert.equal(jobs.get('audio-download:bsb:book:RUT')?.status, 'failed');
  assert.deepEqual(recorder.failures, [error]);
});

test('a full device that cannot report its free space still gets the not-enough-space error', async () => {
  const { fileSystem } = fillingFileSystem(null);

  const error = await downloadAudioBook({
    translationId: 'bsb',
    book: book('PHM'),
    fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolvePhm,
  }).then(
    () => assert.fail('the download should fail'),
    (failure: unknown) => failure
  );

  assert.ok(error instanceof AudioDownloadInsufficientSpaceError);
  assert.equal(error.freeBytes, 0);
  assert.ok(error.requiredBytes > error.freeBytes);
});

test('a translation that runs out of space reports the room its remaining chapters need', async () => {
  const { fileSystem } = fillingFileSystem(100 * 1024);
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();

  const error = await downloadAudioTranslation({
    translationId: 'bsb',
    books: [book('RUT'), book('PHM')],
    fileSystem,
    jobStore: store,
    hooks: recorder.hooks,
    resolveRemoteAudio: resolvePhm,
  }).then(
    () => assert.fail('the download should fail'),
    (failure: unknown) => failure
  );

  assert.ok(error instanceof AudioDownloadInsufficientSpaceError);
  assert.equal(error.freeBytes, 100 * 1024);
  assert.equal(error.requiredBytes, Math.ceil(5 * CHAPTER_ESTIMATE_WITH_HEADROOM));
  assert.equal(jobs.get(TRANSLATION_JOB_ID)?.status, 'failed');
  assert.deepEqual(recorder.failures, [error]);
});

// ---------------------------------------------------------------------------
// Translation downloads
// ---------------------------------------------------------------------------

test('a translation download with no books completes without a space check or any transfer', async () => {
  const { fileSystem, downloads } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const recorder = recordingHooks();
  let spaceChecks = 0;
  fileSystem.getFreeDiskBytes = async () => {
    spaceChecks += 1;
    return 0;
  };

  const result = await downloadAudioTranslation({
    translationId: 'bsb',
    books: [],
    fileSystem,
    jobStore: store,
    hooks: recorder.hooks,
    resolveRemoteAudio: resolvePhm,
  });

  assert.deepEqual(result, { downloadedBookIds: [] });
  assert.equal(spaceChecks, 0);
  assert.deepEqual(downloads, []);
  assert.equal(jobs.get(TRANSLATION_JOB_ID)?.status, 'completed');
  assert.deepEqual(recorder.events, [
    `start:${TRANSLATION_JOB_ID}`,
    `complete:${TRANSLATION_JOB_ID}`,
  ]);
});

test('translation progress only fires when the aggregate across books actually changes', async () => {
  const { fileSystem, files } = sizedFileSystem();
  const events: Array<{ progress: number; completedChapters: number; jobId: string }> = [];
  fileSystem.downloadFile = async (_from, to, options) => {
    options?.onProgress?.({ bytesDownloaded: 50, bytesTotal: 100 });
    options?.onProgress?.({ bytesDownloaded: 90, bytesTotal: 100 });
    files.set(to, VALID_BYTES);
  };

  await downloadAudioTranslation({
    translationId: 'bsb',
    books: [book('PHM')],
    fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolvePhm,
    hooks: {
      onProgress: ({ progress, completedChapters, jobId }) =>
        events.push({ progress, completedChapters, jobId }),
    },
  });

  assert.deepEqual(events, [
    { progress: 0, completedChapters: 0, jobId: TRANSLATION_JOB_ID },
    { progress: 100, completedChapters: 1, jobId: TRANSLATION_JOB_ID },
  ]);
});

test('cancelling a translation as its last book completes reports a cancellation', async () => {
  const { fileSystem } = sizedFileSystem();
  const { jobs, store } = memoryJobStore();
  const events: string[] = [];

  await assert.rejects(
    downloadAudioTranslation({
      translationId: 'bsb',
      books: [book('PHM')],
      fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolvePhm,
      hooks: {
        onBookComplete: () => requestAudioDownloadCancellation(TRANSLATION_JOB_ID),
        onComplete: (job) => events.push(`complete:${job.id}`),
        onFailure: (job) => events.push(`failure:${job.id}`),
      },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(events, []);
  assert.equal(jobs.has(TRANSLATION_JOB_ID), false);
  assert.equal(jobs.get(PHM_JOB_ID)?.status, 'completed');
});
