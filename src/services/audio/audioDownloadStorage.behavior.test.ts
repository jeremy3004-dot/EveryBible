import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  result?: { status: number; headers?: Record<string, string> } | null;
  /** Bytes the download leaves at the destination. */
  writeSize?: number;
  /** Bytes written to the destination as soon as the transfer starts (a partial). */
  partialSize?: number;
  cancelError?: unknown;
  /** Held open so a test can observe that cancellation is awaited before the reject. */
  cancelGate?: Promise<void>;
}

let downloadScript: DownloadScript = {};
/** Scripted failure for `FileSystem.deleteAsync` (cleanup paths). */
let deleteError: unknown = null;
/** Runs inside every `getInfoAsync`, so a test can land an abort mid-validation. */
let onGetInfo: ((uri: string) => void) | null = null;
/** What `getFreeDiskStorageAsync` reports; an Error instance is thrown instead. */
let freeDiskStorage: number | Error = 0;
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
    downloadAsync: async (): Promise<{
      status: number;
      headers?: Record<string, string>;
    } | null> => {
      if (script.partialSize != null) {
        files.set(to, { size: script.partialSize });
      }
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
      if (script.cancelGate) {
        await script.cancelGate;
      }
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
    onGetInfo?.(uri);
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
  readAsStringAsync: async (
    uri: string,
    options?: { encoding?: string; position?: number; length?: number }
  ): Promise<string> => {
    fsCalls.push({ method: 'readAsStringAsync', args: options ? [uri, options] : [uri] });
    const file = files.get(uri);
    if (!file || file.contents == null) {
      throw new Error(`ENOENT: ${uri}`);
    }
    if (options?.position != null && options.length != null) {
      return file.contents.slice(options.position, options.position + options.length);
    }
    return file.contents;
  },
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getFreeDiskStorageAsync: async (): Promise<number> => {
    fsCalls.push({ method: 'getFreeDiskStorageAsync', args: [] });
    if (freeDiskStorage instanceof Error) {
      throw freeDiskStorage;
    }
    return freeDiskStorage;
  },
  writeAsStringAsync: async (uri: string, contents: string): Promise<void> => {
    fsCalls.push({ method: 'writeAsStringAsync', args: [uri, contents] });
    files.set(uri, { size: contents.length, contents });
  },
  moveAsync: async ({ from, to }: { from: string; to: string }): Promise<void> => {
    fsCalls.push({ method: 'moveAsync', args: [from, to] });
    const file = files.get(from);
    if (!file) throw new Error(`ENOENT: ${from}`);
    if (files.has(to)) throw new Error(`EEXIST: ${to}`);
    files.delete(from);
    files.set(to, file);
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

/** Handlers the last created native task registered, so late callbacks can be replayed. */
let lastTaskHandlers: {
  progress?: (progress: { bytesDownloaded: number; bytesTotal: number }) => void;
  done?: () => void;
  error?: (payload: { error: string }) => void;
} = {};

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
      lastTaskHandlers.progress = handler;
      return task;
    },
    done: (handler) => {
      onDone = handler;
      lastTaskHandlers.done = handler;
      return task;
    },
    error: (handler) => {
      onError = handler;
      lastTaskHandlers.error = handler;
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
      if (resumeErrors.has(id)) {
        throw new Error(`cannot resume ${id}`);
      }
    },
  };
  return task;
};

/** Task ids whose resume() throws, to prove one bad task does not stop the rest. */
const resumeErrors = new Set<string>();
/** Set to make the native task listing itself fail (no native module in Expo Go). */
let existingTasksError: unknown = null;

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
    if (existingTasksError) {
      throw existingTasksError;
    }
    return existingTasks;
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
  lastTaskHandlers = {};
  resumeErrors.clear();
  existingTasksError = null;
  deleteError = null;
  lastOnProgress = undefined;
  onGetInfo = null;
  freeDiskStorage = 0;
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
      to: 'file:///documents/everybible-audio/bsb/GEN/1.m4a.download',
    },
  ]);
  assert.deepEqual(progress, [
    { bytesDownloaded: 1_000, bytesTotal: 4_096 },
    { bytesDownloaded: 4_096, bytesTotal: 4_096 },
  ]);
  assert.deepEqual([...files.keys()], ['file:///documents/everybible-audio/bsb/GEN/1.m4a']);
});

// A download killed mid-transfer (app terminated) never reaches the final path, so
// playback and the next download run can never mistake a partial for a chapter.
test('downloadFile writes to a temporary file and moves it into place only when complete', async () => {
  downloadScript = { gate: new Promise<void>(() => {}) };

  void mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a'
  );
  await flush();

  assert.deepEqual(
    downloadCalls.map((call) => call.to),
    ['file:///documents/everybible-audio/bsb/GEN/1.m4a.download']
  );
  assert.equal(fsMethods().includes('moveAsync'), false);
});

test('a leftover partial from a killed download is cleared before downloading again', async () => {
  files.set('file:///documents/everybible-audio/bsb/GEN/1.m4a.download', { size: 2_000 });

  await mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a'
  );

  const methods = fsMethods();
  assert.ok(methods.indexOf('deleteAsync') < methods.indexOf('moveAsync'));
  assert.deepEqual(
    fsCalls.find((call) => call.method === 'deleteAsync')?.args[0],
    'file:///documents/everybible-audio/bsb/GEN/1.m4a.download'
  );
  assert.equal(
    files.get('file:///documents/everybible-audio/bsb/GEN/1.m4a')?.size,
    VALID_AUDIO_BYTES
  );
});

test('a completed download replaces an older file at the final path', async () => {
  files.set('file:///documents/everybible-audio/bsb/GEN/1.m4a', { size: 2_000 });

  await mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a'
  );

  assert.equal(
    files.get('file:///documents/everybible-audio/bsb/GEN/1.m4a')?.size,
    VALID_AUDIO_BYTES
  );
});

test('a download shorter than its Content-Length is discarded and never reaches the final path', async () => {
  downloadScript = {
    result: { status: 200, headers: { 'content-length': '8192' } },
    writeSize: VALID_AUDIO_BYTES,
  };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /incomplete \(4096 of 8192 bytes\)/
  );

  assert.deepEqual([...files.keys()], []);
});

test('a download shorter than the size it reported while running is discarded', async () => {
  downloadScript = {
    progress: [{ totalBytesWritten: 1_000, totalBytesExpectedToWrite: 9_000 }],
    writeSize: VALID_AUDIO_BYTES,
  };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /incomplete \(4096 of 9000 bytes\)/
  );

  assert.deepEqual([...files.keys()], []);
});

test('a download matching its Content-Length is kept', async () => {
  downloadScript = {
    result: { status: 200, headers: { 'Content-Length': String(VALID_AUDIO_BYTES) } },
    writeSize: VALID_AUDIO_BYTES,
  };

  await mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a'
  );

  assert.equal(
    files.get('file:///documents/everybible-audio/bsb/GEN/1.m4a')?.size,
    VALID_AUDIO_BYTES
  );
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
  downloadScript = { error: new Error('connection reset'), partialSize: 2_000 };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile(
        'https://media.test/GEN/1.m4a',
        'file:///documents/everybible-audio/bsb/GEN/1.m4a'
      ),
    /connection reset/
  );

  assert.deepEqual([...files.keys()], []);
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
  assert.deepEqual(cancelCalls, ['file:///documents/everybible-audio/bsb/GEN/1.m4a.download']);
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
    { from: 'https://media.test/GEN/1.m4a', to: 'file:///documents/a.m4a.download' },
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
    { from: 'https://media.test/GEN/1.m4a', to: 'file:///documents/a.m4a.download' },
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

// Fixture fidelity: the double above mirrors the real 4.5.4 export surface. A previous
// build guarded a call to `ensureDownloadsAreRunning`, which the package has never
// exported, so resume was a permanent silent no-op. Resume goes through
// `getExistingDownloadTasks` instead, and this keeps the double honest about that.
// Dependency contract guard: the installed downloader package must keep this export surface.
test('the background downloader package exports task listing, and no ensureDownloadsAreRunning', () => {
  const packageSource = readFileSync(
    fileURLToPath(
      new URL(
        '../../../node_modules/@kesha-antonov/react-native-background-downloader/src/index.ts',
        import.meta.url
      ).href
    ),
    'utf8'
  );

  assert.equal(
    /export\s+(?:const|function)\s+ensureDownloadsAreRunning\b/.test(packageSource),
    false
  );
  assert.match(packageSource, /export const getExistingDownloadTasks/);
});

test('every audio task the OS still holds is resumed on launch', async () => {
  existingTasks = [makeTask('audio-download:job-1'), makeTask('audio-download:job-2')];

  await mod.ensureBackgroundAudioDownloadsRunning();

  assert.deepEqual(backgroundCalls, [
    { method: 'getExistingDownloadTasks', args: [] },
    { method: 'resume', args: ['audio-download:job-1'] },
    { method: 'resume', args: ['audio-download:job-2'] },
  ]);
});

test('tasks belonging to another feature are left alone', async () => {
  existingTasks = [makeTask('bible-pack:swahili'), makeTask('audio-download:job-1')];

  await mod.ensureBackgroundAudioDownloadsRunning();

  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'resume'),
    [{ method: 'resume', args: ['audio-download:job-1'] }]
  );
});

test('one task that refuses to resume does not strand the tasks after it', async () => {
  existingTasks = [makeTask('audio-download:job-1'), makeTask('audio-download:job-2')];
  resumeErrors.add('audio-download:job-1');

  await assert.doesNotReject(() => mod.ensureBackgroundAudioDownloadsRunning());

  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'resume'),
    [
      { method: 'resume', args: ['audio-download:job-1'] },
      { method: 'resume', args: ['audio-download:job-2'] },
    ]
  );
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /Failed to resume background task/);
});

test('an unavailable native downloader never breaks startup', async () => {
  existingTasksError = new Error('no native module');

  await assert.doesNotReject(() => mod.ensureBackgroundAudioDownloadsRunning());
});

test('nothing is resumed when the OS holds no tasks at all', async () => {
  await mod.ensureBackgroundAudioDownloadsRunning();

  assert.deepEqual(backgroundCalls, [{ method: 'getExistingDownloadTasks', args: [] }]);
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

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

// Nothing in the app resumes a partial, so one left above the 1KB validity floor
// would read as a complete chapter forever. Cancelling therefore discards it —
// but only once the native cancel has resolved and the path is safe to touch.
test('a cancelled download discards its partial file once the native cancel resolves', async () => {
  downloadScript = { gate: new Promise<void>(() => {}), partialSize: 2_000 };
  const controller = new AbortController();

  const pending = mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
  assert.deepEqual([...files.keys()], []);
  assert.deepEqual(cancelCalls, ['file:///documents/everybible-audio/bsb/GEN/1.m4a.download']);
});

test('a cancel that fails leaves the partial file alone rather than racing the native task', async () => {
  downloadScript = {
    gate: new Promise<void>(() => {}),
    cancelError: new Error('native cancel exploded'),
    partialSize: 2_000,
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
  assert.deepEqual(
    [...files.keys()],
    ['file:///documents/everybible-audio/bsb/GEN/1.m4a.download']
  );
});

test('a cancelled download does not settle until the native cancel has finished', async () => {
  const cancelGate = { resolve: () => {} };
  downloadScript = {
    gate: new Promise<void>(() => {}),
    cancelGate: new Promise<void>((resolve) => {
      cancelGate.resolve = resolve;
    }),
  };
  const controller = new AbortController();
  let settled = false;

  const pending = mod.expoAudioFileSystemAdapter
    .downloadFile(
      'https://media.test/GEN/1.m4a',
      'file:///documents/everybible-audio/bsb/GEN/1.m4a',
      {
        signal: controller.signal,
      }
    )
    .catch(() => {
      settled = true;
    });
  await flush();
  controller.abort();
  await flush();

  assert.deepEqual(cancelCalls, ['file:///documents/everybible-audio/bsb/GEN/1.m4a.download']);
  assert.equal(settled, false);

  cancelGate.resolve();
  await pending;

  assert.equal(settled, true);
});

test('native callbacks that arrive after a stopped background download are ignored', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  taskScript = { outcome: 'hang' };
  const controller = new AbortController();
  const progress: Array<{ bytesDownloaded: number; bytesTotal: number }> = [];

  const pending = transport.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/a.m4a',
    {
      taskId: 'job-1:GEN:1',
      signal: controller.signal,
      onProgress: (update) => progress.push(update),
    }
  );
  await flush();
  controller.abort();
  lastTaskHandlers.progress?.({ bytesDownloaded: 100, bytesTotal: 100 });
  lastTaskHandlers.done?.();
  lastTaskHandlers.error?.({ error: 'too late' });

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
  assert.deepEqual(progress, []);
  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'completeHandler'),
    []
  );
  assert.deepEqual(downloadCalls, []);
});

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test('a cancelled download still settles as cancelled when its partial file cannot be deleted', async () => {
  downloadScript = { gate: new Promise<void>(() => {}) };
  deleteError = new Error('EBUSY');
  const controller = new AbortController();

  const pending = mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { signal: controller.signal }
  );
  await flush();
  controller.abort();

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
  assert.equal(fsMethods().includes('deleteAsync'), true);
});

test('a download that finishes while its cancel is in flight still reports the cancellation', async () => {
  const transfer = gate();
  const cancel = gate();
  downloadScript = {
    gate: transfer.promise,
    cancelGate: cancel.promise,
    writeSize: VALID_AUDIO_BYTES,
  };
  const controller = new AbortController();
  let outcome = 'pending';

  const pending = mod.expoAudioFileSystemAdapter
    .downloadFile(
      'https://media.test/GEN/1.m4a',
      'file:///documents/everybible-audio/bsb/GEN/1.m4a',
      { signal: controller.signal }
    )
    .then(
      () => {
        outcome = 'resolved';
      },
      (error: unknown) => {
        outcome = service.isAudioDownloadCancellation(error) ? 'cancelled' : 'failed';
      }
    );
  await flush();
  controller.abort();
  transfer.open();
  await flush();

  assert.equal(outcome, 'pending', 'the late transfer result must not settle the download');

  cancel.open();
  await pending;

  assert.equal(outcome, 'cancelled');
});

test('a transfer error that arrives while its cancel is in flight is not reported', async () => {
  const transfer = gate();
  const cancel = gate();
  downloadScript = {
    gate: transfer.promise,
    cancelGate: cancel.promise,
    error: new Error('connection reset by cancel'),
  };
  const controller = new AbortController();

  const pending = mod.expoAudioFileSystemAdapter.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { signal: controller.signal }
  );
  await flush();
  controller.abort();
  transfer.open();
  await flush();
  cancel.open();

  await assert.rejects(pending, (error: unknown) => service.isAudioDownloadCancellation(error));
});

test('an abort that lands while the finished file is being measured is a cancellation', async () => {
  const controller = new AbortController();
  const target = 'file:///documents/everybible-audio/bsb/GEN/1.m4a';
  onGetInfo = (uri) => {
    if (uri === target) controller.abort();
  };

  await assert.rejects(
    () =>
      mod.expoAudioFileSystemAdapter.downloadFile('https://media.test/GEN/1.m4a', target, {
        signal: controller.signal,
      }),
    (error: unknown) => service.isAudioDownloadCancellation(error)
  );

  assert.equal(fsMethods().includes('deleteAsync'), false);
});

test('readBase64Chunk reads one base64 window of a downloaded chapter', async () => {
  const uri = 'file:///documents/everybible-audio/bsb/GEN/1.mp3';
  files.set(uri, { size: 8, contents: 'QUJDREVGR0g=' });

  const chunk = await mod.expoAudioFileSystemAdapter.readBase64Chunk?.(uri, 4, 4);

  assert.equal(chunk, 'REVG');
  assert.deepEqual(fsCalls.at(-1), {
    method: 'readAsStringAsync',
    args: [uri, { encoding: 'base64', position: 4, length: 4 }],
  });
});

test('readBase64Chunk returns null for a chapter that cannot be read', async () => {
  const chunk = await mod.expoAudioFileSystemAdapter.readBase64Chunk?.(
    'file:///documents/everybible-audio/bsb/GEN/404.mp3',
    0,
    4
  );

  assert.equal(chunk, null);
});

test('getFreeDiskBytes reports free space, and null when the volume cannot say', async () => {
  freeDiskStorage = 5_000_000;
  assert.equal(await mod.expoAudioFileSystemAdapter.getFreeDiskBytes?.(), 5_000_000);

  freeDiskStorage = new Error('statfs failed');
  assert.equal(await mod.expoAudioFileSystemAdapter.getFreeDiskBytes?.(), null);
});

test('a native task that reports done and then an error settles the download once', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();

  await transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a', {
    taskId: 'job-1:GEN:1',
  });
  lastTaskHandlers.error?.({ error: 'spurious late error' });
  await flush();

  assert.deepEqual(
    backgroundCalls.filter((call) => call.method === 'completeHandler'),
    [{ method: 'completeHandler', args: ['job-1:GEN:1'] }]
  );
  assert.deepEqual(downloadCalls, []);
  assert.deepEqual(warnings, []);
});

test('native callbacks after the caller aborts a finished background download are ignored', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();
  const controller = new AbortController();

  await transport.downloadFile('https://media.test/GEN/1.m4a', 'file:///documents/a.m4a', {
    taskId: 'job-1:GEN:1',
    signal: controller.signal,
  });
  controller.abort();
  lastTaskHandlers.done?.();
  lastTaskHandlers.error?.({ error: 'too late' });
  await flush();

  assert.deepEqual(
    backgroundCalls.map((call) => call.method),
    ['createDownloadTask', 'start', 'completeHandler']
  );
  assert.deepEqual(downloadCalls, []);
});
