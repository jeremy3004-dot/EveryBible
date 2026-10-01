import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById, type BibleBook } from '../../../constants/books';
import { AudioDownloadInsufficientSpaceError } from '../audioDownloadErrorMessage';
import {
  requestAudioDownloadCancellation,
  runAudioDownloadCancellationCleanup,
  waitForAudioDownloadCancellationCleanup,
} from './activeDownloads';
import { getChapterAudioFileUri } from './audioFileLocations';
import { AudioDownloadCancelledError } from './errors';
import { AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES } from './freeSpace';
import { downloadAudioBook, downloadAudioTranslation } from './orchestrator';
import type {
  AudioDownloadBookProgress,
  AudioDownloadJobRecord,
  AudioDownloadJobStore,
  AudioFileSystemAdapter,
  ResolveRemoteAudio,
} from './types';

// Book and collection downloads driven through injected doubles (file system, job store,
// remote lookup), so no module mocks are needed. Each test uses its own translation id: the
// orchestrator keeps per-translation run queues and per-book leases in module state.

const ROOT_URI = 'file:///orchestrator-test/';
const CHAPTER_BYTES = 4_096;
// What the not-enough-space error asks for per missing chapter: the estimate plus 5% headroom.
const CHAPTER_ESTIMATE_WITH_HEADROOM = AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES * 1.05;

type TransferOptions = NonNullable<Parameters<AudioFileSystemAdapter['downloadFile']>[2]>;

function book(id: string): BibleBook {
  const found = getBookById(id);
  assert.ok(found, `unknown book ${id}`);
  return found;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

// Every collaborator here is an in-memory double with no lazy import or timer on the paths these
// tests take, so one macrotask turn lets every unblocked download chain run to its next wait.
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function outOfSpace(): Error {
  return Object.assign(new Error('write failed: ENOSPC (No space left on device)'), {
    code: 'ENOSPC',
  });
}

function memoryJobStore(onUpsert: (job: AudioDownloadJobRecord) => void = () => {}) {
  const jobs = new Map<string, AudioDownloadJobRecord>();
  const writes: Array<Pick<AudioDownloadJobRecord, 'id' | 'status'>> = [];
  const store: AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (id) => jobs.get(id) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
      writes.push({ id: job.id, status: job.status });
      onUpsert(job);
    },
    removeJob: async (id) => {
      jobs.delete(id);
    },
  };
  return { jobs, writes, store };
}

interface DiskOptions {
  /** Verified-size receipts need text files. */
  receipts?: boolean;
  /** Checksum verification needs chunked reads. */
  hashing?: boolean;
  freeDiskBytes?: () => number;
  onTransfer?: (options: TransferOptions) => Promise<void> | void;
  onSizeRead?: (fileUri: string) => void;
}

/** Files map uri -> byte count; a finished transfer writes CHAPTER_BYTES. */
function createDisk({
  receipts = true,
  hashing = false,
  freeDiskBytes,
  onTransfer,
  onSizeRead,
}: DiskOptions = {}) {
  const files = new Map<string, number>();
  const texts = new Map<string, string>();
  const transfers: string[] = [];
  const chunkReads: string[] = [];
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async (uri) => files.has(uri),
    getFileSize: async (uri) => {
      onSizeRead?.(uri);
      return files.get(uri) ?? null;
    },
    deleteFile: async (uri) => {
      files.delete(uri);
    },
    downloadFile: async (_from, to, options) => {
      assert.ok(options);
      transfers.push(`${options.bookId}:${options.chapter}`);
      await onTransfer?.(options);
      files.set(to, CHAPTER_BYTES);
    },
  };
  if (receipts) {
    fileSystem.readTextFile = async (uri) => texts.get(uri) ?? null;
    fileSystem.writeTextFile = async (uri, contents) => {
      texts.set(uri, contents);
    };
  }
  if (hashing) {
    fileSystem.readBase64Chunk = async (uri) => {
      chunkReads.push(uri);
      return null;
    };
  }
  if (freeDiskBytes) {
    fileSystem.getFreeDiskBytes = async () => freeDiskBytes();
  }
  return { files, transfers, chunkReads, fileSystem };
}

const resolveWithSize: ResolveRemoteAudio = async (_translationId, bookId, chapter) => ({
  url: `https://audio.test/${bookId}/${chapter}.mp3`,
  duration: 10,
  bytes: CHAPTER_BYTES,
});

const chapterUri = (translationId: string, bookId: string, chapter: number) =>
  getChapterAudioFileUri(translationId, bookId, chapter, ROOT_URI);

const progressOf = (events: AudioDownloadBookProgress[]) =>
  events.map(({ chapter, progress, completedChapters, totalChapters }) => ({
    chapter,
    progress,
    completedChapters,
    totalChapters,
  }));

const chapterCompletions = (bookChapters: number) =>
  Array.from({ length: bookChapters }, (_, index) => ({
    chapter: index + 1,
    progress: Math.round(((index + 1) * 100) / bookChapters),
    completedChapters: index + 1,
    totalChapters: bookChapters,
  }));

// ---------------------------------------------------------------------------
// Book progress
// ---------------------------------------------------------------------------

test('book progress averages every chapter, counting chapters not yet transferring as 0%', async () => {
  const translationId = 'progress-average';
  const disk = createDisk({
    onTransfer: (options) => {
      if (options.chapter !== 1) return;
      options.onProgress?.({ bytesDownloaded: 12, bytesTotal: 100 });
      options.onProgress?.({ bytesDownloaded: 100, bytesTotal: 100 });
    },
  });
  const events: AudioDownloadBookProgress[] = [];

  await downloadAudioBook({
    translationId,
    rootUri: ROOT_URI,
    book: book('JAS'),
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
    hooks: { onProgress: (event) => events.push(event) },
  });

  assert.deepEqual(progressOf(events), [
    // 12% of one chapter out of five; chapter 5 has not started (four chapters run at once).
    { chapter: 1, progress: 2, completedChapters: 0, totalChapters: 5 },
    // Every byte received, but a transfer holds at 99% until it is verified.
    { chapter: 1, progress: 20, completedChapters: 0, totalChapters: 5 },
    // Same percentage, one more finished chapter: still reported.
    { chapter: 1, progress: 20, completedChapters: 1, totalChapters: 5 },
    { chapter: 2, progress: 40, completedChapters: 2, totalChapters: 5 },
    { chapter: 3, progress: 60, completedChapters: 3, totalChapters: 5 },
    { chapter: 4, progress: 80, completedChapters: 4, totalChapters: 5 },
    { chapter: 5, progress: 100, completedChapters: 5, totalChapters: 5 },
  ]);
  assert.ok(events.every((event) => event.jobId === `audio-download:${translationId}:book:JAS`));
});

test('a resumed book reports each chapter its receipts prove, without transferring it again', async () => {
  const translationId = 'progress-receipts';
  const disk = createDisk();
  const options = {
    translationId,
    rootUri: ROOT_URI,
    book: book('JAS'),
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
  };
  await downloadAudioBook(options);
  const events: AudioDownloadBookProgress[] = [];

  await downloadAudioBook({ ...options, hooks: { onProgress: (event) => events.push(event) } });

  assert.equal(disk.transfers.length, 5, 'only the first run transfers chapters');
  assert.deepEqual(progressOf(events), chapterCompletions(5));
});

test('cached chapters without receipts are accepted on their published size and reported once as unverified', async () => {
  const translationId = 'progress-size-proof';
  const disk = createDisk();
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    disk.files.set(chapterUri(translationId, 'JAS', chapter), CHAPTER_BYTES);
  }
  const events: AudioDownloadBookProgress[] = [];
  const unverified: Array<{ translationId: string; bookId: string }> = [];

  await downloadAudioBook({
    translationId,
    rootUri: ROOT_URI,
    book: book('JAS'),
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
    hooks: {
      onProgress: (event) => events.push(event),
      onUnverifiedCache: (event) => unverified.push(event),
    },
  });

  assert.deepEqual(disk.transfers, []);
  assert.deepEqual(progressOf(events), chapterCompletions(5));
  assert.deepEqual(unverified, [{ translationId, bookId: 'JAS' }]);
});

test('a cached chapter without a receipt is downloaded again when the source publishes neither size nor checksum', async () => {
  const translationId = 'cache-no-proof';
  // The adapter could hash a file, but there is no published checksum to compare it with.
  const disk = createDisk({ hashing: true });
  disk.files.set(chapterUri(translationId, 'PHM', 1), CHAPTER_BYTES);

  await downloadAudioBook({
    translationId,
    rootUri: ROOT_URI,
    book: book('PHM'),
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: async () => ({ url: 'https://audio.test/PHM/1.mp3', duration: 10 }),
  });

  assert.deepEqual(disk.transfers, ['PHM:1']);
});

// ---------------------------------------------------------------------------
// Book cancellation
// ---------------------------------------------------------------------------

test('a book download cancelled during its free-space check never starts a job', async () => {
  const controller = new AbortController();
  const disk = createDisk({
    freeDiskBytes: () => {
      controller.abort();
      return 10 * 1024 ** 3;
    },
  });
  const { writes, store } = memoryJobStore();
  const started: string[] = [];

  await assert.rejects(
    downloadAudioBook({
      translationId: 'cancel-preflight-book',
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: disk.fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onStart: (job) => started.push(job.id) },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(started, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(disk.transfers, []);
});

test('a book download cancelled as its job starts transfers nothing and leaves no job', async () => {
  const controller = new AbortController();
  const disk = createDisk();
  const { jobs, store } = memoryJobStore();

  await assert.rejects(
    downloadAudioBook({
      translationId: 'cancel-on-start-book',
      rootUri: ROOT_URI,
      book: book('TIT'),
      fileSystem: disk.fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onStart: () => controller.abort() },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(disk.transfers, []);
  assert.equal(jobs.size, 0);
});

test('a book download cancelled while a chapter file is checked reports nothing further', async () => {
  const controller = new AbortController();
  const disk = createDisk({ onSizeRead: () => controller.abort() });
  const unverified: string[] = [];

  await assert.rejects(
    downloadAudioBook({
      translationId: 'cancel-size-check',
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: disk.fileSystem,
      jobStore: memoryJobStore().store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onUnverifiedCache: ({ bookId }) => unverified.push(bookId) },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(unverified, []);
  assert.deepEqual(disk.transfers, []);
});

test('a resumed download cancelled while a receipt is checked reports no more progress', async () => {
  const translationId = 'cancel-receipt-check';
  let controller = new AbortController();
  let sizeReads = 0;
  let armed = false;
  const disk = createDisk({
    onSizeRead: () => {
      sizeReads += 1;
      // The first read finds the file; the second compares it with its receipt.
      if (armed && sizeReads === 2) controller.abort();
    },
  });
  const { jobs, store } = memoryJobStore();
  const options = {
    translationId,
    rootUri: ROOT_URI,
    book: book('PHM'),
    fileSystem: disk.fileSystem,
    jobStore: store,
    resolveRemoteAudio: resolveWithSize,
  };
  await downloadAudioBook(options);
  controller = new AbortController();
  sizeReads = 0;
  armed = true;
  const events: AudioDownloadBookProgress[] = [];

  await assert.rejects(
    downloadAudioBook({
      ...options,
      signal: controller.signal,
      hooks: { onProgress: (event) => events.push(event) },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(events, []);
  assert.equal(jobs.has(`audio-download:${translationId}:book:PHM`), false);
});

test('cancelling from the unverified-cache report stops the download before the chapter lookup', async () => {
  const translationId = 'cancel-on-unverified';
  const controller = new AbortController();
  const disk = createDisk();
  const { jobs, store } = memoryJobStore();
  const failures: Error[] = [];
  let lookups = 0;

  await assert.rejects(
    downloadAudioBook({
      translationId,
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: disk.fileSystem,
      jobStore: store,
      // Offline: the lookup would fail, which must not turn the cancel into a failure.
      resolveRemoteAudio: async () => {
        lookups += 1;
        return null;
      },
      signal: controller.signal,
      hooks: {
        onUnverifiedCache: () => controller.abort(),
        onFailure: (_job, error) => failures.push(error),
      },
    }),
    AudioDownloadCancelledError
  );

  assert.equal(lookups, 0);
  assert.deepEqual(failures, []);
  assert.equal(jobs.size, 0);
});

test('a download cancelled during a cached chapter lookup does not go on to hash that chapter', async () => {
  const translationId = 'cancel-during-lookup';
  const controller = new AbortController();
  const disk = createDisk({ hashing: true });
  disk.files.set(chapterUri(translationId, 'PHM', 1), CHAPTER_BYTES);

  await assert.rejects(
    downloadAudioBook({
      translationId,
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: disk.fileSystem,
      jobStore: memoryJobStore().store,
      resolveRemoteAudio: async () => {
        controller.abort();
        return {
          url: 'https://audio.test/PHM/1.mp3',
          duration: 10,
          bytes: CHAPTER_BYTES,
          sha256: 'a'.repeat(64),
        };
      },
      signal: controller.signal,
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(disk.chunkReads, []);
  assert.deepEqual(disk.transfers, []);
});

test('a transfer that returns after its download was cancelled is not verified', async () => {
  const controller = new AbortController();
  // The cancel arrives as the transfer finishes writing.
  const disk = createDisk({ hashing: true, onTransfer: () => controller.abort() });

  await assert.rejects(
    downloadAudioBook({
      translationId: 'cancel-after-transfer',
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: disk.fileSystem,
      jobStore: memoryJobStore().store,
      resolveRemoteAudio: async () => ({
        url: 'https://audio.test/PHM/1.mp3',
        duration: 10,
        bytes: CHAPTER_BYTES,
        sha256: 'a'.repeat(64),
      }),
      signal: controller.signal,
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(disk.transfers, ['PHM:1']);
  assert.deepEqual(disk.chunkReads, []);
});

test('a cancel that lands as the last chapter finishes never records the job as completed', async () => {
  const translationId = 'cancel-last-chapter';
  const controller = new AbortController();
  const { jobs, writes, store } = memoryJobStore();
  const completed: string[] = [];

  await assert.rejects(
    downloadAudioBook({
      translationId,
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: createDisk().fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: {
        onProgress: (event) => {
          if (event.completedChapters === event.totalChapters) controller.abort();
        },
        onComplete: (job) => completed.push(job.id),
      },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(writes, [
    { id: `audio-download:${translationId}:book:PHM`, status: 'downloading' },
  ]);
  assert.equal(jobs.size, 0);
  assert.deepEqual(completed, []);
});

test('a cancel that lands while the job is marked completed still ends the download as cancelled', async () => {
  const controller = new AbortController();
  const { jobs, store } = memoryJobStore((job) => {
    if (job.status === 'completed') controller.abort();
  });
  const completed: string[] = [];

  await assert.rejects(
    downloadAudioBook({
      translationId: 'cancel-while-completing',
      rootUri: ROOT_URI,
      book: book('PHM'),
      fileSystem: createDisk().fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onComplete: (job) => completed.push(job.id) },
    }),
    AudioDownloadCancelledError
  );

  assert.equal(jobs.size, 0);
  assert.deepEqual(completed, []);
});

// ---------------------------------------------------------------------------
// Running out of space
// ---------------------------------------------------------------------------

test('a book that runs out of space mid-way asks for room for only its unfinished chapters', async () => {
  const twoChaptersDone = deferred();
  // No free-space reading: the pre-flight is skipped and the error reports 0 bytes free.
  const disk = createDisk({
    onTransfer: async (options) => {
      if (options.chapter !== 3) return;
      await twoChaptersDone.promise;
      throw outOfSpace();
    },
  });

  const error = await downloadAudioBook({
    translationId: 'space-mid-book',
    rootUri: ROOT_URI,
    book: book('TIT'),
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
    hooks: {
      onProgress: (event) => {
        if (event.completedChapters === 2) twoChaptersDone.resolve();
      },
    },
  }).then(
    () => assert.fail('the download should fail'),
    (failure: unknown) => failure
  );

  assert.ok(error instanceof AudioDownloadInsufficientSpaceError);
  assert.equal(error.freeBytes, 0);
  assert.equal(error.requiredBytes, Math.ceil(1 * CHAPTER_ESTIMATE_WITH_HEADROOM));
});

test('a collection that runs out of space asks for room for every chapter it has not finished', async () => {
  const translationId = 'space-mid-collection';
  const judeFailed = deferred();
  const { store } = memoryJobStore((job) => {
    if (job.id === `audio-download:${translationId}:book:JUD` && job.status === 'failed') {
      judeFailed.resolve();
    }
  });
  const disk = createDisk({
    onTransfer: async (options) => {
      if (options.bookId === 'JUD') throw outOfSpace();
      // Philemon finishes after Jude has failed, so 3 John is never started.
      if (options.bookId === 'PHM') await judeFailed.promise;
    },
  });

  const error = await downloadAudioTranslation({
    translationId,
    rootUri: ROOT_URI,
    books: [book('JUD'), book('PHM'), book('3JN')],
    fileSystem: disk.fileSystem,
    jobStore: store,
    resolveRemoteAudio: resolveWithSize,
  }).then(
    () => assert.fail('the download should fail'),
    (failure: unknown) => failure
  );

  assert.deepEqual(disk.transfers.sort(), ['JUD:1', 'PHM:1']);
  assert.ok(error instanceof AudioDownloadInsufficientSpaceError);
  // Jude and 3 John are still missing; Philemon is done.
  assert.equal(error.requiredBytes, Math.ceil(2 * CHAPTER_ESTIMATE_WITH_HEADROOM));
});

test('a collection checks free space once up front, not again before each book', async () => {
  let spaceChecks = 0;
  const disk = createDisk({
    // Enough for the whole collection when it starts; a later reading would refuse a book.
    freeDiskBytes: () => (++spaceChecks === 1 ? 10 * 1024 ** 3 : 0),
  });

  const result = await downloadAudioTranslation({
    translationId: 'space-checked-once',
    rootUri: ROOT_URI,
    books: [book('PHM'), book('JUD')],
    fileSystem: disk.fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
  });

  assert.deepEqual(result.downloadedBookIds.sort(), ['JUD', 'PHM']);
});

// ---------------------------------------------------------------------------
// Collection progress and cancellation
// ---------------------------------------------------------------------------

test('collection progress reports every finished chapter even when the rounded percentage holds', async () => {
  const events: AudioDownloadBookProgress[] = [];

  await downloadAudioTranslation({
    translationId: 'collection-progress',
    rootUri: ROOT_URI,
    books: [book('PSA')],
    fileSystem: createDisk({ receipts: false }).fileSystem,
    jobStore: memoryJobStore().store,
    resolveRemoteAudio: resolveWithSize,
    hooks: { onProgress: (event) => events.push(event) },
  });

  // 150 chapters: 1 and 2 finished both round to 1%.
  assert.deepEqual(
    events.map(({ progress, completedChapters }) => ({ progress, completedChapters })),
    chapterCompletions(150).map(({ progress, completedChapters }) => ({
      progress,
      completedChapters,
    }))
  );
});

test('a collection cancelled during its free-space check never starts a job', async () => {
  const controller = new AbortController();
  const disk = createDisk({
    freeDiskBytes: () => {
      controller.abort();
      return 10 * 1024 ** 3;
    },
  });
  const { writes, store } = memoryJobStore();
  const started: string[] = [];

  await assert.rejects(
    downloadAudioTranslation({
      translationId: 'cancel-preflight-collection',
      rootUri: ROOT_URI,
      books: [book('PHM')],
      fileSystem: disk.fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onStart: (job) => started.push(job.id) },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(started, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(disk.transfers, []);
});

test('a collection cancelled as its job starts transfers nothing and leaves no job', async () => {
  const controller = new AbortController();
  const disk = createDisk();
  const { jobs, store } = memoryJobStore();

  await assert.rejects(
    downloadAudioTranslation({
      translationId: 'cancel-on-start-collection',
      rootUri: ROOT_URI,
      books: [book('PHM'), book('JUD')],
      fileSystem: disk.fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: {
        onStart: (job) => {
          if (job.scope === 'translation') controller.abort();
        },
      },
    }),
    AudioDownloadCancelledError
  );

  assert.deepEqual(disk.transfers, []);
  assert.equal(jobs.size, 0);
});

test("aborting a collection's own signal mid-transfer cancels the collection", async () => {
  const controller = new AbortController();
  const disk = createDisk({
    onTransfer: (options) => {
      controller.abort();
      // A transport settles once its native writer has stopped.
      if (options.signal?.aborted) throw new AudioDownloadCancelledError();
    },
  });
  const { jobs, store } = memoryJobStore();
  const completed: string[] = [];

  await assert.rejects(
    downloadAudioTranslation({
      translationId: 'cancel-mid-collection',
      rootUri: ROOT_URI,
      books: [book('PHM')],
      fileSystem: disk.fileSystem,
      jobStore: store,
      resolveRemoteAudio: resolveWithSize,
      signal: controller.signal,
      hooks: { onComplete: (job) => completed.push(job.id) },
    }),
    AudioDownloadCancelledError
  );

  assert.equal(jobs.size, 0);
  assert.deepEqual(completed, []);
});

test('a collection cancelled while a UI cancel cleanup is pending leaves its record to that cleanup', async () => {
  const translationId = 'cancel-with-cleanup';
  const jobId = `audio-download:${translationId}:translation:all`;
  const cleanupMayFinish = deferred();
  const disk = createDisk({
    onTransfer: (options) => {
      // What the UI's Cancel does: queue its cleanup tail, then stop the writers.
      runAudioDownloadCancellationCleanup(jobId, () => cleanupMayFinish.promise);
      requestAudioDownloadCancellation(jobId);
      if (options.signal?.aborted) throw new AudioDownloadCancelledError();
    },
  });
  const { jobs, store } = memoryJobStore();
  const failures: Error[] = [];

  try {
    await assert.rejects(
      downloadAudioTranslation({
        translationId,
        rootUri: ROOT_URI,
        books: [book('PHM')],
        fileSystem: disk.fileSystem,
        jobStore: store,
        resolveRemoteAudio: resolveWithSize,
        hooks: { onFailure: (_job, error) => failures.push(error) },
      }),
      AudioDownloadCancelledError
    );

    assert.deepEqual(failures, []);
    assert.equal(jobs.get(jobId)?.status, 'downloading');
  } finally {
    cleanupMayFinish.resolve();
    await waitForAudioDownloadCancellationCleanup(jobId);
  }
});

// ---------------------------------------------------------------------------
// Overlapping collection runs of one translation
// ---------------------------------------------------------------------------

/** Collection runs of one translation whose transfers wait until the test lets each book through. */
function queuedRuns(translationId: string) {
  const started: string[] = [];
  const startedEvents = new Map<string, ReturnType<typeof deferred<void>>>();
  const gates = new Map<string, ReturnType<typeof deferred<void>>>();
  // Once a test ends every gate opens, including ones a still-queued run reaches later.
  let allOpen = false;
  const gate = (bookId: string) => {
    const existing = gates.get(bookId) ?? deferred();
    gates.set(bookId, existing);
    if (allOpen) existing.resolve();
    return existing;
  };
  const startedEvent = (bookId: string) => {
    const existing = startedEvents.get(bookId) ?? deferred();
    startedEvents.set(bookId, existing);
    return existing;
  };
  const disk = createDisk({
    receipts: false,
    onTransfer: async (options) => {
      const bookId = String(options.bookId);
      started.push(bookId);
      startedEvent(bookId).resolve();
      await gate(bookId).promise;
    },
  });
  const jobStore = memoryJobStore().store;
  const run = (bookId: string, signal?: AbortSignal) =>
    downloadAudioTranslation({
      translationId,
      rootUri: ROOT_URI,
      books: [book(bookId)],
      fileSystem: disk.fileSystem,
      jobStore,
      resolveRemoteAudio: resolveWithSize,
      signal,
    });
  const settled = (promise: Promise<unknown>) => {
    const outcome: { done: boolean; error?: unknown } = { done: false };
    promise.then(
      () => {
        outcome.done = true;
      },
      (error: unknown) => {
        outcome.done = true;
        outcome.error = error;
      }
    );
    return outcome;
  };
  const releaseAll = () => {
    allOpen = true;
    gates.forEach((entry) => entry.resolve());
  };
  return {
    started,
    run,
    settled,
    releaseAll,
    release: (bookId: string) => gate(bookId).resolve(),
    whenStarted: (bookId: string) => startedEvent(bookId).promise,
  };
}

test('a queued collection with a live signal waits for the running one, then completes', async (t) => {
  const runs = queuedRuns('queue-live-signal');
  t.after(runs.releaseAll);
  const first = runs.run('PHM');
  await runs.whenStarted('PHM');

  const second = runs.run('JUD', new AbortController().signal);
  await nextTurn();
  assert.deepEqual(runs.started, ['PHM']);

  runs.release('PHM');
  runs.release('JUD');
  await Promise.all([first, second]);
  assert.deepEqual(runs.started, ['PHM', 'JUD']);
});

test('aborting a queued collection cancels it at once, and the run behind it still proceeds', async (t) => {
  const runs = queuedRuns('queue-abort-waiting');
  t.after(runs.releaseAll);
  const first = runs.run('PHM');
  await runs.whenStarted('PHM');
  const controller = new AbortController();
  const second = runs.settled(runs.run('JUD', controller.signal));
  const third = runs.run('3JN');
  const thirdOutcome = runs.settled(third);

  controller.abort();
  await nextTurn();
  assert.equal(second.done, true, 'the aborted run must not wait for the running one');
  assert.ok(second.error instanceof AudioDownloadCancelledError);

  runs.release('PHM');
  runs.release('3JN');
  await first;
  await nextTurn();
  assert.equal(thirdOutcome.done, true, 'the cancelled run must give up its place in the queue');
  await third;
  assert.deepEqual(runs.started, ['PHM', '3JN']);
});

test('a queued collection whose signal is already aborted is cancelled without waiting', async (t) => {
  const runs = queuedRuns('queue-already-aborted');
  t.after(runs.releaseAll);
  const first = runs.run('PHM');
  await runs.whenStarted('PHM');
  const controller = new AbortController();
  controller.abort();

  const second = runs.settled(runs.run('JUD', controller.signal));
  await nextTurn();

  assert.equal(second.done, true);
  assert.ok(second.error instanceof AudioDownloadCancelledError);
  runs.release('PHM');
  await first;
  assert.deepEqual(runs.started, ['PHM']);
});

test('a third collection still queues behind the second after the first has finished', async (t) => {
  const runs = queuedRuns('queue-three-runs');
  t.after(runs.releaseAll);
  const first = runs.run('PHM');
  await runs.whenStarted('PHM');
  const second = runs.run('JUD');
  runs.release('PHM');
  await first;
  await runs.whenStarted('JUD');

  const third = runs.run('3JN');
  await nextTurn();
  assert.deepEqual(runs.started, ['PHM', 'JUD'], 'the third run must wait for the second');

  runs.release('JUD');
  runs.release('3JN');
  await Promise.all([second, third]);
  assert.deepEqual(runs.started, ['PHM', 'JUD', '3JN']);
});
