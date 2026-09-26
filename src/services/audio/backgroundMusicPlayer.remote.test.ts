/**
 * Remote background sounds through the real player and the real download cache. Fixture
 * options stand in for two shipped remote entries; the file system, NetInfo and expo-av
 * are in-memory fakes.
 */
import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BackgroundMusicChoice } from '../../types';
import type { BackgroundMusicOption } from './backgroundMusicCatalog';

for (const name of ['ambient', 'piano', 'soft-guitar', 'harp', 'flute', 'sitar', 'ocean-waves']) {
  mockModule(mock, sourcePath(`../assets/audio/background/${name}.m4a`), { default: name });
}

// ---------------------------------------------------------------------------
// expo-av
// ---------------------------------------------------------------------------

interface FakeStatus {
  isLoaded: boolean;
  positionMillis?: number;
  durationMillis?: number;
}

class FakeSound {
  readonly calls: { method: string; args: unknown[] }[] = [];
  statusListener: ((status: FakeStatus) => void) | null = null;

  playAsync = (): Promise<void> => this.record('playAsync', []);
  pauseAsync = (): Promise<void> => this.record('pauseAsync', []);
  stopAsync = (): Promise<void> => this.record('stopAsync', []);
  unloadAsync = (): Promise<void> => this.record('unloadAsync', []);
  setVolumeAsync = (volume: number): Promise<void> => this.record('setVolumeAsync', [volume]);
  setPositionAsync = (position: number): Promise<void> =>
    this.record('setPositionAsync', [position]);
  setOnPlaybackStatusUpdate = (listener: ((status: FakeStatus) => void) | null): void => {
    this.statusListener = listener;
  };

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }

  volumes(): number[] {
    return this.calls
      .filter((call) => call.method === 'setVolumeAsync')
      .map((call) => call.args[0] as number);
  }

  private record(method: string, args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    return Promise.resolve();
  }
}

const sounds: FakeSound[] = [];
const createSources: unknown[] = [];
let nextCreateFailure: unknown = null;

mockModule(mock, 'expo-av', {
  Audio: {
    Sound: class {
      static createAsync = async (source: unknown): Promise<{ sound: FakeSound }> => {
        createSources.push(source);
        const failure = nextCreateFailure;
        nextCreateFailure = null;
        if (failure) throw failure;
        const sound = new FakeSound();
        sounds.push(sound);
        return { sound };
      };
    },
  },
});
mockModule(mock, sourcePath('services/audio/audioPlayer.ts'), {
  configureAudioMode: async (): Promise<void> => {},
});

// ---------------------------------------------------------------------------
// File system and network
// ---------------------------------------------------------------------------

const files = new Set<string>();
const downloads: { from: string; to: string }[] = [];
let releaseDownload: (() => void) | null = null;
let holdDownloads = false;
let online = true;

mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: 'file:///docs/',
  deleteAsync: async (uri: string) => {
    files.delete(uri);
  },
});
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: {
    ensureDirectory: async () => {},
    fileExists: async (uri: string) => files.has(uri),
    downloadFile: async (from: string, to: string) => {
      downloads.push({ from, to });
      if (holdDownloads) {
        await new Promise<void>((resolve) => {
          releaseDownload = resolve;
        });
      }
      files.add(to);
    },
  },
});
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: online, isInternetReachable: online }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

const remoteOption = (id: BackgroundMusicChoice, defaultVolume: number): BackgroundMusicOption => ({
  id,
  label: id,
  description: '',
  workTitle: '',
  license: 'CC0',
  credit: '',
  sourceUrl: '',
  defaultVolume,
  source: { kind: 'remote', path: `background-sounds/v1/${id}.m4a` },
});

const RAIN = remoteOption('rain', 0.2);
const SHORE = remoteOption('shore', 0.1);
const RAIN_FILE = 'file:///docs/everybible-background-sounds/background-sounds/v1/rain.m4a';
const FADE_DURATION_MS = 2500;

type PlayerModule = typeof import('./backgroundMusicPlayer');
type CacheModule = typeof import('./backgroundSoundCache');
let player: PlayerModule['backgroundMusicPlayer'];
let cache: CacheModule['backgroundSoundCache'];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** Waits for the held download to reach the fake, then lets it finish. */
async function finishDownload(): Promise<void> {
  while (!releaseDownload) await new Promise((resolve) => setImmediate(resolve));
  const release = releaseDownload;
  releaseDownload = null;
  release();
  await flush();
}

mock.timers.enable({ apis: ['setInterval'] });

before(async () => {
  const catalog = await import('./backgroundMusicCatalog');
  // Stand in for the shipped rain and shore entries, so tuning their volumes never moves
  // these tests.
  for (const fixture of [RAIN, SHORE]) {
    const index = catalog.BACKGROUND_MUSIC_OPTIONS.findIndex((option) => option.id === fixture.id);
    if (index >= 0) catalog.BACKGROUND_MUSIC_OPTIONS.splice(index, 1, fixture);
    else catalog.BACKGROUND_MUSIC_OPTIONS.push(fixture);
  }
  ({ backgroundMusicPlayer: player } = await import('./backgroundMusicPlayer'));
  ({ backgroundSoundCache: cache } = await import('./backgroundSoundCache'));
});

beforeEach(async () => {
  await player.stop();
  mock.timers.tick(FADE_DURATION_MS * 2);
  await flush();
  if (releaseDownload) await finishDownload();
  files.clear();
  downloads.length = 0;
  sounds.length = 0;
  createSources.length = 0;
  nextCreateFailure = null;
  holdDownloads = false;
  online = true;
  // Forget what earlier tests put on disk.
  await cache.discard(RAIN);
  await cache.discard(SHORE);
  await cache.refresh([RAIN, SHORE]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('a sound already downloaded plays from its file without touching the network', async () => {
  files.add(RAIN_FILE);

  await player.sync('rain', true);
  mock.timers.tick(FADE_DURATION_MS);

  assert.deepEqual(createSources, [{ uri: RAIN_FILE }]);
  assert.deepEqual(downloads, []);
  assert.equal(sounds[0]?.methods().includes('playAsync'), true);
  assert.equal(sounds[0]?.volumes().at(-1), 0.2);
});

test('the first play downloads the sound, keeps the bed silent meanwhile, then fades it in', async () => {
  holdDownloads = true;

  await player.sync('rain', true);
  await flush();
  assert.deepEqual(createSources, [], 'nothing plays until the file is on disk');
  assert.equal(cache.getAvailability(RAIN), 'downloading');

  await finishDownload();
  mock.timers.tick(FADE_DURATION_MS);

  assert.deepEqual(downloads, [
    { from: 'https://media.everybible.app/background-sounds/v1/rain.m4a', to: RAIN_FILE },
  ]);
  assert.deepEqual(createSources, [{ uri: RAIN_FILE }]);
  assert.equal(sounds[0]?.methods().includes('playAsync'), true);
  assert.equal(sounds[0]?.volumes().at(-1), 0.2);
  assert.equal(cache.getAvailability(RAIN), 'cached');
});

test('a remote sound loops by crossfading into a fresh copy of the same file', async () => {
  files.add(RAIN_FILE);
  await player.sync('rain', true);
  mock.timers.tick(FADE_DURATION_MS);

  sounds[0]?.statusListener?.({ isLoaded: true, positionMillis: 57_500, durationMillis: 60_000 });
  await flush();
  mock.timers.tick(FADE_DURATION_MS);
  await flush();

  assert.deepEqual(createSources, [{ uri: RAIN_FILE }, { uri: RAIN_FILE }]);
  assert.deepEqual(sounds[0]?.methods().slice(-2), ['stopAsync', 'unloadAsync']);
  assert.equal(sounds[1]?.volumes().at(-1), 0.2);
});

test('offline, a sound that is not downloaded stays silent and reports it could not be had', async () => {
  online = false;

  await assert.doesNotReject(() => player.sync('rain', true));
  await flush();

  assert.deepEqual(createSources, []);
  assert.deepEqual(downloads, []);
  assert.equal(cache.getAvailability(RAIN), 'failed');
});

test('a sound that failed offline downloads on the next play once back online', async () => {
  online = false;
  await player.sync('rain', true);
  await flush();
  await player.sync('rain', false);

  online = true;
  await player.sync('rain', true);
  await flush();
  mock.timers.tick(FADE_DURATION_MS);

  assert.deepEqual(createSources, [{ uri: RAIN_FILE }]);
  assert.equal(sounds[0]?.volumes().at(-1), 0.2);
});

test('switching to a sound still downloading fades the old one out rather than playing on', async () => {
  await player.sync('ambient', true);
  mock.timers.tick(FADE_DURATION_MS);
  const ambient = sounds[0];
  holdDownloads = true;

  await player.sync('rain', true);
  mock.timers.tick(FADE_DURATION_MS);
  await flush();

  assert.equal(ambient?.volumes().at(-1), 0);
  assert.deepEqual(ambient?.methods().slice(-2), ['stopAsync', 'unloadAsync']);

  await finishDownload();
  mock.timers.tick(FADE_DURATION_MS);
  assert.deepEqual(createSources, ['ambient', { uri: RAIN_FILE }]);
  assert.equal(sounds[1]?.volumes().at(-1), 0.2);
});

test('a download that lands after the listener paused does not start the sound', async () => {
  holdDownloads = true;
  await player.sync('rain', true);
  await player.sync('rain', false);

  await finishDownload();
  mock.timers.tick(FADE_DURATION_MS);

  assert.equal(
    sounds.some((sound) => sound.methods().includes('playAsync')),
    false
  );
  assert.equal(cache.getAvailability(RAIN), 'cached', 'the download itself still completes');
});

test('a download that lands after the listener picked another sound does not play', async () => {
  holdDownloads = true;
  await player.sync('rain', true);
  await player.sync('piano', true);

  await finishDownload();
  mock.timers.tick(FADE_DURATION_MS);

  assert.deepEqual(createSources, ['piano']);
});

test('a downloaded file that will not decode is dropped and fetched again next time', async () => {
  files.add(RAIN_FILE);
  nextCreateFailure = new Error('decoder error');

  await assert.doesNotReject(() => player.sync('rain', true));
  await flush();

  assert.equal(files.has(RAIN_FILE), false);
  assert.equal(cache.getAvailability(RAIN), 'failed');

  await player.sync('rain', true);
  await flush();
  assert.deepEqual(
    downloads.map((download) => download.to),
    [RAIN_FILE]
  );
  assert.deepEqual(createSources, [{ uri: RAIN_FILE }, { uri: RAIN_FILE }]);
});

test('Shuffle may pick a remote sound once it is downloaded, but not before', async () => {
  assert.equal(player.getShuffleCandidates().includes('rain'), false);

  await cache.ensureCached(RAIN);

  const candidates = player.getShuffleCandidates();
  assert.equal(candidates.includes('rain'), true);
  assert.equal(candidates.includes('shore'), false);
  assert.equal(candidates.includes('piano'), true);
});
