import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookById } from '../../constants/books';
import * as service from './audioDownloadService';

async function flush() {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
}

const BOOK_IDS = ['PHM', 'JUD', '2JN', '3JN'] as const;

function collectionRuntime({
  freeDiskBytes,
  bookIds = [...BOOK_IDS],
}: { freeDiskBytes?: number | null; bookIds?: string[] } = {}) {
  const jobs = new Map<string, service.AudioDownloadJobRecord>();
  const jobStore: service.AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (id) => jobs.get(id) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (id) => {
      jobs.delete(id);
    },
  };
  const started: string[] = [];
  const startedJobIds: string[] = [];
  const progressEvents: service.AudioDownloadBookProgress[] = [];
  const inFlight = new Map<string, AbortSignal>();
  const release = new Map<string, () => void>();

  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    downloadFile: async (_from, _to, options) => {
      const key = `${options?.bookId}:${options?.chapter}`;
      started.push(String(options?.bookId));
      inFlight.set(key, options!.signal!);
      await new Promise<void>((resolve) => {
        release.set(key, resolve);
        options?.signal?.addEventListener('abort', () => resolve());
      });
      if (options?.signal?.aborted) throw new service.AudioDownloadCancelledError();
    },
  };
  if (freeDiskBytes !== undefined) {
    fileSystem.getFreeDiskBytes = async () => freeDiskBytes;
  }

  const start = () =>
    service.downloadAudioTranslation({
      translationId: 'bsb',
      books: bookIds.map((id) => getBookById(id)!),
      fileSystem,
      jobStore,
      resolveRemoteAudio: async (_t, bookId, chapter) => ({
        url: `https://audio.test/${bookId}/${chapter}.mp3`,
        duration: 10,
      }),
      hooks: {
        onStart: (job) => startedJobIds.push(job.id),
        onProgress: (event) => progressEvents.push(event),
      },
    });

  return { jobs, started, startedJobIds, progressEvents, inFlight, release, fileSystem, start };
}

test('cancelling a translation audio download stops books that have not started yet', async () => {
  const runtime = collectionRuntime();
  const rejected = assert.rejects(runtime.start(), /cancelled/);
  await flush();

  // Book concurrency is 2, so exactly the first two books are in flight here.
  assert.deepEqual(runtime.started, ['PHM', 'JUD']);

  service.requestAudioDownloadCancellation('audio-download:bsb:translation:all');
  await rejected;

  assert.deepEqual(runtime.started, ['PHM', 'JUD'], 'no further book may start after cancellation');
  for (const signal of runtime.inFlight.values()) {
    assert.equal(signal.aborted, true, 'every in-flight chapter signal must be aborted');
  }
});

test('a nested book job registers its own cancellation controller during a translation download', async () => {
  const runtime = collectionRuntime();
  const rejected = assert.rejects(runtime.start(), /cancelled/);
  await flush();

  service.requestAudioDownloadCancellation('audio-download:bsb:book:PHM');
  await flush();
  assert.equal(runtime.inFlight.get('PHM:1')?.aborted, true);

  service.requestAudioDownloadCancellation('audio-download:bsb:translation:all');
  await rejected;
});

test('book-scope lifecycle hooks never overwrite the translation job id mid-collection', async () => {
  const runtime = collectionRuntime();
  const rejected = assert.rejects(runtime.start(), /cancelled/);
  await flush();

  assert.deepEqual(
    runtime.startedJobIds,
    ['audio-download:bsb:translation:all'],
    'only the translation-scope job may surface through onStart during a collection download'
  );

  service.requestAudioDownloadCancellation('audio-download:bsb:translation:all');
  await rejected;
});

test('translation-scope downloads report aggregate chapter progress instead of staying at zero', async () => {
  const runtime = collectionRuntime({ bookIds: ['PHM', 'JUD'] });
  const rejected = assert.rejects(runtime.start(), /cancelled/);
  await flush();

  runtime.release.get('PHM:1')?.();
  await flush();

  const aggregate = runtime.progressEvents.at(-1);
  assert.ok(aggregate, 'a translation-scope download must emit progress before a book finishes');
  assert.equal(aggregate.jobId, 'audio-download:bsb:translation:all');
  assert.equal(aggregate.totalChapters, 2);
  assert.equal(aggregate.completedChapters, 1);
  assert.equal(aggregate.progress, 50);

  service.requestAudioDownloadCancellation('audio-download:bsb:translation:all');
  await rejected;
});

test('a translation download refuses to start when the device lacks free space', async () => {
  const runtime = collectionRuntime({ freeDiskBytes: 1024 });

  await assert.rejects(runtime.start(), (error: unknown) => {
    assert.ok(error instanceof service.AudioDownloadInsufficientSpaceError);
    assert.match(error.message, /space/i);
    return true;
  });

  assert.deepEqual(runtime.started, [], 'no chapter may be requested when the preflight fails');
  assert.equal(runtime.jobs.size, 0, 'a refused download must not leave a persisted job behind');
});

test('a translation download proceeds when free space clears the estimate', async () => {
  const runtime = collectionRuntime({ freeDiskBytes: 8 * 1024 * 1024 * 1024, bookIds: ['PHM'] });
  const rejected = assert.rejects(runtime.start(), /cancelled/);
  await flush();
  assert.deepEqual(runtime.started, ['PHM']);
  service.requestAudioDownloadCancellation('audio-download:bsb:translation:all');
  await rejected;
});

test('native task ids match the job they belong to across both download scopes', () => {
  const translationJobId = 'audio-download:bsb:translation:all';
  const bookJobId = 'audio-download:bsb:book:PHM';

  // Chapter tasks always run under a BOOK job id, even inside a translation download.
  assert.equal(
    service.audioDownloadTaskIdMatchesJob(`${bookJobId}:PHM:1`, translationJobId),
    true,
    'cancelling a translation job must match the book-scoped task ids it spawned'
  );
  assert.equal(service.audioDownloadTaskIdMatchesJob(`${bookJobId}:PHM:1`, bookJobId), true);
  assert.equal(service.audioDownloadTaskIdMatchesJob(bookJobId, bookJobId), true);
  assert.equal(
    service.audioDownloadTaskIdMatchesJob('audio-download:web:book:PHM:PHM:1', translationJobId),
    false,
    'a different translation must never be cancelled'
  );
  assert.equal(
    service.audioDownloadTaskIdMatchesJob('audio-download:bsb:book:JUD:JUD:1', bookJobId),
    false,
    'a book-scope cancel must not stop another book of the same translation'
  );
});
