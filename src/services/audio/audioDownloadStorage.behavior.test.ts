import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';
import type { AudioDownloadJobRecord, AudioFileSystemAdapter } from './audioDownloadService';

// ---------------------------------------------------------------------------
// In-memory expo-file-system
//
// A flat uri -> size/contents map plus a scripted `createDownloadResumable`.
// Every call is recorded so the adapter's argument passing (idempotent deletes,
// intermediate directories) can be asserted directly.
// ---------------------------------------------------------------------------

const DOCUMENT_DIRECTORY = 'file:///documents/';

interface FakeFile {
  size: number;
  contents?: string;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

const files = new Map<string, FakeFile>();
const directories = new Set<string>();
const fsCalls: RecordedCall[] = [];

interface DownloadScript {
  /** Progress ticks pushed before the download settles. */
  progress?: Array<{ totalBytesWritten: number; totalBytesExpectedToWrite: number }>;
  /** Held open so a test can abort mid-flight; never resolved means "hangs". */
  gate?: Promise<void>;
  error?: unknown;
  /** `null` models expo-file-system returning no result (a cancellation). */
  result?: { status: number } | null;
  /** Bytes the download leaves at the destination. */
  writeSize?: number;
  cancelError?: unknown;
}

let downloadScript: DownloadScript = {};
/** Scripted failure for `FileSystem.deleteAsync` (cleanup paths). */
let deleteError: unknown = null;
/** The progress callback expo-file-system handed the last download. */
let lastOnProgress:
  | ((progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void)
  | undefined;
const downloadCalls: Array<{ from: string; to: string }> = [];
const cancelCalls: string[] = [];

const createDownloadResumable = (
  from: string,
  to: string,
  _options: unknown,
  onProgress?: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void
) => {
  downloadCalls.push({ from, to });
  lastOnProgress = onProgress;
  const script = downloadScript;
  return {
    downloadAsync: async (): Promise<{ status: number } | null> => {
      for (const tick of script.progress ?? []) {
        onProgress?.(tick);
      }
      if (script.gate) {
        await script.gate;
      }
      if (script.error) {
        throw script.error;
      }
      if (script.writeSize != null) {
        files.set(to, { size: script.writeSize });
      }
      return script.result === undefined ? { status: 200 } : script.result;
    },
    cancelAsync: async (): Promise<void> => {
      cancelCalls.push(to);
      if (script.cancelError) {
        throw script.cancelError;
      }
    },
  };
};

mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: DOCUMENT_DIRECTORY,
  cacheDirectory: 'file:///caches/',
  makeDirectoryAsync: async (uri: string, options?: unknown): Promise<void> => {
    fsCalls.push({ method: 'makeDirectoryAsync', args: [uri, options] });
    directories.add(uri);
  },
  getInfoAsync: async (uri: string): Promise<{ exists: boolean; size?: number }> => {
    fsCalls.push({ method: 'getInfoAsync', args: [uri] });
    const file = files.get(uri);
    return file ? { exists: true, size: file.size } : { exists: false };
  },
  deleteAsync: async (uri: string, options?: unknown): Promise<void> => {
    fsCalls.push({ method: 'deleteAsync', args: [uri, options] });
    if (deleteError) {
      throw deleteError;
    }
    files.delete(uri);
  },
  readAsStringAsync: async (uri: string): Promise<string> => {
    fsCalls.push({ method: 'readAsStringAsync', args: [uri] });
    const file = files.get(uri);
    if (!file || file.contents == null) {
      throw new Error(`ENOENT: ${uri}`);
    }
    return file.contents;
  },
  writeAsStringAsync: async (uri: string, contents: string): Promise<void> => {
    fsCalls.push({ method: 'writeAsStringAsync', args: [uri, contents] });
    files.set(uri, { size: contents.length, contents });
  },
  createDownloadResumable,
});

// ---------------------------------------------------------------------------
// Background downloader double
// ---------------------------------------------------------------------------

interface FakeTask {
  id: string;
  progress: (
    handler: (progress: { bytesDownloaded: number; bytesTotal: number }) => void
  ) => FakeTask;
  done: (handler: () => void) => FakeTask;
  error: (handler: (payload: { error: string }) => void) => FakeTask;
  start: () => void;
  stop: () => Promise<void>;
  resume: () => void;
}

interface TaskScript {
  progress?: Array<{ bytesDownloaded: number; bytesTotal: number }>;
  /** 'done' | 'error' | 'hang' — how the native task settles once started. */
  outcome?: 'done' | 'error' | 'hang';
  errorMessage?: string;
  stopError?: unknown;
}

let taskScript: TaskScript = { outcome: 'done' };
const backgroundCalls: RecordedCall[] = [];
let existingTasks: FakeTask[] = [];

const makeTask = (id: string): FakeTask => {
  let onDone: (() => void) | null = null;
  let onError: ((payload: { error: string }) => void) | null = null;
  let onProgress: ((progress: { bytesDownloaded: number; bytesTotal: number }) => void) | null =
    null;
  const script = taskScript;
  const task: FakeTask = {
    id,
    progress: (handler) => {
      onProgress = handler;
      return task;
    },
    done: (handler) => {
      onDone = handler;
      return task;
    },
    error: (handler) => {
      onError = handler;
      return task;
    },
    start: () => {
      backgroundCalls.push({ method: 'start', args: [id] });
      for (const tick of script.progress ?? []) {
        onProgress?.(tick);
      }
      if (script.outcome === 'error') {
        onError?.({ error: script.errorMessage ?? 'native download failed' });
        return;
      }
      if (script.outcome === 'done') {
        onDone?.();
      }
    },
    stop: async () => {
      backgroundCalls.push({ method: 'stop', args: [id] });
      if (script.stopError) {
        throw script.stopError;
      }
    },
    resume: () => {
      backgroundCalls.push({ method: 'resume', args: [id] });
    },
  };
  return task;
};

let ensureDownloadsAreRunningError: unknown = null;

mockModule(mock, '@kesha-antonov/react-native-background-downloader', {
  createDownloadTask: (options: { id: string; url: string; destination: string }) => {
    backgroundCalls.push({ method: 'createDownloadTask', args: [options] });
    return makeTask(options.id);
  },
  completeHandler: (taskId: string) => {
    backgroundCalls.push({ method: 'completeHandler', args: [taskId] });
  },
  getExistingDownloadTasks: async (): Promise<FakeTask[]> => {
    backgroundCalls.push({ method: 'getExistingDownloadTasks', args: [] });
    return existingTasks;
  },
  ensureDownloadsAreRunning: async (): Promise<void> => {
    backgroundCalls.push({ method: 'ensureDownloadsAreRunning', args: [] });
    if (ensureDownloadsAreRunningError) {
      throw ensureDownloadsAreRunningError;
    }
  },
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type StorageModule = typeof import('./audioDownloadStorage');
type ServiceModule = typeof import('./audioDownloadService');

let mod: StorageModule;
let service: ServiceModule;

const warnings: unknown[][] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args);
};

const VALID_AUDIO_BYTES = 4_096;

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const fsMethods = () => fsCalls.map((call) => call.method);

before(async () => {
  mod = await import('./audioDownloadStorage');
  service = await import('./audioDownloadService');
});

beforeEach(() => {
  files.clear();
  directories.clear();
  fsCalls.length = 0;
  downloadCalls.length = 0;
  cancelCalls.length = 0;
  backgroundCalls.length = 0;
  warnings.length = 0;
  existingTasks = [];
  downloadScript = { writeSize: VALID_AUDIO_BYTES };
  taskScript = { outcome: 'done' };
  ensureDownloadsAreRunningError = null;
  deleteError = null;
  lastOnProgress = undefined;
});

test.after(() => {
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

test('downloaded audio lives under the app document directory', () => {
  assert.equal(mod.AUDIO_DOWNLOAD_ROOT_URI, `${DOCUMENT_DIRECTORY}everybible-audio/`);
});

test('the job registry sits at the root of the audio download directory', () => {
  assert.equal(mod.AUDIO_DOWNLOAD_JOB_REGISTRY_FILENAME, 'download-jobs.json');
  assert.equal(
    mod.getAudioDownloadJobRegistryUri(),
    `${DOCUMENT_DIRECTORY}everybible-audio/download-jobs.json`
  );
});

test('the job registry uri honours an explicit root', () => {
  assert.equal(
    mod.getAudioDownloadJobRegistryUri('file:///elsewhere/'),
    'file:///elsewhere/download-jobs.json'
  );
});

// ---------------------------------------------------------------------------
// expoAudioFileSystemAdapter: directories, existence and size
// ---------------------------------------------------------------------------

test('ensureDirectory creates the whole path, not just the leaf', async () => {
  await mod.expoAudioFileSystemAdapter.ensureDirectory('file:///documents/everybible-audio/bsb/');

  assert.deepEqual(fsCalls, [
    {
      method: 'makeDirectoryAsync',
      args: ['file:///documents/everybible-audio/bsb/', { intermediates: true }],
    },
  ]);
});

test('fileExists reports what the file system holds', async () => {
  files.set('file:///documents/a.m4a', { size: 10 });

  assert.equal(await mod.expoAudioFileSystemAdapter.fileExists('file:///documents/a.m4a'), true);
  assert.equal(await mod.expoAudioFileSystemAdapter.fileExists('file:///documents/b.m4a'), false);
});

test('getFileSize returns the byte count for a file that exists', async () => {
  files.set('file:///documents/a.m4a', { size: 2_048 });

  assert.equal(
    await mod.expoAudioFileSystemAdapter.getFileSize?.('file:///documents/a.m4a'),
    2_048
  );
});

test('getFileSize returns null for a file that is not there', async () => {
  assert.equal(
    await mod.expoAudioFileSystemAdapter.getFileSize?.('file:///documents/gone.m4a'),
    null
  );
});

test('deleteFile deletes idempotently so a missing file is not an error', async () => {
  files.set('file:///documents/a.m4a', { size: 10 });

  await mod.expoAudioFileSystemAdapter.deleteFile?.('file:///documents/a.m4a');

  assert.deepEqual(fsCalls, [
    { method: 'deleteAsync', args: ['file:///documents/a.m4a', { idempotent: true }] },
  ]);
  assert.equal(files.has('file:///documents/a.m4a'), false);
});

test('getFileSize reports an empty file as zero bytes rather than as missing', async () => {
  files.set('file:///documents/empty.m4a', { size: 0 });

  assert.equal(
    await mod.expoAudioFileSystemAdapter.getFileSize?.('file:///documents/empty.m4a'),
    0
  );
});

test('a file system delete failure is surfaced to the caller', async () => {
  files.set('file:///documents/a.m4a', { size: 10 });
  deleteError = new Error('EPERM');

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.deleteFile?.('file:///documents/a.m4a') ?? Promise.resolve(),
    /EPERM/
  );
});

// ---------------------------------------------------------------------------
// expoAudioFileSystemAdapter: text files
// ---------------------------------------------------------------------------

test('writeTextFile then readTextFile round-trips the registry contents', async () => {
  await mod.expoAudioFileSystemAdapter.writeTextFile?.(
    'file:///documents/jobs.json',
    '{"jobs":[]}'
  );

  assert.equal(
    await mod.expoAudioFileSystemAdapter.readTextFile?.('file:///documents/jobs.json'),
    '{"jobs":[]}'
  );
});

test('readTextFile returns null instead of throwing when the file is missing', async () => {
  assert.equal(
    await mod.expoAudioFileSystemAdapter.readTextFile?.('file:///documents/nope.json'),
    null
  );
});

// ---------------------------------------------------------------------------
// expoAudioFileSystemAdapter: downloads
// ---------------------------------------------------------------------------

test('downloadFile reports progress and leaves a validated file behind', async () => {
  const progress: Array<{ bytesDownloaded: number; bytesTotal: number }> = [];
  downloadScript = {
    progress: [
      { totalBytesWritten: 1_000, totalBytesExpectedToWrite: 4_096 },
      { totalBytesWritten: 4_096, totalBytesExpectedToWrite: 4_096 },
    ],
    writeSize: VALID_AUDIO_BYTES,
  };

  await mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { onProgress: (update) => progress.push(update) }
  );

  assert.deepEqual(downloadCalls, [
    {
      from: 'https://media.test/GEN/1.m4a',
      to: 'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    },
  ]);
  assert.deepEqual(progress, [
    { bytesDownloaded: 1_000, bytesTotal: 4_096 },
    { bytesDownloaded: 4_096, bytesTotal: 4_096 },
  ]);
  assert.equal(fsMethods().includes('deleteAsync'), false);
});

test('downloadFile deletes and rejects when the server answered with an error status', async () => {
  downloadScript = { result: { status: 404 }, writeSize: VALID_AUDIO_BYTES };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /HTTP 404/
  );

  assert.equal(files.has('file:///documents/everybible-audio/bsb/GEN/1.m4a'), false);
});

test('downloadFile deletes and rejects when an error page was saved as audio', async () => {
  downloadScript = { writeSize: 120 };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /too small \(120 bytes\)/
  );

  assert.equal(files.has('file:///documents/everybible-audio/bsb/GEN/1.m4a'), false);
});

test('downloadFile treats an empty download result as a cancellation', async () => {
  downloadScript = { result: null };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    (error: unknown) => service.isAudioDownloadCancellation(error)
  );
});

test('downloadFile surfaces a native download error after deleting the partial file', async () => {
  downloadScript = { error: new Error('connection reset') };
  files.set('file:///documents/everybible-audio/bsb/GEN/1.m4a', { size: 12 });

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /connection reset/
  );

  assert.equal(files.has('file:///documents/everybible-audio/bsb/GEN/1.m4a'), false);
});

test('a download that leaves no file behind is rejected as zero bytes', async () => {
  downloadScript = { result: { status: 200 } };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /too small \(0 bytes\)/
  );
});

test('a cleanup delete that fails is surfaced instead of the original download error', async () => {
  downloadScript = { error: new Error('connection reset') };
  deleteError = new Error('EPERM');

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /EPERM/
  );
});

test('progress reported after the download settled is ignored', async () => {
  const progress: Array<{ bytesDownloaded: number; bytesTotal: number }> = [];

  await mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { onProgress: (update) => progress.push(update) }
  );
  const reportedWhileRunning = progress.length;

  lastOnProgress?.({ totalBytesWritten: 999, totalBytesExpectedToWrite: 999 });

  assert.equal(progress.length, reportedWhileRunning);
});

test('downloadFile refuses an already-aborted request without touching the file system', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a',
        { signal: controller.signal }
      ),
    (error: unknown) => service.isAudioDownloadCancellation(error)
  );

  assert.deepEqual(downloadCalls, []);
  assert.deepEqual(fsCalls, []);
});

test('downloadFile cancels the native download when the request is aborted mid-flight', async () => {
  downloadScript = { gate: new Promise<void>(() => {}) };
  const controller = new AbortController();

  const pending = mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
  assert.deepEqual(cancelCalls, ['file:///documents/everybible-audio/bsb/GEN/1.m4a']);
});

test('a native cancel that fails is reported as a stop error so the path is not reused', async () => {
  downloadScript = {
    gate: new Promise<void>(() => {}),
    cancelError: new Error('native cancel exploded'),
  };
  const controller = new AbortController();

  const pending = mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof service.AudioDownloadStopError
  );
});

test('progress updates stop once the request has been aborted', async () => {
  const gate = { resolve: () => {}, promise: Promise.resolve() };
  gate.promise = new Promise<void>((resolve) => {
    gate.resolve = resolve;
  });
  const progress: Array<{ bytesDownloaded: number; bytesTotal: number }> = [];
  const controller = new AbortController();
  controller.abort();
  downloadScript = {
    progress: [{ totalBytesWritten: 10, totalBytesExpectedToWrite: 100 }],
    gate: gate.promise,
  };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a',
        { signal: controller.signal, onProgress: (update) => progress.push(update) }
      ),
    (error: unknown) => service.isAudioDownloadCancellation(error)
  );

  assert.deepEqual(progress, []);
});

// ---------------------------------------------------------------------------
// Background download transport
// ---------------------------------------------------------------------------

test('a chapter with a task id downloads through the background downloader', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  const progress: Array<{ bytesDownloaded: number; bytesTotal: number }> = [];
  taskScript = {
    outcome: 'done',
    progress: [{ bytesDownloaded: 2_000, bytesTotal: 4_096 }],
  };

  await transport.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    {
      taskId: 'job-1:GEN:1',
      translationId: 'bsb',
      bookId: 'GEN',
      chapter: 1,
      onProgress: (update) => progress.push(update),
    }
  );

  assert.deepEqual(backgroundCalls[0], {
    method: 'createDownloadTask',
    args: [
      {
        id: 'job-1:GEN:1',
        url: 'https://media.test/GEN/1.m4a',
        destination: 'file:///documents/everybible-audio/bsb/GEN/1.m4a',
        metadata: { translationId: 'bsb', bookId: 'GEN', chapter: '1' },
      },
    ],
  });
  assert.deepEqual(progress, [{ bytesDownloaded: 2_000, bytesTotal: 4_096 }]);
  assert.deepEqual(backgroundCalls.at(-1), {
    method: 'completeHandler',
    args: ['job-1:GEN:1'],
  });
  assert.deepEqual(downloadCalls, []);
});

test('the job id stands in as the task id when no explicit one is supplied', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();

  await transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a', {
    jobId: 'job-7',
  });

  assert.deepEqual((backgroundCalls[0].args[0] as { id: string }).id, 'job-7');
});

test('a chapter with no task id falls straight through to the file-system download', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();

  await transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a');

  assert.deepEqual(downloadCalls, [
    { from: 'https://media.test/GEN/1.m4a', to: 'file:///documents/a.m4a' },
  ]);
  assert.deepEqual(backgroundCalls, []);
});

test('a background task that errors falls back to the file-system download', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  taskScript = { outcome: 'error', errorMessage: 'native module not linked' };

  await transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a', {
    taskId: 'job-1:GEN:1',
  });

  assert.deepEqual(downloadCalls, [
    { from: 'https://media.test/GEN/1.m4a', to: 'file:///documents/a.m4a' },
  ]);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /Background downloader failed/);
});

test('an already-aborted background download is refused before a task is created', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a', {
        taskId: 'job-1:GEN:1',
        signal: controller.signal,
      }),
    (error: unknown) => service.isAudioDownloadCancellation(error)
  );

  assert.deepEqual(backgroundCalls, []);
});

test('aborting a running background download stops the native task and cancels', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  taskScript = { outcome: 'hang' };
  const controller = new AbortController();

  const pending = transport.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/a.m4a',
    { taskId: 'job-1:GEN:1', signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'stop'),
    [{ method: 'stop', args: ['job-1:GEN:1'] }]
  );
  assert.deepEqual(downloadCalls, []);
});

test('a native stop that fails is surfaced instead of being retried as a fallback download', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  taskScript = { outcome: 'hang', stopError: new Error('stop failed') };
  const controller = new AbortController();

  const pending = transport.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/a.m4a',
    { taskId: 'job-1:GEN:1', signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof service.AudioDownloadStopError
  );
  assert.deepEqual(downloadCalls, []);
});

test('reattaching a job resumes the exact task and its per-chapter children', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  existingTasks = [makeTask('job-1'), makeTask('job-1:GEN:2'), makeTask('job-2:GEN:1')];

  await transport.reattachJob?.('job-1');

  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'resume'),
    [
      { method: 'resume', args: ['job-1'] },
      { method: 'resume', args: ['job-1:GEN:2'] },
    ]
  );
});

test('cancelling a job stops the exact task and its per-chapter children', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  existingTasks = [makeTask('job-1'), makeTask('job-1:GEN:2'), makeTask('job-2:GEN:1')];

  await transport.cancelJob?.('job-1');

  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'stop'),
    [
      { method: 'stop', args: ['job-1'] },
      { method: 'stop', args: ['job-1:GEN:2'] },
    ]
  );
});

// ---------------------------------------------------------------------------
// Resuming background downloads on launch
// ---------------------------------------------------------------------------

test('ensuring background downloads are running asks the native downloader to resume', async () => {
  await mod.ensureBackgroundAudioDownloadsRunning();

  assert.deepEqual(backgroundCalls, [{ method: 'ensureDownloadsAreRunning', args: [] }]);
});

test('a native downloader that cannot resume never breaks startup', async () => {
  ensureDownloadsAreRunningError = new Error('no native module');

  await assert.doesNotReject(() => mod.ensureBackgroundAudioDownloadsRunning());
});

// ---------------------------------------------------------------------------
// Persistent job store
// ---------------------------------------------------------------------------

const jobRecord = (id: string): AudioDownloadJobRecord => ({
  id,
  translationId: 'bsb',
  scope: 'book',
  bookId: 'GEN',
  status: 'downloading',
  createdAt: 1,
  updatedAt: 2,
  attemptCount: 1,
});

test('the persistent job store writes the registry into the audio download root', async () => {
  const store = mod.createPersistentAudioDownloadJobStore({
    fileSystem: mod.expoAudioFileSystemAdapter,
  });

  await store.upsertJob(jobRecord('job-1'));

  const registry = files.get(`${DOCUMENT_DIRECTORY}everybible-audio/download-jobs.json`);
  assert.deepEqual(JSON.parse(registry?.contents ?? '{}'), {
    version: 1,
    jobs: [jobRecord('job-1')],
  });
  assert.deepEqual(await store.listJobs(), [jobRecord('job-1')]);
});

test('the persistent job store can be pointed at another root', async () => {
  const adapter: AudioFileSystemAdapter = { ...mod.expoAudioFileSystemAdapter };
  const store = mod.createPersistentAudioDownloadJobStore({
    fileSystem: adapter,
    rootUri: 'file:///elsewhere/',
  });

  await store.upsertJob(jobRecord('job-9'));

  assert.equal(files.has('file:///elsewhere/download-jobs.json'), true);
  assert.equal((await store.getJob('job-9')) !== null, true);

  await store.removeJob('job-9');
  assert.deepEqual(await store.listJobs(), []);
});
