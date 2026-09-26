import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BackgroundMusicChoice } from '../../types';
import type { BackgroundMusicOption } from './backgroundMusicCatalog';

// ---------------------------------------------------------------------------
// The production singleton's file system: the shared audio adapter (atomic partial +
// move downloads) and expo-file-system for the document directory and deletes.
// ---------------------------------------------------------------------------

const productionDownloads: Array<{ from: string; to: string }> = [];
const productionFiles = new Set<string>();

mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: async (fileUri: string) => {
    productionFiles.delete(fileUri);
  },
});
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: {
    ensureDirectory: async () => {},
    fileExists: async (fileUri: string) => productionFiles.has(fileUri),
    downloadFile: async (from: string, to: string) => {
      productionDownloads.push({ from, to });
      productionFiles.add(to);
    },
  },
});
let deviceOnline = true;
// connectivity.ts reaches NetInfo through a lazy `require(...).default`, so the fake
// answers whether the loader hands back the namespace or the interop default.
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: deviceOnline, isInternetReachable: deviceOnline }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

type CacheModule = typeof import('./backgroundSoundCache');
let mod: CacheModule;

before(async () => {
  mod = await import('./backgroundSoundCache');
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const remote = (id: BackgroundMusicChoice, path: string): BackgroundMusicOption => ({
  id,
  label: id,
  description: '',
  workTitle: '',
  license: 'CC0',
  credit: '',
  sourceUrl: '',
  defaultVolume: 0.2,
  source: { kind: 'remote', path },
});

const RAIN = remote('rain', 'background-sounds/v1/rain.m4a');
const SHORE = remote('shore', 'background-sounds/v1/shore.m4a');
const PIANO: BackgroundMusicOption = { ...RAIN, id: 'piano', source: { kind: 'bundled' } };

const ROOT = 'file:///docs/everybible-background-sounds/';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface DownloadCall {
  from: string;
  to: string;
  signal?: AbortSignal;
  onProgress?: (progress: { bytesDownloaded: number; bytesTotal: number }) => void;
}

/** An in-memory file system whose downloads the test finishes, fails or stalls. */
function createFakeFileSystem() {
  const files = new Set<string>();
  const downloads: DownloadCall[] = [];
  const directories: string[] = [];
  const deleted: string[] = [];
  let gate: Deferred | null = null;
  let failure: unknown = null;

  return {
    files,
    downloads,
    directories,
    deleted,
    gateNextDownload(): Deferred {
      gate = createDeferred();
      return gate;
    },
    failNextDownload(error: unknown): void {
      failure = error;
    },
    adapter: {
      ensureDirectory: async (uri: string) => {
        directories.push(uri);
      },
      fileExists: async (uri: string) => files.has(uri),
      deleteFile: async (uri: string) => {
        deleted.push(uri);
        files.delete(uri);
      },
      downloadFile: async (
        from: string,
        to: string,
        options?: Pick<DownloadCall, 'signal' | 'onProgress'>
      ) => {
        downloads.push({ from, to, ...options });
        const pending = gate;
        const error = failure;
        gate = null;
        failure = null;
        if (pending) {
          await new Promise<void>((resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')));
            pending.promise.then(resolve, reject);
          });
        }
        if (error) throw error;
        files.add(to);
      },
    },
  };
}

type FakeFileSystem = ReturnType<typeof createFakeFileSystem>;

let fs: FakeFileSystem;
let offline: boolean;

const makeCache = (options: { stallTimeoutMs?: number } = {}) =>
  mod.createBackgroundSoundCache({
    fileSystem: fs.adapter,
    rootUri: 'file:///sounds/',
    resolveUrl: (path) => `https://media.test/${path}`,
    isOffline: async () => offline,
    ...options,
  });

beforeEach(() => {
  fs = createFakeFileSystem();
  offline = false;
  deviceOnline = true;
  productionDownloads.length = 0;
  productionFiles.clear();
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

test('a bundled sound is always available', () => {
  assert.equal(makeCache().getAvailability(PIANO), 'bundled');
});

test('a remote sound nobody has asked about yet reads as needing a download', () => {
  assert.equal(makeCache().getAvailability(RAIN), 'remote');
});

test('refresh reports a remote sound already on disk as cached', async () => {
  const cache = makeCache();
  fs.files.add('file:///sounds/background-sounds/v1/rain.m4a');

  await cache.refresh([PIANO, RAIN, SHORE]);

  assert.deepEqual(cache.getSnapshot(), { rain: 'cached' });
  assert.equal(cache.getAvailability(RAIN), 'cached');
  assert.equal(cache.getAvailability(SHORE), 'remote');
});

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

test('the first request downloads the sound from the media host into its own folder', async () => {
  const cache = makeCache();

  const uri = await cache.ensureCached(RAIN);

  assert.equal(uri, 'file:///sounds/background-sounds/v1/rain.m4a');
  assert.deepEqual(
    fs.downloads.map(({ from, to }) => ({ from, to })),
    [
      {
        from: 'https://media.test/background-sounds/v1/rain.m4a',
        to: 'file:///sounds/background-sounds/v1/rain.m4a',
      },
    ]
  );
  assert.deepEqual(fs.directories, ['file:///sounds/background-sounds/v1/']);
  assert.equal(cache.getAvailability(RAIN), 'cached');
});

test('a sound already on disk is never downloaded again', async () => {
  const cache = makeCache();
  await cache.ensureCached(RAIN);

  const uri = await cache.ensureCached(RAIN);

  assert.equal(uri, 'file:///sounds/background-sounds/v1/rain.m4a');
  assert.equal(fs.downloads.length, 1);
});

test('availability reads downloading while the transfer runs, and subscribers hear each change', async () => {
  const cache = makeCache();
  const seen: (string | undefined)[] = [];
  cache.subscribe(() => seen.push(cache.getSnapshot().rain));
  const gate = fs.gateNextDownload();

  const pending = cache.ensureCached(RAIN);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cache.getAvailability(RAIN), 'downloading');
  gate.resolve();
  await pending;

  assert.deepEqual(seen, ['downloading', 'cached']);
});

test('requests made while a sound downloads share the one transfer', async () => {
  const cache = makeCache();
  const gate = fs.gateNextDownload();

  const first = cache.ensureCached(RAIN);
  const second = cache.ensureCached(RAIN);
  gate.resolve();

  assert.deepEqual(await Promise.all([first, second]), [
    'file:///sounds/background-sounds/v1/rain.m4a',
    'file:///sounds/background-sounds/v1/rain.m4a',
  ]);
  assert.equal(fs.downloads.length, 1);
});

test('offline, a sound that is not on disk fails without touching the network', async () => {
  const cache = makeCache();
  offline = true;

  const uri = await cache.ensureCached(RAIN);

  assert.equal(uri, null);
  assert.deepEqual(fs.downloads, []);
  assert.equal(cache.getAvailability(RAIN), 'failed');
});

test('offline, a sound already on disk still plays', async () => {
  const cache = makeCache();
  fs.files.add('file:///sounds/background-sounds/v1/rain.m4a');
  offline = true;

  assert.equal(await cache.ensureCached(RAIN), 'file:///sounds/background-sounds/v1/rain.m4a');
});

test('a failed download reports failed, and the next request tries again', async () => {
  const cache = makeCache();
  fs.failNextDownload(new Error('HTTP 503'));

  assert.equal(await cache.ensureCached(RAIN), null);
  assert.equal(cache.getAvailability(RAIN), 'failed');

  assert.equal(await cache.ensureCached(RAIN), 'file:///sounds/background-sounds/v1/rain.m4a');
  assert.equal(cache.getAvailability(RAIN), 'cached');
});

test('a download that stops making progress is abandoned as failed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cache = makeCache({ stallTimeoutMs: 1_000 });
  fs.gateNextDownload();

  const pending = cache.ensureCached(RAIN);
  await new Promise((resolve) => setImmediate(resolve));
  const call = fs.downloads[0];
  call?.onProgress?.({ bytesDownloaded: 10, bytesTotal: 100 });
  t.mock.timers.tick(900);
  assert.equal(call?.signal?.aborted, false, 'progress re-arms the deadline');
  t.mock.timers.tick(200);

  assert.equal(await pending, null);
  assert.equal(call?.signal?.aborted, true);
  assert.equal(cache.getAvailability(RAIN), 'failed');
});

test('a discarded file is deleted and downloaded again on the next request', async () => {
  const cache = makeCache();
  await cache.ensureCached(RAIN);

  await cache.discard(RAIN);

  assert.deepEqual(fs.deleted, ['file:///sounds/background-sounds/v1/rain.m4a']);
  assert.equal(cache.getAvailability(RAIN), 'failed');
  await cache.ensureCached(RAIN);
  assert.equal(fs.downloads.length, 2);
});

test('a path that climbs out of the sound folder is never written', async () => {
  const cache = makeCache();

  assert.equal(await cache.ensureCached(remote('rain', '../../everybible-audio/bsb.m4a')), null);
  assert.equal(await cache.ensureCached(remote('shore', '/etc/passwd')), null);
  assert.deepEqual(fs.downloads, []);
});

test('a bundled sound has no cached file and is never downloaded', async () => {
  const cache = makeCache();

  assert.equal(await cache.getCachedUri(PIANO), null);
  assert.equal(await cache.ensureCached(PIANO), null);
  assert.deepEqual(fs.downloads, []);
});

test('a subscriber that throws does not stop the others hearing the change', async () => {
  const cache = makeCache();
  let heard = 0;
  cache.subscribe(() => {
    throw new Error('broken screen');
  });
  const unsubscribe = cache.subscribe(() => {
    heard += 1;
  });

  await cache.ensureCached(RAIN);
  unsubscribe();
  await cache.discard(RAIN);

  assert.equal(heard, 2);
});

// ---------------------------------------------------------------------------
// The app's cache
// ---------------------------------------------------------------------------

test('the app downloads sounds from the media host into the document directory', async () => {
  const uri = await mod.backgroundSoundCache.ensureCached(RAIN);

  assert.equal(uri, `${ROOT}background-sounds/v1/rain.m4a`);
  assert.deepEqual(productionDownloads, [
    {
      from: 'https://media.everybible.app/background-sounds/v1/rain.m4a',
      to: `${ROOT}background-sounds/v1/rain.m4a`,
    },
  ]);
});

test('the app does not try to download a sound while the device is offline', async () => {
  deviceOnline = false;

  assert.equal(await mod.backgroundSoundCache.ensureCached(SHORE), null);
  assert.deepEqual(productionDownloads, []);
});
