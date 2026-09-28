import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import { flushAsyncWork, installBibleStoreDoubles } from './__tests__/bibleStoreDoubles';
import type {
  AudioDownloadJobRecord,
  AudioFileSystemAdapter,
} from '../services/audio/audioDownloadService';
import type { BibleTranslation } from '../types';
import { getBookById } from '../constants/books';
import * as audio from '../services/audio/audioDownloadService';
import * as deferredServices from './bible/bibleStoreDeferredServices';

// The real store calls the real orchestrator. Only native setup, disk, and remote audio
// boundaries are replaced; their deferred promises let deletion run at exact boundaries.
mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

interface Gate {
  entered: ReturnType<typeof deferred>;
  release: ReturnType<typeof deferred>;
  failure?: Error;
  freeBytes?: number;
}
function gate(): Gate {
  return { entered: deferred(), release: deferred() };
}

const rootUri = 'file:///audio-cancellation/';
const files = new Map<string, number>();
const receipts = new Map<string, string>();
let remoteLookupFailure: Error | null = null;
let remoteBytes: number | undefined;
const jobs = new Map<string, AudioDownloadJobRecord>();
let jobReadFailureId: string | null = null;
let bookTerminalReadGate: Gate | null = null;
const events: string[] = [];
const reattachedJobIds: string[] = [];
const nativeTasks = new Set<string>();
const stoppedNativeTasks: string[] = [];
const progressHandlers = new Map<
  string,
  NonNullable<NonNullable<Parameters<AudioFileSystemAdapter['downloadFile']>[2]>['onProgress']>
>();
let cancellationGate: Gate | null = null;
let reattachmentGate: (Gate & { resuming?: boolean }) | null = null;
let reattachmentGateJobId: string | null = null;
const reattachmentGatesByJob = new Map<string, Gate & { resuming?: boolean }>();
let resumeInFlight = false;
let cleanupWhileResuming = false;
let unscopedResumeCalls = 0;
let setupGate: Gate | null = null;
let listJobsSnapshotGate: Gate | null = null;
let resumedRequestSetupGate: Gate | null = null;
let setupLoadCount = 0;
let spaceGate: Gate | null = null;
let transferGate: (Gate & { aborted: ReturnType<typeof deferred> }) | null = null;
const transferGatesByBook = new Map<string, Gate & { aborted: ReturnType<typeof deferred> }>();
const jobStore = {
  listJobs: async () => {
    const snapshot = [...jobs.values()];
    const pending = listJobsSnapshotGate;
    listJobsSnapshotGate = null;
    if (pending) {
      pending.entered.resolve();
      await pending.release.promise;
    }
    return snapshot;
  },
  getJob: async (id: string) => {
    if (id === jobReadFailureId) throw new Error('registry read failed');
    const current = jobs.get(id) ?? null;
    if (bookTerminalReadGate && id.endsWith(':book:PHM') && current?.status === 'downloading') {
      const pending = bookTerminalReadGate;
      bookTerminalReadGate = null;
      pending.entered.resolve();
      await pending.release.promise;
    }
    return current;
  },
  upsertJob: async (job: AudioDownloadJobRecord) => {
    jobs.set(job.id, job);
  },
  removeJob: async (id: string) => {
    jobs.delete(id);
  },
};
const fileSystem: AudioFileSystemAdapter = {
  ensureDirectory: async () => {},
  fileExists: async (uri) => files.has(uri),
  getFileSize: async (uri) => files.get(uri) ?? null,
  readTextFile: async (uri) => receipts.get(uri) ?? null,
  writeTextFile: async (uri, contents) => {
    receipts.set(uri, contents);
  },
  getFreeDiskBytes: async () => {
    const pending = spaceGate;
    spaceGate = null;
    if (pending) {
      pending.entered.resolve();
      await pending.release.promise;
    }
    return pending?.freeBytes ?? 10 * 1024 ** 3;
  },
  downloadFile: async (_from, to, options) => {
    if (options?.bookId && options.onProgress)
      progressHandlers.set(options.bookId, options.onProgress);
    const pending = (options?.bookId && transferGatesByBook.get(options.bookId)) || transferGate;
    if (options?.bookId) transferGatesByBook.delete(options.bookId);
    if (pending === transferGate) transferGate = null;
    if (pending) {
      const onAbort = () => pending.aborted.resolve();
      options?.signal?.addEventListener('abort', onAbort);
      pending.entered.resolve();
      try {
        await pending.release.promise;
      } finally {
        options?.signal?.removeEventListener('abort', onAbort);
      }
      if (options?.signal?.aborted) throw new audio.AudioDownloadCancelledError();
    }
    events.push(`write:${to}`);
    files.set(to, 4096);
  },
};

mockModule(mock, sourcePath('stores/bible/bibleStoreDeferredServices.ts'), {
  ...deferredServices,
  loadAudioDownloadModules: async () => {
    setupLoadCount += 1;
    const pending = setupGate;
    setupGate = null;
    if (pending) {
      pending.entered.resolve();
      await pending.release.promise;
      if (pending.failure) throw pending.failure;
    }
    if (setupLoadCount === 2 && resumedRequestSetupGate) {
      const resume = resumedRequestSetupGate;
      resumedRequestSetupGate = null;
      resume.entered.resolve();
      await resume.release.promise;
    }
    return {
      ...audio,
      AUDIO_DOWNLOAD_ROOT_URI: rootUri,
      expoAudioFileSystemAdapter: fileSystem,
      createAudioDownloadJobStore: async () => jobStore,
      createBackgroundAudioDownloadTransport: async () => ({
        reattachJob: async (jobId: string, signal?: AbortSignal) => {
          const pending =
            reattachmentGatesByJob.get(jobId) ??
            (!reattachmentGateJobId || reattachmentGateJobId === jobId ? reattachmentGate : null);
          reattachmentGatesByJob.delete(jobId);
          if (pending === reattachmentGate) reattachmentGate = null;
          if (pending) {
            resumeInFlight = Boolean(pending.resuming);
            pending.entered.resolve();
            await pending.release.promise;
            resumeInFlight = false;
          }
          if (signal?.aborted) return;
          reattachedJobIds.push(jobId);
        },
        downloadFile: async (
          from: string,
          to: string,
          options?: Parameters<AudioFileSystemAdapter['downloadFile']>[2]
        ) => {
          const id = options?.taskId ?? to;
          nativeTasks.add(id);
          try {
            await fileSystem.downloadFile(from, to, options);
          } finally {
            nativeTasks.delete(id);
          }
        },
        cancelJob: async (jobId: string, options?: { bookIds: readonly string[] }) => {
          cleanupWhileResuming ||= resumeInFlight;
          const pending = cancellationGate;
          cancellationGate = null;
          if (pending) {
            pending.entered.resolve();
            await pending.release.promise;
          }
          // The native adapter enumerates existing tasks asynchronously, after setup.
          for (const taskId of nativeTasks) {
            const matching = options
              ? options.bookIds.some((bookId) =>
                  audio.audioDownloadTaskIdMatchesJob(
                    taskId,
                    `audio-download:${jobId.split(':')[1]}:book:${bookId}`
                  )
                )
              : audio.audioDownloadTaskIdMatchesJob(taskId, jobId);
            if (matching) stoppedNativeTasks.push(taskId);
          }
        },
      }),
      ensureBackgroundAudioDownloadsRunning: async () => {
        unscopedResumeCalls += 1;
      },
      fetchRemoteChapterAudio: async () => {
        if (remoteLookupFailure) throw remoteLookupFailure;
        return { url: 'https://fixture.invalid/chapter.mp3', duration: 10, bytes: remoteBytes };
      },
    };
  },
  deleteFileSystemPath: async (uri: string) => {
    events.push(`delete:${uri}`);
    for (const path of files.keys()) if (path.startsWith(uri)) files.delete(path);
  },
});

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaults: () => BibleTranslation[];
before(async () => {
  defaults = (await import('./persistedStateSanitizers')).getDefaultBibleTranslations;
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});
beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  files.clear();
  receipts.clear();
  remoteLookupFailure = null;
  remoteBytes = undefined;
  jobs.clear();
  jobReadFailureId = null;
  bookTerminalReadGate = null;
  events.length = 0;
  setupGate = null;
  listJobsSnapshotGate = null;
  resumedRequestSetupGate = null;
  setupLoadCount = 0;
  spaceGate = null;
  transferGate = null;
  transferGatesByBook.clear();
  cancellationGate = null;
  reattachmentGate = null;
  reattachmentGateJobId = null;
  reattachmentGatesByJob.clear();
  reattachedJobIds.length = 0;
  resumeInFlight = false;
  cleanupWhileResuming = false;
  unscopedResumeCalls = 0;
  nativeTasks.clear();
  stoppedNativeTasks.length = 0;
  progressHandlers.clear();
  useBibleStore.setState({ ...useBibleStore.getInitialState(), translations: defaults() }, true);
});
after(() => mock.reset());

function translation(id: string) {
  return useBibleStore.getState().translations.find((item) => item.id === id);
}
function seedExistingAudio() {
  useBibleStore.setState((state) => ({
    translations: state.translations.map((item) =>
      item.id === 'bsb' ? { ...item, downloadedAudioBooks: ['RUT'] } : item
    ),
  }));
  files.set(`${rootUri}bsb/RUT/1.mp3`, 4096);
}

for (const scope of ['book', 'collection'] as const) {
  for (const phase of ['setup', 'preflight'] as const) {
    test(`deleting during ${scope} audio ${phase} prevents late jobs and downloaded files`, async () => {
      seedExistingAudio();
      const pending = gate();
      if (phase === 'setup') setupGate = pending;
      else spaceGate = pending;
      const downloading =
        scope === 'book'
          ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
          : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
      await pending.entered.promise;

      let lateJobUpdates = 0;
      const unsubscribe = useBibleStore.subscribe((state) => {
        if (state.translations.find((item) => item.id === 'bsb')?.activeDownloadJob)
          lateJobUpdates += 1;
      });
      const deleting = useBibleStore.getState().deleteTranslation('bsb');
      await flushAsyncWork();
      const deletedBeforeRequestSettled = events.filter((event) => event.startsWith('delete:'));
      pending.release.resolve();
      await Promise.all([downloading, deleting]);
      unsubscribe();

      assert.deepEqual(
        events.filter((event) => event.startsWith('write:')),
        []
      );
      assert.equal(lateJobUpdates, 0);
      assert.deepEqual(deletedBeforeRequestSettled, []);
      assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
      assert.equal(translation('bsb')?.activeDownloadJob, null);
      assert.equal(useBibleStore.getState().downloadProgress, null);
      assert.equal(files.size, 0);
      assert.deepEqual([...jobs.values()], []);
    });
  }
}

for (const scope of ['book', 'collection'] as const) {
  test(`deleting a ${scope} request waits for its cancelled native writer to stop`, async () => {
    seedExistingAudio();
    const pending = { ...gate(), aborted: deferred() };
    transferGate = pending;
    const downloading =
      scope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
    await pending.entered.promise;
    const deleting = useBibleStore.getState().deleteTranslation('bsb');
    await pending.aborted.promise;
    assert.deepEqual(events, [], 'no audio directory is deleted while its writer is stopping');
    pending.release.resolve();
    await Promise.all([downloading, deleting]);

    assert.deepEqual(events, [`delete:${rootUri}bsb/`]);
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
    assert.equal(files.size, 0);
    assert.equal(jobs.size, 0);
  });

  test(`deleting a new ${scope} request immediately prevents lazy setup and first audio`, async () => {
    const downloading =
      scope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
    const deleting = useBibleStore.getState().deleteTranslation('bsb');
    await Promise.all([downloading, deleting]);

    assert.deepEqual(events, []);
    assert.equal(files.size, 0);
    assert.equal(jobs.size, 0);
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
  });
}

test('deleting a pending request preserves another translation download', async () => {
  seedExistingAudio();
  const pending = gate();
  setupGate = pending;
  const cancelled = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await pending.entered.promise;
  const deleting = useBibleStore.getState().deleteTranslation('bsb');
  await useBibleStore.getState().downloadAudioForBook('web', 'PHM');
  pending.release.resolve();
  await Promise.all([cancelled, deleting]);

  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
  assert.deepEqual(translation('web')?.downloadedAudioBooks, ['PHM']);
  assert.deepEqual([...files.keys()], [`${rootUri}web/PHM/1.mp3`]);
  assert.ok([...jobs.values()].every((job) => job.translationId === 'web'));
});

for (const scope of ['book', 'collection'] as const) {
  for (const phase of ['setup', 'preflight'] as const) {
    test(`cancelling a resumed ${scope} request during ${phase} prevents late state and allows retry`, async () => {
      // Recovery can restore the banner before its JS request finishes loading services.
      const jobId = audio.createAudioDownloadJobId({
        translationId: 'bsb',
        scope: scope === 'book' ? 'book' : 'translation',
        bookId: scope === 'book' ? 'PHM' : undefined,
      });
      useBibleStore.setState({
        downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
      });
      const pending = gate();
      if (phase === 'setup') setupGate = pending;
      else spaceGate = pending;
      const download = () =>
        scope === 'book'
          ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
          : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
      const cancelled = download();
      await pending.entered.promise;
      useBibleStore.getState().cancelDownload();
      await flushAsyncWork();
      pending.release.resolve();
      await cancelled;
      await flushAsyncWork();

      assert.deepEqual(events, []);
      assert.equal(files.size, 0);
      assert.equal(jobs.size, 0);
      assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
      assert.equal(translation('bsb')?.activeDownloadJob, null);
      assert.equal(useBibleStore.getState().downloadProgress, null);

      await download();
      assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
      assert.equal(
        files.size,
        1,
        'the cancelled request released its shared promise and controller'
      );
    });
  }
}

for (const phase of ['setup', 'preflight'] as const) {
  test(`cancelled ${phase} failure settles cleanly, but uncancelled failures propagate`, async () => {
    const pending = { ...gate(), failure: new Error('native setup failed'), freeBytes: 0 };
    if (phase === 'setup') setupGate = pending;
    else spaceGate = pending;
    const jobId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope: 'book',
      bookId: 'PHM',
    });
    useBibleStore.setState({
      downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
    });
    const cancelled = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    await pending.entered.promise;
    useBibleStore.getState().cancelDownload();
    pending.release.resolve();
    await assert.doesNotReject(cancelled);
    await flushAsyncWork();
    assert.deepEqual(events, []);
    assert.equal(jobs.size, 0);

    const failing = { ...gate(), failure: pending.failure, freeBytes: 0 };
    if (phase === 'setup') setupGate = failing;
    else spaceGate = failing;
    const failed = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    const rejection = assert.rejects(
      failed,
      phase === 'setup' ? /native setup failed/ : /free space/i
    );
    await failing.entered.promise;
    failing.release.resolve();
    await rejection;
  });
}

for (const [scope, retryScope] of [
  ['book', 'book'],
  ['collection', 'collection'],
  ['collection', 'book'],
  ['book', 'collection'],
] as const) {
  test(`${scope} cancellation followed by ${retryScope} retry waits for old native cancellation and retains its saved job`, async () => {
    const jobId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope: scope === 'book' ? 'book' : 'translation',
      bookId: scope === 'book' ? 'PHM' : undefined,
    });
    const download = () =>
      scope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
    if (scope === 'collection') {
      await audio.startAudioDownloadJob({
        translationId: 'bsb',
        scope: 'translation',
        requestedBookIds: ['PHM'],
        jobStore,
      });
    }
    useBibleStore.setState({
      downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
    });
    const preparation = gate();
    spaceGate = preparation;
    const cancelled = download();
    await preparation.entered.promise;
    const cleanup = gate();
    cancellationGate = cleanup;
    useBibleStore.getState().cancelDownload();
    preparation.release.resolve();
    await cancelled;
    await cleanup.entered.promise;

    const writer = { ...gate(), aborted: deferred() };
    transferGate = writer;
    const retryJobId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope: retryScope === 'book' ? 'book' : 'translation',
      bookId: retryScope === 'book' ? 'PHM' : undefined,
    });
    const retry =
      retryScope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
    await flushAsyncWork();
    const tasksBeforeCleanup = [...nativeTasks];
    const jobsBeforeCleanup = [...jobs.keys()];
    cleanup.release.resolve();
    await writer.entered.promise;
    await flushAsyncWork();
    const retryRecordSurvived = jobs.has(retryJobId);
    writer.release.resolve();
    await retry;

    assert.deepEqual(
      tasksBeforeCleanup,
      [],
      'retry must not create a task for old cancellation to enumerate'
    );
    assert.deepEqual(
      jobsBeforeCleanup,
      scope === 'collection' ? [jobId] : [],
      'retry must not save a record for old cleanup to remove'
    );
    assert.deepEqual(stoppedNativeTasks, []);
    assert.equal(retryRecordSurvived, true);
    assert.equal(jobs.get(retryJobId)?.status, 'completed');
  });
}

test('cancelling a retry waiting for same-job cleanup prevents native setup and releases retry ownership', async () => {
  const jobId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
  });
  const banner = { translationId: 'bsb', jobId, progress: 0, status: 'downloading' as const };
  useBibleStore.setState({ downloadProgress: banner });
  const preparation = gate();
  spaceGate = preparation;
  const cancelled = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await preparation.entered.promise;
  const cleanup = gate();
  cancellationGate = cleanup;
  useBibleStore.getState().cancelDownload();
  preparation.release.resolve();
  await cancelled;
  await cleanup.entered.promise;

  const retry = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  useBibleStore.setState({ downloadProgress: banner });
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  cleanup.release.resolve();
  await retry;
  await flushAsyncWork();
  assert.deepEqual(events, []);
  assert.equal(jobs.size, 0);
  await useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
});

for (const [translationId, bookId] of [
  ['web', 'PHM'],
  ['bsb', 'JUD'],
] as const) {
  test(`book cleanup leaves ${translationId} ${bookId} request independent`, async () => {
    const jobId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope: 'book',
      bookId: 'PHM',
    });
    useBibleStore.setState({
      downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
    });
    const preparation = gate();
    spaceGate = preparation;
    const cancelled = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    await preparation.entered.promise;
    const cleanup = gate();
    cancellationGate = cleanup;
    useBibleStore.getState().cancelDownload();
    preparation.release.resolve();
    await cancelled;
    await cleanup.entered.promise;
    let completed = false;
    const independent = useBibleStore
      .getState()
      .downloadAudioForBook(translationId, bookId)
      .then(() => {
        completed = true;
      });
    await flushAsyncWork();
    const completedBeforeCleanup = completed;
    cleanup.release.resolve();
    await independent;
    await flushAsyncWork();
    assert.equal(completedBeforeCleanup, true);
    assert.ok(translation(translationId)?.downloadedAudioBooks?.includes(bookId));
  });
}
for (const scope of ['book', 'translation'] as const) {
  test(`cancellation during ${scope} reattachment cannot restore the cancelled job`, async () => {
    const jobId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope,
      bookId: scope === 'book' ? 'PHM' : undefined,
    });
    jobs.set(jobId, {
      id: jobId,
      translationId: 'bsb',
      scope,
      bookId: scope === 'book' ? 'PHM' : undefined,
      requestedBookIds: scope === 'translation' ? ['PHM'] : undefined,
      runId: `persisted-run:${jobId}`,
      status: 'downloading',
      createdAt: 1,
      updatedAt: 1,
      attemptCount: 1,
    });
    if (scope === 'translation') await addRecoveryBook('bsb', 'PHM', jobs.get(jobId)?.runId);
    useBibleStore.setState({
      downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
    });
    const pending = gate();
    reattachmentGate = pending;
    const reattaching = useBibleStore.getState().reattachAudioDownloads();
    await pending.entered.promise;
    useBibleStore.getState().cancelDownload();
    await flushAsyncWork();
    const jobsAfterCancel = jobs.size;
    pending.release.resolve();
    await reattaching;
    await flushAsyncWork();
    assert.equal(
      jobsAfterCancel,
      scope === 'translation' ? 2 : 1,
      'cleanup waits for recovery ownership before removing its record'
    );
    assert.deepEqual(events, []);
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
    assert.equal(translation('bsb')?.activeDownloadJob, null);
    assert.equal(useBibleStore.getState().downloadProgress, null);
    await useBibleStore.getState().reattachAudioDownloads();
    await flushAsyncWork();
    assert.deepEqual(events, [], 'a cancelled collection child must not revive next recovery');
    assert.equal(jobs.size, 0);
  });
}

test('cancellation waits for an in-flight native resume before stopping tasks and removing the job', async () => {
  const jobId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
  });
  jobs.set(jobId, {
    id: jobId,
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    status: 'downloading',
    createdAt: 1,
    updatedAt: 1,
    attemptCount: 1,
  });
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
  });
  const pending = { ...gate(), resuming: true };
  reattachmentGate = pending;
  const reattaching = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  const jobRemovedDuringResume = !jobs.has(jobId);
  pending.release.resolve();
  await reattaching;
  await flushAsyncWork();
  assert.equal(jobRemovedDuringResume, false);
  assert.equal(cleanupWhileResuming, false);
  assert.equal(jobs.size, 0);
  assert.deepEqual(events, []);
});

test('persisted recovery with no active jobs never resumes orphan or completed native work', async () => {
  const jobId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
  });
  jobs.set(jobId, {
    id: jobId,
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    status: 'completed',
    createdAt: 1,
    updatedAt: 1,
    attemptCount: 1,
  });
  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  assert.equal(unscopedResumeCalls, 0);
  assert.deepEqual(events, []);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

function seedRecoveryJob(scope: 'book' | 'translation' = 'book') {
  const jobId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope,
    bookId: scope === 'book' ? 'PHM' : undefined,
  });
  const record: AudioDownloadJobRecord = {
    id: jobId,
    translationId: 'bsb',
    scope,
    bookId: scope === 'book' ? 'PHM' : undefined,
    requestedBookIds: scope === 'translation' ? ['PHM'] : undefined,
    runId: `persisted-run:${jobId}`,
    status: 'downloading',
    createdAt: 1,
    updatedAt: 1,
    attemptCount: 1,
  };
  jobs.set(jobId, record);
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId, progress: 0, status: 'downloading' },
  });
  return record;
}

test('a hydrated banner cancellation reaches recovery during initial service loading', async () => {
  seedRecoveryJob();
  const pending = gate();
  setupGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  useBibleStore.getState().cancelDownload();
  pending.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(events, []);
  assert.equal(jobs.size, 0);
  assert.equal(useBibleStore.getState().downloadProgress, null);
  assert.equal(unscopedResumeCalls, 0);
});

test('deleting during native reattachment waits for recovery and cannot resume deleted audio', async () => {
  seedExistingAudio();
  seedRecoveryJob();
  const pending = gate();
  reattachmentGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  const deleting = useBibleStore.getState().deleteTranslation('bsb');
  await flushAsyncWork();
  const deletedDuringRecovery = events.slice();
  pending.release.resolve();
  await Promise.all([recovery, deleting]);
  await flushAsyncWork();
  assert.deepEqual(deletedDuringRecovery, []);
  assert.deepEqual(events, [`delete:${rootUri}bsb/`]);
  assert.equal(files.size, 0);
  assert.equal(jobs.size, 0);
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
});

test('a job completed during native enumeration is not restored or restarted from its stale snapshot', async () => {
  const record = seedRecoveryJob();
  const pending = gate();
  reattachmentGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  jobs.set(record.id, { ...record, status: 'completed' });
  pending.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(events, []);
  assert.equal(jobs.get(record.id)?.status, 'completed');
  assert.equal(translation('bsb')?.activeDownloadJob, null);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('recovery started after Cancel waits for old cleanup and cannot restore its removed job', async () => {
  seedRecoveryJob();
  const cleanup = gate();
  cancellationGate = cleanup;
  useBibleStore.getState().cancelDownload();
  await cleanup.entered.promise;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  cleanup.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(events, []);
  assert.equal(jobs.size, 0);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

for (const scope of ['book', 'translation'] as const) {
  test(`genuine persisted ${scope} recovery finishes only its requested book`, async () => {
    const record = seedRecoveryJob(scope);
    await useBibleStore.getState().reattachAudioDownloads();
    await flushAsyncWork();
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
    assert.deepEqual([...files.keys()], [`${rootUri}bsb/PHM/1.m4a`]);
    assert.equal(jobs.get(record.id)?.status, 'completed');
    assert.equal(unscopedResumeCalls, 0);
  });
}

test('a failed recovery releases its owner so deletion and later recovery remain available', async () => {
  seedExistingAudio();
  seedRecoveryJob();
  const pending = { ...gate(), failure: new Error('native setup failed') };
  setupGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  const failed = assert.rejects(recovery, /native setup failed/);
  await pending.entered.promise;
  pending.release.resolve();
  await failed;
  await useBibleStore.getState().deleteTranslation('bsb');
  assert.equal(jobs.size, 0);
  await useBibleStore.getState().reattachAudioDownloads();
});

test('one recovery failure still waits for another native resume before releasing its deletion owner', async () => {
  seedExistingAudio();
  seedRecoveryJob();
  const webJobId = audio.createAudioDownloadJobId({
    translationId: 'web',
    scope: 'book',
    bookId: 'PHM',
  });
  jobs.set(webJobId, {
    id: webJobId,
    translationId: 'web',
    scope: 'book',
    bookId: 'PHM',
    status: 'downloading',
    createdAt: 1,
    updatedAt: 1,
    attemptCount: 1,
  });
  jobReadFailureId = webJobId;
  const pending = { ...gate(), resuming: true };
  reattachmentGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  const failed = assert.rejects(recovery, /registry read failed/);
  await pending.entered.promise;
  await flushAsyncWork();
  const deleting = useBibleStore.getState().deleteTranslation('bsb');
  await flushAsyncWork();
  const deletedWhileResuming = events.slice();
  pending.release.resolve();
  await Promise.all([failed, deleting]);
  jobReadFailureId = null;
  assert.deepEqual(deletedWhileResuming, []);
  assert.equal(cleanupWhileResuming, false);
  assert.equal(files.size, 0);
});

test('restart recovers both independent book requests persisted by the real service', async () => {
  const firstGate = { ...gate(), aborted: deferred() };
  transferGate = firstGate;
  const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await firstGate.entered.promise;
  const secondGate = { ...gate(), aborted: deferred() };
  transferGate = secondGate;
  const second = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await secondGate.entered.promise;
  const persisted = [...jobs.values()].map((job) => ({ ...job }));
  assert.deepEqual(persisted.map((job) => job.bookId).sort(), ['2JN', 'PHM']);
  assert.ok(persisted.every((job) => job.status === 'downloading'));
  // Each book record exists before its native transfer starts. Settle this runtime, then
  // reconstruct its saved registry as a cold process would (without any running JS owners).
  const stop = audio.cancelAudioDownloadsForTranslation('bsb');
  firstGate.release.resolve();
  secondGate.release.resolve();
  await Promise.all([stop, first, second]);
  files.clear();
  jobs.clear();
  events.length = 0;
  for (const record of persisted) jobs.set(record.id, record);
  useBibleStore.setState({ ...useBibleStore.getInitialState(), translations: defaults() }, true);
  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks?.slice().sort(), ['2JN', 'PHM']);
  assert.ok([...jobs.values()].every((job) => job.status === 'completed'));
});

async function addRecoveryBook(translationId: string, bookId: string, parentRunId?: string) {
  return audio.startAudioDownloadJob({
    translationId,
    scope: 'book',
    bookId,
    parentRunId,
    jobStore,
  });
}

test('selected collection recovery resumes covered children once and preserves independent books', async () => {
  const collection = seedRecoveryJob('translation');
  const child = await addRecoveryBook('bsb', 'PHM', collection.runId);
  const independent = await addRecoveryBook('bsb', '2JN');
  const otherTranslation = await addRecoveryBook('web', '3JN');
  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  assert.deepEqual(
    reattachedJobIds.slice().sort(),
    [child.id, independent.id, otherTranslation.id].sort()
  );
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks?.slice().sort(), ['2JN', 'PHM']);
  assert.deepEqual(translation('web')?.downloadedAudioBooks, ['3JN']);
  assert.deepEqual(jobs.get(collection.id)?.requestedBookIds, ['PHM']);
  assert.ok([...jobs.values()].every((job) => job.status === 'completed'));
  assert.equal(events.filter((event) => event === `write:${rootUri}bsb/PHM/1.m4a`).length, 1);
});

test('cancelling an independent book during collection reattachment does not stop its subset', async () => {
  const collection = seedRecoveryJob('translation');
  const child = await addRecoveryBook('bsb', 'PHM', collection.runId);
  const independent = await addRecoveryBook('bsb', '2JN');
  useBibleStore.setState({
    downloadProgress: {
      translationId: 'bsb',
      jobId: independent.id,
      progress: 0,
      status: 'downloading',
    },
  });
  const pending = gate();
  reattachmentGate = pending;
  reattachmentGateJobId = child.id;
  const independentPending = gate();
  reattachmentGatesByJob.set(independent.id, independentPending);
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await Promise.all([pending.entered.promise, independentPending.entered.promise]);
  useBibleStore.getState().cancelDownload();
  pending.release.resolve();
  independentPending.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
  assert.equal(jobs.get(collection.id)?.status, 'completed');
  assert.equal(jobs.has(independent.id), false);
  assert.deepEqual(reattachedJobIds, [child.id]);
});

test('cancelled collection recovery drains old children before parent and child retries start', async () => {
  const collection = seedRecoveryJob('translation');
  const child = await addRecoveryBook('bsb', 'PHM', collection.runId);
  const pending = gate();
  reattachmentGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  useBibleStore.getState().cancelDownload();
  const parentRetry = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
  const childRetry = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await flushAsyncWork();
  assert.equal(jobs.get(child.id), child, 'independent child retry waits the parent cleanup tail');
  assert.equal(jobs.get(collection.id), collection, 'parent retry also waits that cleanup tail');
  assert.deepEqual(events, []);
  pending.release.resolve();
  await Promise.all([recovery, parentRetry, childRetry]);
  await flushAsyncWork();
  assert.equal(jobs.get(collection.id)?.status, 'completed');
  assert.equal(jobs.get(child.id)?.status, 'completed');
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
});

test('cancel during recovery discovery removes only that independent book request', async () => {
  const first = await addRecoveryBook('bsb', 'PHM');
  const cancelled = await addRecoveryBook('bsb', '2JN');
  useBibleStore.setState({
    downloadProgress: {
      translationId: 'bsb',
      jobId: cancelled.id,
      progress: 0,
      status: 'downloading',
    },
  });
  const pending = gate();
  setupGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  useBibleStore.getState().cancelDownload();
  pending.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['PHM']);
  assert.equal(jobs.get(first.id)?.status, 'completed');
  assert.equal(jobs.has(cancelled.id), false);
  assert.deepEqual(reattachedJobIds, [first.id]);
});

test('cancel after recovery launches a collection but before its child loop prevents second-launch resurrection', async () => {
  const collection = seedRecoveryJob('translation');
  const child = await addRecoveryBook('bsb', 'PHM', collection.runId);
  const pending = gate();
  resumedRequestSetupGate = pending;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await pending.entered.promise;
  useBibleStore.getState().cancelDownload();
  pending.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.equal(jobs.has(collection.id), false);
  assert.equal(jobs.has(child.id), false);
  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  assert.deepEqual(events, []);
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
});

test('cancelling a selected collection leaves an independent outside-book native task running', async () => {
  const collectionGate = { ...gate(), aborted: deferred() };
  transferGate = collectionGate;
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
  await collectionGate.entered.promise;
  const collectionProgress = useBibleStore.getState().downloadProgress;
  const collectionActive = translation('bsb')?.activeDownloadJob;
  assert.ok(collectionProgress?.jobId && collectionActive);
  const independentGate = { ...gate(), aborted: deferred() };
  transferGate = independentGate;
  const independent = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await independentGate.entered.promise;
  const outsideTask = [...nativeTasks].find((id) => id.includes(':book:2JN:'));
  assert.ok(outsideTask);
  useBibleStore.setState((state) => ({
    downloadProgress: collectionProgress,
    translations: state.translations.map((item) =>
      item.id === 'bsb' ? { ...item, activeDownloadJob: collectionActive } : item
    ),
  }));
  useBibleStore.getState().cancelDownload();
  collectionGate.release.resolve();
  await collection;
  await flushAsyncWork();
  const stoppedOutside = stoppedNativeTasks.includes(outsideTask);
  independentGate.release.resolve();
  await independent;
  assert.equal(stoppedOutside, false);
  assert.ok(translation('bsb')?.downloadedAudioBooks?.includes('2JN'));
  assert.equal(
    jobs.get(audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: '2JN' }))
      ?.status,
    'completed'
  );
});

test('cold legacy full-Bible parent retains broad native cancellation', async () => {
  const collection = seedRecoveryJob('translation');
  jobs.set(collection.id, { ...collection, requestedBookIds: undefined, runId: undefined });
  const existingTask = `${audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: 'PHM' })}:PHM:1`;
  nativeTasks.add(existingTask);
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  assert.deepEqual(stoppedNativeTasks, [existingTask]);
  assert.equal(jobs.has(collection.id), false);
});

test('missing collection metadata never authorizes a broad native stop', async () => {
  const collection = seedRecoveryJob('translation');
  jobs.delete(collection.id);
  const unrelatedTask = `${audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: '2JN' })}:2JN:1`;
  nativeTasks.add(unrelatedTask);
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  assert.deepEqual(stoppedNativeTasks, []);
});

test('parent completion during delayed cancellation setup cannot leave a covered cold child to revive', async () => {
  const ruth = { ...gate(), aborted: deferred() };
  const phm = { ...gate(), aborted: deferred() };
  transferGatesByBook.set('RUT', ruth);
  transferGatesByBook.set('PHM', phm);
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['RUT', 'PHM', '2JN']);
  await Promise.all([ruth.entered.promise, phm.entered.promise]);
  const parent = jobs.get(
    audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'translation' })
  );
  assert.deepEqual(parent?.requestedBookIds, ['RUT', 'PHM', '2JN']);
  const coldChild = await addRecoveryBook('bsb', '2JN', parent?.runId);
  const cleanupLoad = gate();
  setupGate = cleanupLoad;
  useBibleStore.getState().cancelDownload();
  await cleanupLoad.entered.promise;
  phm.release.resolve();
  ruth.release.resolve();
  await collection;
  assert.equal(jobs.has(parent.id), true, 'UI cleanup owns parent metadata until it can read it');
  assert.equal(jobs.get(coldChild.id), coldChild);
  cleanupLoad.release.resolve();
  await flushAsyncWork();
  assert.equal(jobs.has(parent.id), false);
  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();
  assert.equal(jobs.has(coldChild.id), false, 'covered child must not survive cancellation');
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks, []);
});

test('real collection progress keeps its own Cancel target beside an independent book', async () => {
  const collectionGate = { ...gate(), aborted: deferred() };
  transferGate = collectionGate;
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
  await collectionGate.entered.promise;
  const collectionId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'translation',
  });
  const bookGate = { ...gate(), aborted: deferred() };
  transferGate = bookGate;
  const independent = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await bookGate.entered.promise;
  let bookAborted = false;
  void bookGate.aborted.promise.then(() => {
    bookAborted = true;
  });

  progressHandlers.get('PHM')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
  await flushAsyncWork();
  const visibleId = useBibleStore.getState().downloadProgress?.jobId;
  const activeProgress = translation('bsb')?.activeDownloadJob?.progress;
  useBibleStore.getState().cancelDownload();
  let collectionAborted = false;
  void collectionGate.aborted.promise.then(() => {
    collectionAborted = true;
  });
  await flushAsyncWork();
  collectionGate.release.resolve();
  await collection;
  const restoredBookId = useBibleStore.getState().downloadProgress?.jobId;
  bookGate.release.resolve();
  await independent;
  await flushAsyncWork();
  assert.equal(visibleId, collectionId);
  assert.equal(activeProgress, 0, 'collection progress must not mutate the independent book slot');
  assert.equal(collectionAborted, true);
  assert.equal(bookAborted, false);
  assert.equal(
    restoredBookId,
    audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: '2JN' })
  );
  assert.equal(jobs.get(collectionId), undefined);
  assert.ok(translation('bsb')?.downloadedAudioBooks?.includes('2JN'));
});

test('independent outside-book progress remains its own Cancel owner after collection starts', async () => {
  const bookGate = { ...gate(), aborted: deferred() };
  transferGate = bookGate;
  const independent = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await bookGate.entered.promise;
  const bookId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: '2JN',
  });
  const collectionGate = { ...gate(), aborted: deferred() };
  transferGate = collectionGate;
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
  await collectionGate.entered.promise;
  progressHandlers.get('2JN')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
  await flushAsyncWork();
  const visibleId = useBibleStore.getState().downloadProgress?.jobId;
  const activeProgress = translation('bsb')?.activeDownloadJob?.progress;
  let bookAborted = false;
  let collectionAborted = false;
  void bookGate.aborted.promise.then(() => {
    bookAborted = true;
  });
  void collectionGate.aborted.promise.then(() => {
    collectionAborted = true;
  });
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  bookGate.release.resolve();
  await independent;
  const restoredCollectionId = useBibleStore.getState().downloadProgress?.jobId;
  collectionGate.release.resolve();
  await collection;
  await flushAsyncWork();
  assert.equal(visibleId, bookId);
  assert.equal(activeProgress, 0, 'book progress must not mutate the collection slot');
  assert.equal(bookAborted, true);
  assert.equal(collectionAborted, false);
  assert.equal(
    restoredCollectionId,
    audio.createAudioDownloadJobId({ translationId: 'bsb', scope: 'translation' })
  );
  assert.ok(translation('bsb')?.downloadedAudioBooks?.includes('PHM'));
});

for (const firstToFinish of ['book', 'collection'] as const) {
  for (const otherTranslation of [false, true]) {
    test(`${firstToFinish} completion restores a running ${otherTranslation ? 'other-translation' : 'same-translation'} audio job`, async () => {
      const collectionGate = { ...gate(), aborted: deferred() };
      transferGate = collectionGate;
      const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
      await collectionGate.entered.promise;
      const collectionId = audio.createAudioDownloadJobId({
        translationId: 'bsb',
        scope: 'translation',
      });
      const bookTranslation = otherTranslation ? 'web' : 'bsb';
      const bookGate = { ...gate(), aborted: deferred() };
      transferGate = bookGate;
      const book = useBibleStore.getState().downloadAudioForBook(bookTranslation, '2JN');
      await bookGate.entered.promise;
      const bookId = audio.createAudioDownloadJobId({
        translationId: bookTranslation,
        scope: 'book',
        bookId: '2JN',
      });

      if (firstToFinish === 'book') {
        bookGate.release.resolve();
        await book;
      } else {
        collectionGate.release.resolve();
        await collection;
      }
      const remainingId = firstToFinish === 'book' ? collectionId : bookId;
      const persistedStatus = jobs.get(remainingId)?.status;
      const bannerId = useBibleStore.getState().downloadProgress?.jobId;
      const rowId = translation(firstToFinish === 'book' ? 'bsb' : bookTranslation)
        ?.activeDownloadJob?.id;

      useBibleStore.getState().cancelDownload();
      let remainingAborted = false;
      const remainingGate = firstToFinish === 'book' ? collectionGate : bookGate;
      void remainingGate.aborted.promise.then(() => {
        remainingAborted = true;
      });
      await flushAsyncWork();
      if (firstToFinish === 'book') {
        collectionGate.release.resolve();
        await collection;
      } else {
        bookGate.release.resolve();
        await book;
      }
      await flushAsyncWork();
      assert.equal(persistedStatus, 'downloading');
      assert.equal(bannerId, remainingId);
      assert.equal(rowId, remainingId);
      assert.equal(remainingAborted, true);
      assert.equal(jobs.has(remainingId), false);
      await useBibleStore.getState().reattachAudioDownloads();
      await flushAsyncWork();
      assert.equal(jobs.has(remainingId), false, 'cancelled job must not return after recovery');
    });
  }
}

for (const secondTerminal of ['completed', 'cancelled'] as const) {
  test(`a delayed completion snapshot never restores a ${secondTerminal} second job`, async () => {
    const firstGate = { ...gate(), aborted: deferred() };
    transferGate = firstGate;
    const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    await firstGate.entered.promise;
    const secondGate = { ...gate(), aborted: deferred() };
    transferGate = secondGate;
    const second = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
    await secondGate.entered.promise;
    const secondId = audio.createAudioDownloadJobId({
      translationId: 'bsb',
      scope: 'book',
      bookId: '2JN',
    });

    const staleRead = gate();
    listJobsSnapshotGate = staleRead;
    firstGate.release.resolve();
    await staleRead.entered.promise;
    if (secondTerminal === 'cancelled') {
      progressHandlers.get('2JN')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
      await flushAsyncWork();
      useBibleStore.getState().cancelDownload();
    }
    secondGate.release.resolve();
    await second;
    await flushAsyncWork();
    assert.equal(
      secondTerminal === 'cancelled' ? jobs.has(secondId) : jobs.get(secondId)?.status,
      secondTerminal === 'cancelled' ? false : 'completed'
    );

    staleRead.release.resolve();
    await first;
    await flushAsyncWork();
    assert.equal(useBibleStore.getState().downloadProgress, null);
    assert.equal(translation('bsb')?.activeDownloadJob, null);
  });
}

test('a delayed completion snapshot cannot revive a deleted translation job', async () => {
  const firstGate = { ...gate(), aborted: deferred() };
  transferGate = firstGate;
  const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await firstGate.entered.promise;
  const secondGate = { ...gate(), aborted: deferred() };
  transferGate = secondGate;
  const second = useBibleStore.getState().downloadAudioForBook('web', '2JN');
  await secondGate.entered.promise;
  const staleRead = gate();
  listJobsSnapshotGate = staleRead;
  firstGate.release.resolve();
  await staleRead.entered.promise;

  const deleting = useBibleStore.getState().deleteTranslation('web');
  secondGate.release.resolve();
  await Promise.all([second, deleting]);
  staleRead.release.resolve();
  await first;
  await flushAsyncWork();
  assert.equal(useBibleStore.getState().downloadProgress, null);
  assert.equal(translation('web')?.activeDownloadJob, null);
});

test('a delayed completion snapshot leaves a newer same-id book retry in charge', async () => {
  const firstGate = { ...gate(), aborted: deferred() };
  transferGate = firstGate;
  const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await firstGate.entered.promise;
  const secondGate = { ...gate(), aborted: deferred() };
  transferGate = secondGate;
  const second = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await secondGate.entered.promise;
  const secondId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: '2JN',
  });
  const oldRecord = jobs.get(secondId);
  const staleRead = gate();
  listJobsSnapshotGate = staleRead;
  firstGate.release.resolve();
  await staleRead.entered.promise;
  progressHandlers.get('2JN')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
  useBibleStore.getState().cancelDownload();
  secondGate.release.resolve();
  await second;
  await flushAsyncWork();

  const retryGate = { ...gate(), aborted: deferred() };
  transferGate = retryGate;
  const retry = useBibleStore.getState().downloadAudioForBook('bsb', '2JN');
  await retryGate.entered.promise;
  const newRecord = jobs.get(secondId);
  staleRead.release.resolve();
  await first;
  const visibleDuringRetry = useBibleStore.getState().downloadProgress?.jobId;
  retryGate.release.resolve();
  await retry;
  assert.notEqual(newRecord, oldRecord);
  assert.equal(visibleDuringRetry, secondId);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

for (const scope of ['book', 'collection'] as const) {
  test(`${scope} failed repair stops advertising only the unverified cached book`, async () => {
    useBibleStore.setState((state) => ({
      translations: state.translations.map((item) =>
        item.id === 'bsb' ? { ...item, downloadedAudioBooks: ['PHM', 'RUT'] } : item
      ),
    }));
    const fileUri = audio.getChapterAudioFileUri('bsb', 'PHM', 1, rootUri);
    const receiptUri = `${audio.getBookAudioDirectoryUri('bsb', 'PHM', rootUri)}verified-sizes.json`;
    files.set(fileUri, 1369);
    receipts.set(receiptUri, JSON.stringify({ 1: 1369 }));
    remoteLookupFailure = new Error('offline');
    await assert.rejects(
      scope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']),
      /offline/
    );
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['RUT']);
    assert.equal(files.get(fileUri), 1369, 'failed lookup preserves existing bytes');
    remoteLookupFailure = null;
    remoteBytes = 1369;
    await (scope === 'book'
      ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
      : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']));
    assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['RUT', 'PHM']);
    assert.equal(
      events.some((event) => event.startsWith('write:')),
      false,
      'exact metadata reuses bytes'
    );
    remoteLookupFailure = new Error('offline');
    await (scope === 'book'
      ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
      : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']));
    assert.deepEqual(
      translation('bsb')?.downloadedAudioBooks,
      ['RUT', 'PHM'],
      'trusted offline reuse remains downloaded'
    );
  });
}

for (const scope of ['book', 'collection'] as const) {
  for (const size of [undefined, 128]) {
    test(`${scope} repair with ${size == null ? 'missing' : 'undersized'} chapter clears only its downloaded label on failure`, async () => {
      useBibleStore.setState((state) => ({
        translations: state.translations.map((item) =>
          item.id === 'bsb' ? { ...item, downloadedAudioBooks: ['PHM', 'RUT'] } : item
        ),
      }));
      if (size != null) files.set(audio.getChapterAudioFileUri('bsb', 'PHM', 1, rootUri), size);
      remoteLookupFailure = new Error('offline');
      await assert.rejects(
        scope === 'book'
          ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
          : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']),
        /offline/
      );
      assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['RUT']);
    });
  }
  test(`${scope} cancellation after missing chapter admission cannot retain a completed book label`, async () => {
    useBibleStore.setState((state) => ({
      translations: state.translations.map((item) =>
        item.id === 'bsb' ? { ...item, downloadedAudioBooks: ['PHM', 'RUT'] } : item
      ),
    }));
    let cancelled = false;
    const unsubscribe = useBibleStore.subscribe((state) => {
      const books = state.translations.find((item) => item.id === 'bsb')?.downloadedAudioBooks;
      if (!cancelled && books?.length === 1 && books[0] === 'RUT') {
        cancelled = true;
        state.cancelDownload();
      }
    });
    try {
      await (scope === 'book'
        ? useBibleStore.getState().downloadAudioForBook('bsb', 'PHM')
        : useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']));
      await flushAsyncWork();
      assert.equal(cancelled, true);
      assert.deepEqual(translation('bsb')?.downloadedAudioBooks, ['RUT']);
      assert.equal(
        events.some((event) => event.startsWith('write:')),
        false
      );
    } finally {
      unsubscribe();
    }
  });
}

test('overlapping collection Cancel drains cleanup before admitting the waiting same-book request', async () => {
  const childGate = { ...gate(), aborted: deferred() };
  transferGate = childGate;
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM']);
  await childGate.entered.promise;
  const bookId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
  });
  const childRecord = jobs.get(bookId);
  assert.ok(childRecord?.runId, 'book record is persisted before its native task starts');
  assert.equal(childRecord.parentRunId, jobs.get('audio-download:bsb:translation:all')?.runId);
  const standaloneGate = { ...gate(), aborted: deferred() };
  transferGate = standaloneGate;
  const standalone = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await flushAsyncWork();
  const beforeCancel = jobs.get(bookId);
  const visibleBeforeCancel = useBibleStore.getState().downloadProgress?.jobId;
  const cleanup = gate();
  cancellationGate = cleanup;
  progressHandlers.get('PHM')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
  useBibleStore.getState().cancelDownload();
  childGate.release.resolve();
  await collection;
  await cleanup.entered.promise;
  let startedBeforeCleanup = false;
  standaloneGate.entered.promise.then(() => {
    startedBeforeCleanup = true;
  });
  await flushAsyncWork();
  const prematureStart = startedBeforeCleanup;
  cleanup.release.resolve();
  await standaloneGate.entered.promise;
  const taskId = [...nativeTasks].find((id) => id.startsWith(`${bookId}:`));
  const stopped = Boolean(taskId && stoppedNativeTasks.includes(taskId));
  const standaloneRecord = jobs.get(bookId);
  standaloneGate.release.resolve();
  await standalone;
  await flushAsyncWork();
  assert.equal(beforeCancel, childRecord, 'waiting caller cannot overwrite the current child row');
  assert.equal(visibleBeforeCancel, 'audio-download:bsb:translation:all');
  assert.equal(prematureStart, false, 'same-book writer waits for native cleanup');
  assert.equal(stopped, false);
  assert.ok(standaloneRecord, 'parent cleanup must retain independent record');
  assert.equal(standaloneRecord.parentRunId, undefined);
  assert.equal(jobs.get(bookId)?.status, 'completed');
});

test('collection Cancel preserves an independent completed-child book terminal owner', async () => {
  const second = { ...gate(), aborted: deferred() };
  const third = { ...gate(), aborted: deferred() };
  transferGatesByBook.set('2JN', second);
  transferGatesByBook.set('JUD', third);
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM', '2JN', 'JUD']);
  await Promise.all([second.entered.promise, third.entered.promise]);
  const bookId = audio.createAudioDownloadJobId({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
  });
  const childRecord = jobs.get(bookId);
  const terminal = gate();
  bookTerminalReadGate = terminal;
  const standalone = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await terminal.entered.promise;
  second.release.resolve();
  await flushAsyncWork();
  assert.equal(
    useBibleStore.getState().downloadProgress?.jobId,
    'audio-download:bsb:translation:all'
  );
  useBibleStore.getState().cancelDownload();
  third.release.resolve();
  await collection;
  await flushAsyncWork();
  const retainedBeforeTerminal = jobs.get(bookId);
  terminal.release.resolve();
  await standalone;
  await flushAsyncWork();
  assert.ok(retainedBeforeTerminal, 'cleanup cannot erase an independent terminal owner');
  assert.notEqual(retainedBeforeTerminal?.runId, childRecord?.runId);
  assert.equal(retainedBeforeTerminal?.parentRunId, undefined);
  assert.equal(jobs.get(bookId)?.status, 'completed');
});

test('legacy collection cleanup preserves a fresh standalone row and its native namespace', async () => {
  const parent = seedRecoveryJob('translation');
  jobs.set(parent.id, { ...parent, requestedBookIds: undefined, runId: undefined });
  const fresh = await addRecoveryBook('bsb', 'PHM');
  const independent = { ...fresh, runId: 'fresh-standalone-run' };
  jobs.set(fresh.id, independent);
  const freshTask = `${fresh.id}:PHM:1`;
  const legacyTask = 'audio-download:bsb:book:2JN:2JN:1';
  nativeTasks.add(freshTask);
  nativeTasks.add(legacyTask);
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  assert.equal(jobs.has(parent.id), false);
  assert.equal(jobs.get(fresh.id), independent);
  assert.equal(stoppedNativeTasks.includes(freshTask), false);
  assert.equal(stoppedNativeTasks.includes(legacyTask), true);
});

for (const action of ['cancel', 'delete'] as const) {
  test(`${action} drains a book terminal registry write before retiring its owned run`, async () => {
    const terminal = gate();
    bookTerminalReadGate = terminal;
    const downloading = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    await terminal.entered.promise;
    const bookId = 'audio-download:bsb:book:PHM';
    let deleting: Promise<void> | undefined;
    if (action === 'cancel') useBibleStore.getState().cancelDownload();
    else deleting = useBibleStore.getState().deleteTranslation('bsb');
    await flushAsyncWork();
    assert.equal(jobs.get(bookId)?.status, 'downloading');
    terminal.release.resolve();
    await downloading;
    if (deleting) await deleting;
    await flushAsyncWork();
    assert.equal(jobs.has(bookId), false);
    assert.equal(translation('bsb')?.downloadedAudioBooks.includes('PHM'), false);
  });
}

test('same-book service callers cannot replace the first run during its terminal registry await', async () => {
  const terminal = gate();
  bookTerminalReadGate = terminal;
  const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await terminal.entered.promise;
  const firstRecord = jobs.get('audio-download:bsb:book:PHM');
  let secondStarted = false;
  const second = audio.downloadAudioBook({
    rootUri,
    translationId: 'bsb',
    book: getBookById('PHM')!,
    fileSystem,
    jobStore,
    resolveRemoteAudio: async () => ({ url: 'https://fixture.invalid/chapter.mp3', duration: 10 }),
    hooks: {
      onStart: () => {
        secondStarted = true;
      },
      onReattach: () => {
        secondStarted = true;
      },
    },
  });
  await flushAsyncWork();
  const ranBeforeTerminal = secondStarted;
  const duringTerminal = jobs.get('audio-download:bsb:book:PHM');
  terminal.release.resolve();
  await Promise.all([first, second]);
  assert.equal(ranBeforeTerminal, false);
  assert.equal(duringTerminal, firstRecord);
  assert.notEqual(jobs.get('audio-download:bsb:book:PHM')?.runId, firstRecord?.runId);
  assert.equal(jobs.get('audio-download:bsb:book:PHM')?.parentRunId, undefined);
});

test('collection cleanup with opposite child settlement order admits queued standalone books without lock inversion', async () => {
  const phm = { ...gate(), aborted: deferred() };
  const jude = { ...gate(), aborted: deferred() };
  transferGatesByBook.set('PHM', phm);
  transferGatesByBook.set('JUD', jude);
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM', 'JUD']);
  await Promise.all([phm.entered.promise, jude.entered.promise]);
  const nextPhm = { ...gate(), aborted: deferred() };
  const nextJude = { ...gate(), aborted: deferred() };
  transferGatesByBook.set('PHM', nextPhm);
  transferGatesByBook.set('JUD', nextJude);
  const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  const second = useBibleStore.getState().downloadAudioForBook('bsb', 'JUD');
  await flushAsyncWork();
  progressHandlers.get('PHM')?.({ bytesDownloaded: 2048, bytesTotal: 4096 });
  useBibleStore.getState().cancelDownload();
  phm.release.resolve();
  jude.release.resolve();
  await collection;
  await Promise.all([nextPhm.entered.promise, nextJude.entered.promise]);
  nextPhm.release.resolve();
  nextJude.release.resolve();
  await Promise.all([first, second]);
  await flushAsyncWork();
  assert.equal(stoppedNativeTasks.length, 0);
  for (const book of ['PHM', 'JUD']) {
    const record = jobs.get(`audio-download:bsb:book:${book}`);
    assert.equal(record?.status, 'completed');
    assert.equal(record?.parentRunId, undefined);
  }
  assert.equal(jobs.has('audio-download:bsb:translation:all'), false);
});

test('cold collection Cancel before discovery drains owners then cancels its persisted native task', async () => {
  const parent = seedRecoveryJob('translation');
  const child = await addRecoveryBook('bsb', 'PHM', parent.runId);
  const taskId = `${child.id}:PHM:1`;
  nativeTasks.add(taskId);
  const loading = gate();
  setupGate = loading;
  const recovery = useBibleStore.getState().reattachAudioDownloads();
  await loading.entered.promise;
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  assert.ok(jobs.has(parent.id), 'initial recovery has not removed collection scope metadata');
  assert.equal(stoppedNativeTasks.length, 0, 'cleanup waits for the captured recovery owner');
  loading.release.resolve();
  await recovery;
  await flushAsyncWork();
  assert.deepEqual(reattachedJobIds, []);
  assert.deepEqual(stoppedNativeTasks, [taskId]);
  assert.equal(jobs.has(parent.id), false);
  assert.equal(jobs.has(child.id), false);
});

for (const abortWaiter of [false, true]) {
  test(`a same-book caller queued before Cancel ${abortWaiter ? 'can abort its cleanup wait' : 'cannot admit before cleanup'}`, async () => {
    const terminal = gate();
    bookTerminalReadGate = terminal;
    const first = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
    await terminal.entered.promise;
    const waiter = new AbortController();
    let started = false;
    let settled = false;
    const second = audio
      .downloadAudioBook({
        rootUri,
        translationId: 'bsb',
        book: getBookById('PHM')!,
        fileSystem,
        jobStore,
        signal: waiter.signal,
        resolveRemoteAudio: async () => ({
          url: 'https://fixture.invalid/chapter.mp3',
          duration: 10,
        }),
        hooks: {
          onStart: () => {
            started = true;
          },
          onReattach: () => {
            started = true;
          },
        },
      })
      .then(
        () => {
          settled = true;
        },
        (error: unknown) => {
          assert.ok(abortWaiter && audio.isAudioDownloadCancellation(error));
          settled = true;
        }
      );
    await flushAsyncWork();
    const cleanup = gate();
    cancellationGate = cleanup;
    useBibleStore.getState().cancelDownload();
    terminal.release.resolve();
    await first;
    await cleanup.entered.promise;
    if (abortWaiter) waiter.abort();
    await flushAsyncWork();
    const duringCleanup = { started, settled };
    cleanup.release.resolve();
    await second;
    await flushAsyncWork();
    assert.equal(duringCleanup.started, false);
    assert.equal(duringCleanup.settled, abortWaiter);
    const final = jobs.get('audio-download:bsb:book:PHM');
    assert.equal(final?.status, abortWaiter ? undefined : 'completed');
    assert.equal(final?.parentRunId, undefined);
  });
}

test('natural same-book standalone banner Cancel preserves the collection still running another book', async () => {
  const jude = { ...gate(), aborted: deferred() };
  transferGatesByBook.set('JUD', jude);
  const collection = useBibleStore.getState().downloadAudioForBooks('bsb', ['PHM', 'JUD']);
  await jude.entered.promise;
  await flushAsyncWork();
  assert.equal(jobs.get('audio-download:bsb:book:PHM')?.status, 'completed');
  const terminal = gate();
  bookTerminalReadGate = terminal;
  const standalone = useBibleStore.getState().downloadAudioForBook('bsb', 'PHM');
  await terminal.entered.promise;
  const bookId = 'audio-download:bsb:book:PHM';
  const parentId = 'audio-download:bsb:translation:all';
  assert.equal(useBibleStore.getState().downloadProgress?.jobId, bookId);
  assert.equal(translation('bsb')?.activeDownloadJob?.id, bookId);
  let parentAborted = false;
  jude.aborted.promise.then(() => {
    parentAborted = true;
  });
  useBibleStore.getState().cancelDownload();
  terminal.release.resolve();
  await standalone;
  await flushAsyncWork();
  const parentStillRunning = jobs.get(parentId)?.status;
  const parentWasAborted = parentAborted;
  const stoppedJude = stoppedNativeTasks.some((id) => id.includes(':book:JUD:'));
  jude.release.resolve();
  await collection;
  assert.equal(parentWasAborted, false);
  assert.equal(parentStillRunning, 'downloading');
  assert.equal(stoppedJude, false);
  assert.equal(jobs.get(parentId)?.status, 'completed');
  assert.deepEqual(translation('bsb')?.downloadedAudioBooks.slice().sort(), ['JUD', 'PHM']);
});
