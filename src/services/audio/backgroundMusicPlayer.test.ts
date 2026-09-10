import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BackgroundMusicChoice } from '../../types';

// ---------------------------------------------------------------------------
// Bundled audio assets
//
// The real ./backgroundMusicCatalog is used (its volumes are the behaviour
// under test) but its `require()` of the bundled .m4a files cannot be parsed by
// Node, so each asset module is replaced with the integer handle Metro would
// hand back.
// ---------------------------------------------------------------------------

const ASSET_HANDLES: Record<string, number> = {
  ambient: 101,
  piano: 102,
  'soft-guitar': 103,
  harp: 104,
  flute: 105,
  sitar: 106,
  'ocean-waves': 107,
};

for (const [name, handle] of Object.entries(ASSET_HANDLES)) {
  mockModule(mock, sourcePath(`../assets/audio/background/${name}.m4a`), { default: handle });
}

// ---------------------------------------------------------------------------
// Scripted expo-av fake
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface FakeStatus {
  isLoaded: boolean;
  positionMillis?: number;
  durationMillis?: number;
}

const soundDefaultRejections = new Map<string, unknown>();

class FakeSound {
  readonly calls: RecordedCall[] = [];
  readonly rejections = new Map<string, unknown>(soundDefaultRejections);
  statusListener: ((status: FakeStatus) => void) | null = null;

  playAsync = (): Promise<void> => this.record('playAsync', []);
  pauseAsync = (): Promise<void> => this.record('pauseAsync', []);
  stopAsync = (): Promise<void> => this.record('stopAsync', []);
  unloadAsync = (): Promise<void> => this.record('unloadAsync', []);
  setVolumeAsync = (volume: number): Promise<void> => this.record('setVolumeAsync', [volume]);
  setPositionAsync = (positionMillis: number): Promise<void> =>
    this.record('setPositionAsync', [positionMillis]);
  setOnPlaybackStatusUpdate = (listener: ((status: FakeStatus) => void) | null): void => {
    this.calls.push({ method: 'setOnPlaybackStatusUpdate', args: [listener] });
    this.statusListener = listener;
  };

  /** Push an AVPlaybackStatus through whatever handler the player registered. */
  emitStatus(status: FakeStatus): void {
    this.statusListener?.(status);
  }

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }

  volumes(fromIndex = 0): number[] {
    return this.calls
      .slice(fromIndex)
      .filter((call) => call.method === 'setVolumeAsync')
      .map((call) => call.args[0] as number);
  }

  private record(method: string, args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    const failure = this.rejections.get(method);
    return failure ? Promise.reject(failure) : Promise.resolve();
  }
}

const sounds: FakeSound[] = [];
const createCalls: Array<{ source: unknown; initialStatus: unknown }> = [];

let nextCreateGate: Promise<unknown> | null = null;
let nextCreateFailure: unknown = null;

const createAsync = async (
  source: unknown,
  initialStatus: unknown
): Promise<{ sound: FakeSound }> => {
  createCalls.push({ source, initialStatus });
  const sound = new FakeSound();
  sounds.push(sound);

  const gate = nextCreateGate;
  const failure = nextCreateFailure;
  if (gate) {
    await gate;
  }
  if (failure) {
    sounds.splice(sounds.indexOf(sound), 1);
    throw failure;
  }

  return { sound };
};

mockModule(mock, 'expo-av', {
  Audio: {
    Sound: class {
      static createAsync = createAsync;
    },
  },
});

// configureAudioMode is audioPlayer's job; here we only care that it is called.
let configureAudioModeCalls = 0;
mockModule(mock, sourcePath('services/audio/audioPlayer.ts'), {
  configureAudioMode: async (): Promise<void> => {
    configureAudioModeCalls += 1;
  },
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type BackgroundMusicPlayerModule = typeof import('./backgroundMusicPlayer');

const FADE_DURATION_MS = 2500;
const AMBIENT_VOLUME = 0.16;
const OCEAN_WAVES_VOLUME = 0.24;

let mod: BackgroundMusicPlayerModule;

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Drive the whole fade ramp forward. */
const runFade = (): void => {
  mock.timers.tick(FADE_DURATION_MS);
};

const nearEndOfLoop = (): FakeStatus => ({
  isLoaded: true,
  positionMillis: 60_000 - FADE_DURATION_MS,
  durationMillis: 60_000,
});

// Fades run on setInterval. Enabling the mock clock once (rather than per test)
// keeps a single scheduling timeline; each test starts from a stopped player.
mock.timers.enable({ apis: ['setInterval'] });

before(async () => {
  mod = await import('./backgroundMusicPlayer');
});

beforeEach(async () => {
  if (mod) {
    await mod.backgroundMusicPlayer.stop();
  }
  // Drain any fade the previous test left mid-ramp before recordings are reset.
  mock.timers.tick(FADE_DURATION_MS * 2);
  sounds.length = 0;
  createCalls.length = 0;
  soundDefaultRejections.clear();
  nextCreateGate = null;
  nextCreateFailure = null;
});

// ---------------------------------------------------------------------------
// Starting and stopping a loop
// ---------------------------------------------------------------------------

test('starting a preset loads its bundled asset muted and fades it up to the catalog volume', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  assert.deepEqual(createCalls, [
    {
      source: ASSET_HANDLES.ambient,
      initialStatus: {
        shouldPlay: false,
        isLooping: false,
        volume: 0,
        progressUpdateIntervalMillis: 1000,
      },
    },
  ]);
  assert.deepEqual(sounds[0].methods(), ['setOnPlaybackStatusUpdate', 'playAsync']);

  runFade();

  const volumes = sounds[0].volumes();
  assert.equal(volumes.length, FADE_DURATION_MS / 50);
  assert.equal(volumes[0] > 0, true);
  assert.equal(volumes.at(-1), AMBIENT_VOLUME);
});

test('the audio session is configured on the first sync and never again', async () => {
  const configureCallsBefore = configureAudioModeCalls;

  await mod.backgroundMusicPlayer.sync('ambient', true);
  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.equal(configureAudioModeCalls, Math.max(configureCallsBefore, 1));
});

test('each preset fades to its own catalog volume', async () => {
  await mod.backgroundMusicPlayer.sync('ocean-waves', true);
  runFade();

  assert.equal(sounds[0].volumes().at(-1), OCEAN_WAVES_VOLUME);
});

test('re-syncing the preset that is already playing leaves the loop untouched', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const callsBefore = sounds[0].calls.length;

  await mod.backgroundMusicPlayer.sync('ambient', true);

  assert.equal(createCalls.length, 1);
  assert.equal(sounds[0].calls.length, callsBefore);
});

test('switching preset unloads the previous loop before loading the new one', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.deepEqual(
    createCalls.map((call) => call.source),
    [ASSET_HANDLES.ambient, ASSET_HANDLES.piano]
  );
  assert.deepEqual(sounds[0].methods().slice(-3), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
  assert.deepEqual(sounds[1].methods(), ['setOnPlaybackStatusUpdate', 'playAsync']);
});

test('an unload failure while switching preset does not stop the new loop from starting', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  sounds[0].rejections.set('stopAsync', new Error('sound already released'));

  await assert.doesNotReject(() => mod.backgroundMusicPlayer.sync('piano', true));

  assert.equal(createCalls.length, 2);
});

test('a play failure is swallowed and leaves the loop silent for the next sync pass', async () => {
  soundDefaultRejections.set('playAsync', new Error('audio focus denied'));

  await assert.doesNotReject(() => mod.backgroundMusicPlayer.sync('ambient', true));
  runFade();

  assert.deepEqual(sounds[0].volumes(), []);
});

test('an unrecognised preset never touches expo-av', async () => {
  await mod.backgroundMusicPlayer.sync('nonexistent' as BackgroundMusicChoice, true);

  assert.deepEqual(createCalls, []);
});

test('syncing to off stops and unloads the loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  await mod.backgroundMusicPlayer.sync('off', true);

  assert.deepEqual(sounds[0].methods().slice(-3), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
});

test('a preset can be started again after being switched off', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  await mod.backgroundMusicPlayer.sync('off', true);

  await mod.backgroundMusicPlayer.sync('ambient', true);

  assert.equal(createCalls.length, 2);
  assert.deepEqual(sounds[1].methods(), ['setOnPlaybackStatusUpdate', 'playAsync']);
});

test('stop unloads the loop and forgets the preset', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  await mod.backgroundMusicPlayer.stop();
  await mod.backgroundMusicPlayer.sync('ambient', true);

  assert.equal(createCalls.length, 2);
});

test('stopping when nothing was ever loaded is a no-op', async () => {
  await assert.doesNotReject(() => mod.backgroundMusicPlayer.stop());

  assert.deepEqual(sounds, []);
});

// ---------------------------------------------------------------------------
// Pausing around foreground playback
// ---------------------------------------------------------------------------

test('pausing the current preset mutes and pauses it without unloading', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const callsBefore = sounds[0].calls.length;

  await mod.backgroundMusicPlayer.sync('ambient', false);

  assert.deepEqual(sounds[0].methods().slice(callsBefore), ['setVolumeAsync', 'pauseAsync']);
  assert.deepEqual(sounds[0].volumes(callsBefore), [0]);
});

test('a paused loop resumes by fading back in rather than reloading', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('ambient', false);
  const callsBefore = sounds[0].calls.length;

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  assert.equal(createCalls.length, 1);
  assert.deepEqual(sounds[0].methods().slice(callsBefore, callsBefore + 1), ['playAsync']);
  assert.equal(sounds[0].volumes(callsBefore).at(-1), AMBIENT_VOLUME);
});

test('pausing while switching to a different preset unloads instead of pausing', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  await mod.backgroundMusicPlayer.sync('piano', false);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(sounds[0].methods().slice(-3), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
});

test('a paused sync with nothing loaded only remembers the preset', async () => {
  await mod.backgroundMusicPlayer.sync('piano', false);

  assert.equal(createCalls.length, 0);

  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.deepEqual(
    createCalls.map((call) => call.source),
    [ASSET_HANDLES.piano]
  );
});

test('a pause failure is swallowed so the next sync pass can reconcile', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  sounds[0].rejections.set('setVolumeAsync', new Error('sound released'));

  await assert.doesNotReject(() => mod.backgroundMusicPlayer.sync('ambient', false));
});

// ---------------------------------------------------------------------------
// Looping via crossfade
// ---------------------------------------------------------------------------

test('approaching the end of the loop crossfades into a fresh instance', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];

  outgoing.emitStatus(nearEndOfLoop());
  await flush();

  assert.equal(createCalls.length, 2);
  assert.deepEqual(createCalls[1].initialStatus, {
    shouldPlay: true,
    isLooping: false,
    volume: 0,
    progressUpdateIntervalMillis: 1000,
  });
  // The outgoing loop's handler is detached so the crossfade cannot re-enter.
  assert.equal(outgoing.statusListener, null);

  const outgoingCallsBefore = outgoing.calls.length;
  runFade();

  assert.equal(outgoing.volumes(outgoingCallsBefore).at(-1), 0);
  assert.deepEqual(outgoing.methods().slice(-2), ['stopAsync', 'unloadAsync']);
  assert.equal(sounds[1].volumes().at(-1), AMBIENT_VOLUME);
});

test('the crossfade keeps the outgoing loop audible while the replacement fades in', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const outgoingCallsBefore = outgoing.calls.length;

  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  mock.timers.tick(FADE_DURATION_MS / 2);

  const outgoingVolume = outgoing.volumes(outgoingCallsBefore).at(-1) ?? -1;
  const incomingVolume = sounds[1].volumes().at(-1) ?? -1;
  assert.equal(outgoingVolume > 0 && outgoingVolume < AMBIENT_VOLUME, true);
  assert.equal(incomingVolume > 0 && incomingVolume < AMBIENT_VOLUME, true);
  assert.deepEqual(outgoing.methods().includes('unloadAsync'), false);
});

test('a crossfade replacement that arrives after the music stopped is discarded', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const gate = createDeferred();
  nextCreateGate = gate.promise;

  sounds[0].emitStatus(nearEndOfLoop());
  await flush();
  nextCreateGate = null;
  await mod.backgroundMusicPlayer.stop();
  gate.resolve();
  await flush();

  assert.deepEqual(sounds[1].methods(), ['setOnPlaybackStatusUpdate', 'stopAsync', 'unloadAsync']);
});

test('a crossfade that cannot load a replacement restarts the current loop from the top', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const callsBefore = outgoing.calls.length;
  nextCreateFailure = new Error('asset unavailable');

  outgoing.emitStatus(nearEndOfLoop());
  await flush();

  assert.deepEqual(outgoing.methods().slice(callsBefore), [
    'setOnPlaybackStatusUpdate',
    'setPositionAsync',
    'setOnPlaybackStatusUpdate',
  ]);
  assert.equal(outgoing.calls.at(-2)?.args[0], 0);
  assert.notEqual(outgoing.statusListener, null);
});

test('a failed crossfade whose restart also fails leaves the loop alone', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.rejections.set('setPositionAsync', new Error('sound released'));
  nextCreateFailure = new Error('asset unavailable');

  outgoing.emitStatus(nearEndOfLoop());
  await flush();

  assert.equal(outgoing.statusListener, null);
});

test('pausing during a crossfade cleans up the retiring loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];

  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  const incoming = sounds[1];
  const incomingCallsBefore = incoming.calls.length;

  await mod.backgroundMusicPlayer.sync('ambient', false);

  assert.deepEqual(outgoing.methods().slice(-3), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
  assert.deepEqual(incoming.methods().slice(incomingCallsBefore), ['setVolumeAsync', 'pauseAsync']);
});

test('stopping during a crossfade unloads both the retiring and the current loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  sounds[0].emitStatus(nearEndOfLoop());
  await flush();
  await mod.backgroundMusicPlayer.stop();

  for (const sound of sounds) {
    assert.deepEqual(sound.methods().slice(-2), ['stopAsync', 'unloadAsync']);
  }
});

test('a status update while the music is paused never starts a crossfade', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('ambient', false);

  sounds[0].emitStatus(nearEndOfLoop());
  await flush();

  assert.equal(createCalls.length, 1);
});

test('a status update well before the end of the loop is ignored', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  sounds[0].emitStatus({ isLoaded: true, positionMillis: 1_000, durationMillis: 60_000 });
  await flush();

  assert.equal(createCalls.length, 1);
});

test('a status update for a sound that reports no duration is ignored', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  sounds[0].emitStatus({ isLoaded: true, positionMillis: 60_000, durationMillis: 0 });
  await flush();

  assert.equal(createCalls.length, 1);
});

test('an unloaded status update is ignored', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  sounds[0].emitStatus({ isLoaded: false });
  await flush();

  assert.equal(createCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Load races
// ---------------------------------------------------------------------------

test('a load superseded before it finishes is unloaded and never becomes the active loop', async () => {
  const gate = createDeferred();
  nextCreateGate = gate.promise;

  const pending = mod.backgroundMusicPlayer.sync('ambient', true);
  await flush();
  nextCreateGate = null;
  await mod.backgroundMusicPlayer.stop();
  gate.resolve();
  await pending;

  assert.deepEqual(sounds[0].methods(), ['unloadAsync']);
});
