import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getBookById } from '../../constants/books';
import * as service from './audioDownloadService';
import * as jobStoreModule from './audioDownloadJobStore';
import type * as storage from './audioDownloadStorage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

type DownloadOptions = NonNullable<Parameters<service.AudioFileSystemAdapter['downloadFile']>[2]>;

function bookRuntime() {
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
  const progress: number[] = [];
  const failures: Error[] = [];
  let completed = 0;
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    downloadFile: async () => {},
  };
  const start = (signal?: AbortSignal) =>
    service.downloadAudioBook({
      translationId: 'bsb',
      book: getBookById('PHM')!,
      fileSystem,
      jobStore,
      signal,
      resolveRemoteAudio: async () => ({ url: 'https://audio.test/PHM/1.mp3', duration: 10 }),
      hooks: {
        onProgress: (event) => progress.push(event.progress),
        onFailure: (_job, error) => failures.push(error),
        onComplete: () => {
          completed += 1;
        },
      },
    });
  return { jobs, progress, failures, fileSystem, start, completed: () => completed };
}

test('inactivity aborts the attempt, waits for transport stop, and ignores late progress before retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = bookRuntime();
  const stop = deferred<void>();
  const attempts: DownloadOptions[] = [];
  runtime.fileSystem.downloadFile = async (_from, _to, options) => {
    attempts.push(options!);
    if (attempts.length === 1) await stop.promise;
  };
  const result = runtime.start();
  await flush();
  attempts[0].onProgress?.({ bytesDownloaded: 10, bytesTotal: 100 });
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(attempts[0].signal?.aborted, true);
  const beforeLateProgress = [...runtime.progress];
  attempts[0].onProgress?.({ bytesDownloaded: 90, bytesTotal: 100 });
  assert.deepEqual(runtime.progress, beforeLateProgress);
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(attempts.length, 1, 'retry must wait until the previous transport stops');
  stop.resolve();
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].signal, attempts[1].signal);
  await result;
  assert.equal(runtime.completed(), 1);
  const completedProgress = [...runtime.progress];
  attempts[0].onProgress?.({ bytesDownloaded: 5, bytesTotal: 100 });
  assert.deepEqual(runtime.progress, completedProgress);
});

test('stalled downloads stop after three settled attempts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = bookRuntime();
  let attempts = 0;
  runtime.fileSystem.downloadFile = async (_from, _to, options) => {
    attempts += 1;
    await new Promise<void>((resolve) =>
      options?.signal?.addEventListener('abort', () => resolve())
    );
  };
  const result = runtime.start();
  const rejected = assert.rejects(result, /stalled/);
  await flush();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    t.mock.timers.tick(60_000);
    await flush();
    if (attempt < 3) {
      t.mock.timers.tick(1000 * 2 ** (attempt - 1));
      await flush();
    }
  }
  await rejected;
  assert.equal(attempts, 3);
  assert.equal(runtime.failures.length, 1);
});

test('cancellation never reports a chapter complete, even if a transport resolves after abort', async () => {
  const runtime = bookRuntime();
  const controller = new AbortController();
  runtime.fileSystem.downloadFile = async (_from, _to, options) => {
    options?.onProgress?.({ bytesDownloaded: 100, bytesTotal: 100 });
    controller.abort();
  };
  await assert.rejects(runtime.start(controller.signal), /cancelled/);
  assert.equal(runtime.progress.includes(100), false);
  assert.equal(runtime.completed(), 0);
  assert.equal(runtime.failures.length, 0);
  assert.equal(runtime.jobs.size, 0);
});

test('directory failure marks the job failed and releases its cancellation controller', async (t) => {
  const runtime = bookRuntime();
  runtime.fileSystem.ensureDirectory = async () => {
    throw new Error('ENOSPC: mkdir');
  };
  await assert.rejects(runtime.start(), /ENOSPC/);
  assert.equal([...runtime.jobs.values()][0]?.status, 'failed');
  assert.equal(runtime.failures.length, 1);
  const abort = t.mock.method(AbortController.prototype, 'abort');
  service.requestAudioDownloadCancellation('audio-download:bsb:book:PHM');
  assert.equal(abort.mock.callCount(), 0);
});

test('cancelling during a cached-file lookup does not report chapter completion', async () => {
  const runtime = bookRuntime();
  const controller = new AbortController();
  runtime.fileSystem.fileExists = async () => {
    controller.abort();
    return true;
  };
  await assert.rejects(runtime.start(controller.signal), /cancelled/);
  assert.equal(runtime.progress.includes(100), false);
  assert.equal(runtime.completed(), 0);
});

test('a resolved transfer with a truncated file never completes the book', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = bookRuntime();
  let attempts = 0;
  runtime.fileSystem.getFileSize = async () => (attempts === 0 ? null : 12);
  runtime.fileSystem.downloadFile = async () => {
    attempts += 1;
  };
  const rejected = assert.rejects(runtime.start(), /missing or incomplete/);
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  t.mock.timers.tick(2000);
  await rejected;
  assert.equal(attempts, 3);
  assert.equal(runtime.completed(), 0);
  assert.equal(runtime.progress.includes(100), false);
});

function storageRuntime() {
  const stop = deferred<void>();
  const cancel = deferred<void>();
  const transfer = deferred<{ status: number } | undefined>();
  const calls = {
    fallback: 0,
    resumable: 0,
    cancel: 0,
    stop: 0,
    deleted: 0,
    completed: 0,
    started: 0,
  };
  let expoProgress:
    | ((event: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void)
    | undefined;
  let nativeProgress:
    | ((event: { bytesDownloaded: number; bytesTotal: number }) => void)
    | undefined;
  let done: (() => void) | undefined;
  let error: ((event: { error: string }) => void) | undefined;
  const task = {
    progress: (callback: typeof nativeProgress) => {
      nativeProgress = callback;
      return task;
    },
    done: (callback: typeof done) => {
      done = callback;
      return task;
    },
    error: (callback: typeof error) => {
      error = callback;
      return task;
    },
    start: () => {
      calls.started += 1;
    },
    stop: () => {
      calls.stop += 1;
      return stop.promise;
    },
  };
  const dependencies: Record<string, unknown> = {
    './audioDownloadService': service,
    './audioDownloadJobStore': jobStoreModule,
    'expo-file-system/legacy': {
      documentDirectory: 'file:///test/',
      getInfoAsync: async () => ({ exists: true, size: 5000 }),
      deleteAsync: async () => {
        calls.deleted += 1;
      },
      downloadAsync: async () => {
        calls.fallback += 1;
        return transfer.promise;
      },
      createDownloadResumable: (
        _from: string,
        _to: string,
        _options: unknown,
        progress: typeof expoProgress
      ) => {
        calls.resumable += 1;
        expoProgress = progress;
        return {
          downloadAsync: () => transfer.promise,
          cancelAsync: () => {
            calls.cancel += 1;
            return cancel.promise;
          },
        };
      },
    },
    '@kesha-antonov/react-native-background-downloader': {
      createDownloadTask: () => task,
      completeHandler: () => {
        calls.completed += 1;
      },
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL('./audioDownloadStorage.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Error,
    console,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      return dependencies[name];
    },
  });
  return {
    ...(exports as typeof storage),
    calls,
    stop,
    cancel,
    transfer,
    progress: (bytes: number) => {
      expoProgress?.({ totalBytesWritten: bytes, totalBytesExpectedToWrite: 100 });
      nativeProgress?.({ bytesDownloaded: bytes, bytesTotal: 100 });
    },
    done: () => done?.(),
    error: () => error?.({ error: 'Native failed' }),
  };
}

test('Expo fallback reports activity past 60 seconds and validates a completed download', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = storageRuntime();
  const progress: number[] = [];
  const result = runtime.expoAudioFileSystemAdapter.downloadFile(
    'https://audio.test/1',
    'file:///1',
    {
      onProgress: (event) => progress.push(event.bytesDownloaded),
    }
  );
  const outcome = result.catch((error: unknown) => error);
  for (const bytes of [10, 20, 30]) {
    t.mock.timers.tick(30_000);
    runtime.progress(bytes);
    await flush();
  }
  runtime.transfer.resolve({ status: 200 });
  assert.equal(await outcome, undefined);
  assert.equal(runtime.calls.resumable, 1);
  assert.deepEqual(progress, [10, 20, 30]);
  assert.equal(runtime.calls.deleted, 0);
});

test('Expo cancellation awaits native cancellation and preserves the partial file', async () => {
  const runtime = storageRuntime();
  const controller = new AbortController();
  let settled = false;
  const result = runtime.expoAudioFileSystemAdapter.downloadFile(
    'https://audio.test/1',
    'file:///1',
    { signal: controller.signal }
  );
  const rejected = assert.rejects(result, /cancelled/).then(() => {
    settled = true;
  });
  controller.abort();
  await flush();
  assert.equal(runtime.calls.cancel, 1);
  assert.equal(settled, false);
  runtime.cancel.resolve();
  await rejected;
  assert.equal(runtime.calls.deleted, 0);
});

test('native cancellation awaits stop, ignores late callbacks, and never starts fallback', async () => {
  const runtime = storageRuntime();
  const transport = await runtime.createBackgroundAudioDownloadTransport();
  const controller = new AbortController();
  const progress: number[] = [];
  let settled = false;
  const result = transport.downloadFile('https://audio.test/1', 'file:///1', {
    taskId: 'chapter-1',
    signal: controller.signal,
    onProgress: (event) => progress.push(event.bytesDownloaded),
  });
  const rejected = assert.rejects(result, /cancelled/).then(() => {
    settled = true;
  });
  controller.abort();
  runtime.progress(100);
  runtime.done();
  runtime.error();
  await flush();
  assert.equal(runtime.calls.stop, 1);
  assert.equal(settled, false);
  runtime.stop.resolve();
  await rejected;
  assert.deepEqual(progress, []);
  assert.equal(runtime.calls.completed, 0);
  assert.equal(runtime.calls.resumable + runtime.calls.fallback, 0);
});

test('native stop failure is terminal and does not start a retry or fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = storageRuntime();
  const book = bookRuntime();
  book.fileSystem.downloadFile = (
    await runtime.createBackgroundAudioDownloadTransport()
  ).downloadFile;
  const result = book.start();
  const rejected = assert.rejects(result, /stop failed/i);
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(runtime.calls.stop, 1);
  runtime.stop.reject(new Error('stop failed'));
  await flush();
  t.mock.timers.tick(3000);
  await rejected;
  assert.equal(runtime.calls.started, 1);
  assert.equal(runtime.calls.resumable + runtime.calls.fallback, 0);
});

test('Expo cancel failure is terminal without retrying or deleting a possibly live file', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = storageRuntime();
  const book = bookRuntime();
  book.fileSystem.downloadFile = runtime.expoAudioFileSystemAdapter.downloadFile;
  const rejected = assert.rejects(book.start(), /stop failed/i);
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(runtime.calls.cancel, 1);
  runtime.cancel.reject(new Error('cancel failed'));
  await rejected;
  assert.equal(runtime.calls.resumable, 1);
  assert.equal(runtime.calls.deleted, 0);
});
