import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BackgroundMusicChoice } from '../../types';
import { assertDefined } from '../../utils/assertDefined';

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
  readonly gates = new Map<string, Promise<void>>();
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
    const failure = this.rejections.get('setOnPlaybackStatusUpdate');
    if (failure) throw failure;
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
    return failure ? Promise.reject(failure) : (this.gates.get(method) ?? Promise.resolve());
  }
}

const sounds: FakeSound[] = [];
const createCalls: Array<{ source: unknown; initialStatus: unknown }> = [];

let nextCreateGate: Promise<unknown> | null = null;
let nextCreateFailure: unknown = null;

const createAsync = async (
  source: unknown,
  initialStatus: unknown,
  onPlaybackStatusUpdate?: ((status: FakeStatus) => void) | null
): Promise<{ sound: FakeSound }> => {
  createCalls.push({ source, initialStatus });
  const sound = new FakeSound();
  sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate ?? null);
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

// The shipped catalog is all bundled, so the download cache only has to answer for
// bundled sounds here; backgroundMusicPlayer.remote.test.ts covers remote ones.
const cacheRefreshes: unknown[] = [];
mockModule(mock, sourcePath('services/audio/backgroundSoundCache.ts'), {
  backgroundSoundCache: {
    refresh: async (options: unknown) => {
      cacheRefreshes.push(options);
    },
    getAvailability: (option: { source: { kind: string } }) =>
      option.source.kind === 'bundled' ? 'bundled' : 'remote',
    getCachedUri: async () => null,
    ensureCached: async () => null,
    discard: async () => {},
  },
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type BackgroundMusicPlayerModule = typeof import('./backgroundMusicPlayer');

const FADE_DURATION_MS = 2500;
const AMBIENT_VOLUME = 0.16;
const PIANO_VOLUME = 0.28;
const OCEAN_WAVES_VOLUME = 0.14;

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

const nearEndOfLoop = (remainingMillis = FADE_DURATION_MS): FakeStatus => ({
  isLoaded: true,
  positionMillis: 60_000 - remainingMillis,
  durationMillis: 60_000,
});

// Fades run on setInterval. Enabling the mock clock once (rather than per test)
// keeps a single scheduling timeline; each test starts from a stopped player.
mock.timers.enable({ apis: ['setInterval', 'Date'] });

before(async () => {
  mod = await import('./backgroundMusicPlayer');
});

beforeEach(async () => {
  if (mod) {
    await mod.backgroundMusicPlayer.stop();
    mod.backgroundMusicPlayer.setLevel(0.5);
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
        progressUpdateIntervalMillis: 250,
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

// `isConfigured` is never reset (not by stop(), not by sync('off')), so exactly
// one configureAudioMode call may happen across this whole file.
test('the audio session is configured on the first sync and never again', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.equal(configureAudioModeCalls, 1);
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

test('switching preset while playing crossfades the old loop out as the new one fades in', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const outgoingCallsBefore = outgoing.calls.length;

  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.deepEqual(
    createCalls.map((call) => call.source),
    [ASSET_HANDLES.ambient, ASSET_HANDLES.piano]
  );
  // No hard cut: the old loop is still sounding while the new one starts.
  assert.equal(outgoing.methods().slice(outgoingCallsBefore).includes('stopAsync'), false);
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  assert.equal(createCalls.length, 2, 'the retired loop can no longer start a crossfade');
  assert.deepEqual(sounds[1].methods(), ['setOnPlaybackStatusUpdate', 'playAsync']);

  mock.timers.tick(FADE_DURATION_MS / 2);
  const halfway = outgoing.volumes(outgoingCallsBefore).at(-1) ?? -1;
  assert.equal(halfway > 0 && halfway < AMBIENT_VOLUME, true, 'the old loop fades from its level');
  assert.equal((sounds[1].volumes().at(-1) ?? 0) > 0, true);

  mock.timers.tick(FADE_DURATION_MS);
  await flush();
  assert.equal(outgoing.volumes(outgoingCallsBefore).at(-1), 0);
  assert.deepEqual(outgoing.methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
  assert.equal(sounds[1].volumes().at(-1), PIANO_VOLUME);
});

test('switching preset while paused loads the new one without a crossfade', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  await mod.backgroundMusicPlayer.sync('ambient', false);

  await mod.backgroundMusicPlayer.sync('piano', true);

  assert.deepEqual(sounds[0].methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
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
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
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

test('choosing OFF unloads a disowned sound even when its stop seek rejects', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.rejections.set(
    'stopAsync',
    Object.assign(new Error('Seeking interrupted.'), { code: 'E_AV_SEEKING' })
  );

  await mod.backgroundMusicPlayer.sync('off', false);
  await mod.backgroundMusicPlayer.stop();
  assert.equal(outgoing.statusListener, null);
  assert.equal(outgoing.methods().filter((method) => method === 'unloadAsync').length, 1);
  const volumesAfterOff = outgoing.volumes();
  runFade();
  assert.deepEqual(outgoing.volumes(), volumesAfterOff, 'OFF clears all fade timers');

  await mod.backgroundMusicPlayer.sync('piano', true);
  runFade();
  assert.equal(sounds[1].methods().includes('playAsync'), true);
  assert.equal(sounds[1].volumes().at(-1), PIANO_VOLUME);
});

test('stopping when nothing was ever loaded is a no-op', async () => {
  await assert.doesNotReject(() => mod.backgroundMusicPlayer.stop());

  assert.deepEqual(sounds, []);
});

test('the first sync also rereads which downloaded sounds are on disk', async () => {
  const { BACKGROUND_MUSIC_OPTIONS } = await import('./backgroundMusicCatalog');
  await mod.backgroundMusicPlayer.sync('ambient', true);

  assert.deepEqual(cacheRefreshes, [BACKGROUND_MUSIC_OPTIONS]);
});

test('Shuffle may pick any bundled sound, and never off', () => {
  assert.deepEqual(mod.backgroundMusicPlayer.getShuffleCandidates(), [
    'ambient',
    'piano',
    'soft-guitar',
    'harp',
    'flute',
    'sitar',
    'ocean-waves',
  ]);
});

// ---------------------------------------------------------------------------
// The listener's Sound level
// ---------------------------------------------------------------------------

/** Every volume step is within `maxStep` of the one before it, starting from `from`. */
const isSmoothRamp = (volumes: number[], from: number, maxStep: number): boolean =>
  volumes.every((volume, index) => Math.abs(volume - (volumes[index - 1] ?? from)) <= maxStep);

test('the Sound level scales the volume a sound fades up to', async () => {
  mod.backgroundMusicPlayer.setLevel(1);

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME * 2);
});

test('the Sound level is capped at full volume', async () => {
  mod.backgroundMusicPlayer.setLevel(5);

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME * 2);
});

test('changing the level while playing ramps the live loop without reloading it', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const callsBefore = sounds[0].calls.length;

  mod.backgroundMusicPlayer.setLevel(1);
  mock.timers.tick(1_000);

  const ramp = sounds[0].volumes(callsBefore);
  assert.equal(createCalls.length, 1);
  assert.deepEqual(
    sounds[0]
      .methods()
      .slice(callsBefore)
      .filter((method) => method !== 'setVolumeAsync'),
    [],
    'no restart, pause or reload'
  );
  assert.equal(ramp.length > 4, true, 'a ramp, not a jump');
  assert.equal(isSmoothRamp(ramp, AMBIENT_VOLUME, 0.03), true);
  assert.equal(ramp.at(-1), AMBIENT_VOLUME * 2);
});

test('a level change part way through the fade-in retargets it from where it is', async () => {
  await mod.backgroundMusicPlayer.sync('piano', true);
  mock.timers.tick(FADE_DURATION_MS / 2);
  const callsBefore = sounds[0].calls.length;
  const reached = sounds[0].volumes().at(-1) ?? -1;

  mod.backgroundMusicPlayer.setLevel(0.25);
  mock.timers.tick(FADE_DURATION_MS);

  const ramp = sounds[0].volumes(callsBefore);
  assert.equal(isSmoothRamp(ramp, reached, 0.03), true);
  assert.equal(ramp.at(-1), PIANO_VOLUME / 2);
});

test('a level change during a loop crossfade reaches the incoming loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  mock.timers.tick(FADE_DURATION_MS / 2);

  mod.backgroundMusicPlayer.setLevel(1);
  mock.timers.tick(FADE_DURATION_MS);
  await flush();

  assert.equal(sounds[1].volumes().at(-1), AMBIENT_VOLUME * 2);
  assert.equal(outgoing.volumes().at(-1), 0);
  assert.deepEqual(outgoing.methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
});

test('a level chosen while a loop replacement loads applies to the replacement', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  sounds[0].emitStatus(nearEndOfLoop());
  await flush();

  mod.backgroundMusicPlayer.setLevel(1);
  nextCreateGate = null;
  gate.resolve();
  await flush();
  runFade();

  assert.equal(sounds[1].volumes().at(-1), AMBIENT_VOLUME * 2);
});

test('level 0 silences the bed but keeps it playing and looping', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const callsBefore = sounds[0].calls.length;

  mod.backgroundMusicPlayer.setLevel(0);
  mock.timers.tick(1_000);
  assert.equal(sounds[0].volumes(callsBefore).at(-1), 0);
  assert.equal(sounds[0].methods().includes('pauseAsync'), false);
  assert.equal(sounds[0].methods().includes('unloadAsync'), false);

  sounds[0].emitStatus(nearEndOfLoop());
  await flush();
  runFade();
  assert.equal(createCalls.length, 2, 'the loop still restarts');
  assert.equal(sounds[1].volumes().at(-1), 0);

  mod.backgroundMusicPlayer.setLevel(0.5);
  mock.timers.tick(1_000);
  assert.equal(sounds[1].volumes().at(-1), AMBIENT_VOLUME);
});

for (const transition of ['preset switch', 'loop restart'] as const) {
  test(`level 0 silences both loops during ${transition} without the old fade restoring volume`, async () => {
    await mod.backgroundMusicPlayer.sync('ambient', true);
    runFade();
    const outgoing = sounds[0];
    if (transition === 'preset switch') await mod.backgroundMusicPlayer.sync('piano', true);
    else {
      outgoing.emitStatus(nearEndOfLoop());
      await flush();
    }
    mock.timers.tick(100);
    const incoming = sounds[1];

    mod.backgroundMusicPlayer.setLevel(0);
    mock.timers.tick(400);
    await flush();

    assert.equal(incoming.volumes().at(-1), 0);
    assert.equal(outgoing.volumes().at(-1), 0, 'the outgoing loop must obey Sound level 0');
    assert.equal(outgoing.methods().filter((method) => method === 'unloadAsync').length, 1);
    mock.timers.tick(500);
    assert.equal(outgoing.volumes().at(-1), 0, 'the previous fade timer cannot restore volume');
    assert.equal(incoming.methods().includes('unloadAsync'), false, 'the live loop remains ready');
    mod.backgroundMusicPlayer.setLevel(0.5);
    mock.timers.tick(400);
    assert.equal(
      incoming.volumes().at(-1),
      transition === 'preset switch' ? PIANO_VOLUME : AMBIENT_VOLUME
    );
  });

  test(`level 0 cannot extend a ${transition} already nearing retirement`, async () => {
    await mod.backgroundMusicPlayer.sync('ambient', true);
    runFade();
    const outgoing = sounds[0];
    if (transition === 'preset switch') await mod.backgroundMusicPlayer.sync('piano', true);
    else {
      outgoing.emitStatus(nearEndOfLoop(1_000));
      await flush();
    }
    // Both outgoing fades have 200 ms left: preset fades take 2500 ms, and
    // this short remaining loop retires in 750 ms.
    mock.timers.tick(transition === 'preset switch' ? 2_300 : 550);
    mod.backgroundMusicPlayer.setLevel(0);
    mock.timers.tick(200);
    await flush();

    assert.equal(outgoing.volumes().at(-1), 0);
    assert.equal(outgoing.methods().filter((method) => method === 'unloadAsync').length, 1);
  });
}

test('level 0 mutes the outgoing loop while the replacement preset is still loading', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  const replacement = mod.backgroundMusicPlayer.sync('piano', true);
  await flush();

  mod.backgroundMusicPlayer.setLevel(0);
  mock.timers.tick(400);
  await flush();
  assert.equal(outgoing.volumes().at(-1), 0);
  assert.ok(outgoing.methods().includes('unloadAsync'));
  nextCreateGate = null;
  gate.resolve();
  await replacement;
  runFade();
  assert.equal(sounds[1].volumes().at(-1), 0);
  assert.equal(sounds[1].methods().includes('unloadAsync'), false);
});

test('rapid level 0 then unmute resumes only the live loop while the outgoing loop retires', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  await mod.backgroundMusicPlayer.sync('piano', true);
  mock.timers.tick(100);

  mod.backgroundMusicPlayer.setLevel(0);
  mock.timers.tick(150);
  mod.backgroundMusicPlayer.setLevel(0.5);
  mock.timers.tick(400);
  await flush();

  assert.equal(outgoing.volumes().at(-1), 0);
  assert.equal(outgoing.methods().filter((method) => method === 'unloadAsync').length, 1);
  assert.equal(sounds[1].volumes().at(-1), PIANO_VOLUME);
  assert.equal(sounds[1].methods().includes('unloadAsync'), false);
});

test('level 0 silences every outgoing loop after rapid preset changes', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('piano', true);
  mock.timers.tick(100);
  await mod.backgroundMusicPlayer.sync('soft-guitar', true);

  mod.backgroundMusicPlayer.setLevel(0);
  mock.timers.tick(400);
  await flush();

  for (const outgoing of sounds.slice(0, 2)) {
    assert.equal(outgoing.volumes().at(-1), 0);
    assert.equal(outgoing.methods().filter((method) => method === 'unloadAsync').length, 1);
  }
  assert.equal(sounds[2].volumes().at(-1), 0);
  assert.equal(sounds[2].methods().includes('unloadAsync'), false);
});

test('a level change while paused leaves the paused loop alone and applies on resume', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('ambient', false);
  const callsBefore = sounds[0].calls.length;

  mod.backgroundMusicPlayer.setLevel(1);
  mock.timers.tick(1_000);
  assert.equal(sounds[0].calls.length, callsBefore);

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME * 2);
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

test('fading out ramps the playing loop to silence and leaves pausing it to the caller', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const callsBefore = sounds[0].calls.length;

  mod.backgroundMusicPlayer.fadeOut(3000);
  mock.timers.tick(3000);

  const volumes = sounds[0].volumes(callsBefore);
  assert.equal(volumes.length, 3000 / 50);
  assert.equal(volumes[0] < AMBIENT_VOLUME, true);
  assert.equal(volumes.at(-1), 0);
  assert.equal(sounds[0].methods().slice(callsBefore).includes('pauseAsync'), false);
});

test('a loop faded out and paused fades back in on the next play', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  mod.backgroundMusicPlayer.fadeOut(3000);
  mock.timers.tick(3000);
  await mod.backgroundMusicPlayer.sync('ambient', false);

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  assert.equal(createCalls.length, 1);
  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME);
});

test('fading out with nothing playing does nothing', async () => {
  mod.backgroundMusicPlayer.fadeOut(3000);
  await mod.backgroundMusicPlayer.sync('ambient', false);
  mod.backgroundMusicPlayer.fadeOut(3000);
  mock.timers.tick(3000);

  assert.deepEqual(sounds, []);
});

test('pausing while switching to a different preset unloads instead of pausing', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);

  await mod.backgroundMusicPlayer.sync('piano', false);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(sounds[0].methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
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

test('a volume change that fails mid-fade lets the ramp run to the target anyway', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  // expo-av rejects setVolumeAsync once the sound is released. The fade runs on
  // an interval, so an unhandled rejection there would take down the process
  // rather than the one step that failed.
  sounds[0].rejections.set('setVolumeAsync', new Error('sound released'));

  runFade();
  await flush();

  assert.equal(sounds[0].volumes().length, FADE_DURATION_MS / 50);
  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME);
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
    progressUpdateIntervalMillis: 250,
  });
  // A retained SDK callback has no authority after its sound retires.
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  assert.equal(createCalls.length, 2, 'late retired status must not re-enter crossfade');

  const outgoingCallsBefore = outgoing.calls.length;
  runFade();
  await flush();

  assert.equal(outgoing.volumes(outgoingCallsBefore).at(-1), 0);
  assert.deepEqual(outgoing.methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
  assert.equal(sounds[1].volumes().at(-1), AMBIENT_VOLUME);
});

test('the crossfade starts early enough to finish before the loop file runs out', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];

  // 3.2 s left: past the fade length, but a load and a full fade still fit.
  outgoing.emitStatus(nearEndOfLoop(3_200));
  await flush();
  assert.equal(createCalls.length, 2, 'the replacement is already loading');
});

test('a late position update shortens the fade-out so the old loop is silent before it ends', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const outgoingCallsBefore = outgoing.calls.length;

  // Only 2 s left when the update arrives: a full 2.5 s fade would be cut off mid-way.
  outgoing.emitStatus(nearEndOfLoop(2_000));
  await flush();
  mock.timers.tick(1_950);

  assert.equal(outgoing.volumes(outgoingCallsBefore).at(-1), 0);
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
  let stopped = false;
  const stopping = mod.backgroundMusicPlayer.stop().then(() => {
    stopped = true;
  });
  await flush();
  assert.equal(stopped, false, 'stop owns the pending crossfade until its candidate is released');
  gate.resolve();
  await stopping;
  await flush();

  assert.deepEqual(sounds[1].methods(), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
});

test('a crossfade that cannot load a replacement restarts the current loop from the top', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  const callsBefore = outgoing.calls.length;
  nextCreateFailure = new Error('asset unavailable');

  outgoing.emitStatus(nearEndOfLoop());
  await flush();

  assert.deepEqual(outgoing.methods().slice(callsBefore), ['setPositionAsync']);
  assert.equal(outgoing.calls.at(-1)?.args[0], 0);
  assert.notEqual(outgoing.statusListener, null);
});

test('a failed crossfade and rewind are contained until a later status retries', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.setPositionAsync = async (positionMillis: number) => {
    outgoing.calls.push({ method: 'setPositionAsync', args: [positionMillis] });
    outgoing.emitStatus(nearEndOfLoop()); // Native status may arrive during the rewind.
    throw new Error('sound released');
  };
  nextCreateFailure = new Error('asset unavailable');

  outgoing.emitStatus(nearEndOfLoop());
  await flush();

  assert.equal(createCalls.length, 2, 'a rejected rewind must not recursively create replacements');
  await flush();
  assert.equal(createCalls.length, 2, 'no retry occurs without a new status');
  assert.notEqual(outgoing.statusListener, null);
  nextCreateFailure = null;
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  assert.equal(createCalls.length, 3, 'the owned loop can recover on a later status');
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  assert.equal(createCalls.length, 3, 'the replaced loop has lost status authority');
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
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
  assert.deepEqual(incoming.methods().slice(incomingCallsBefore), ['setVolumeAsync', 'pauseAsync']);
});

test('pausing during crossfade unloads the retiring sound when its stop seek rejects', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  const incoming = sounds[1];
  outgoing.rejections.set(
    'stopAsync',
    Object.assign(new Error('Seeking interrupted.'), { code: 'E_AV_SEEKING' })
  );

  await mod.backgroundMusicPlayer.sync('ambient', false);
  assert.equal(outgoing.statusListener, null);
  assert.equal(outgoing.methods().includes('unloadAsync'), true);
  assert.equal(incoming.methods().includes('pauseAsync'), true);
  assert.equal(incoming.methods().includes('unloadAsync'), false, 'pause keeps the active loop');
  const volumesAfterPause = [outgoing.volumes(), incoming.volumes()];
  runFade();
  assert.deepEqual([outgoing.volumes(), incoming.volumes()], volumesAfterPause);

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  assert.equal(createCalls.length, 2, 'resume reuses the active loop');
  assert.equal(incoming.volumes().at(-1), AMBIENT_VOLUME);
});

test('a retiring sound failing to stop and unload cannot skip releasing the active sound', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const outgoing = sounds[0];
  outgoing.emitStatus(nearEndOfLoop());
  await flush();
  const incoming = sounds[1];
  outgoing.rejections.set('stopAsync', new Error('Seeking interrupted.'));
  outgoing.rejections.set('unloadAsync', new Error('native unload failed'));

  await assert.doesNotReject(() => mod.backgroundMusicPlayer.stop());
  assert.equal(outgoing.methods().includes('unloadAsync'), true);
  assert.equal(incoming.methods().includes('unloadAsync'), true);
  assert.equal(incoming.statusListener, null);
  const volumesAfterStop = [outgoing.volumes(), incoming.volumes()];
  runFade();
  assert.deepEqual([outgoing.volumes(), incoming.volumes()], volumesAfterStop);
});

test('stop waits for retiring cleanup already detached by a paused sync', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('piano', true);
  const gate = createDeferred();
  const outgoing = assertDefined(sounds[0], 'loaded ambient sound');
  outgoing.gates.set('stopAsync', gate.promise);
  const pausing = mod.backgroundMusicPlayer.sync('piano', false);
  await flush();
  let stopped = false;
  const stopping = mod.backgroundMusicPlayer.stop().then(() => {
    stopped = true;
  });
  await flush();
  const stoppedBeforeCleanup = stopped;
  gate.resolve();
  await Promise.all([pausing, stopping]);

  assert.equal(stoppedBeforeCleanup, false, 'stop must drain the already-detached outgoing loop');
  for (const sound of sounds) assert.ok(sound.methods().includes('unloadAsync'));
});

test('repeated stop waits for the same detached native cleanup without releasing twice', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  const gate = createDeferred();
  const sound = assertDefined(sounds[0], 'loaded ambient sound');
  sound.gates.set('unloadAsync', gate.promise);
  const first = mod.backgroundMusicPlayer.stop();
  await flush();
  let secondDone = false;
  const second = mod.backgroundMusicPlayer.stop().then(() => {
    secondDone = true;
  });
  await flush();
  const secondBeforeCleanup = secondDone;
  gate.resolve();
  await Promise.all([first, second]);

  assert.equal(secondBeforeCleanup, false);
  assert.equal(sound.methods().filter((method) => method === 'stopAsync').length, 1);
  assert.equal(sound.methods().filter((method) => method === 'unloadAsync').length, 1);
});

test('stop drains cleanup started by Sound Off even if stop rejected before unload', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  const sound = assertDefined(sounds[0], 'loaded ambient sound');
  const gate = createDeferred();
  sound.rejections.set('stopAsync', new Error('Seeking interrupted.'));
  sound.gates.set('unloadAsync', gate.promise);
  const off = mod.backgroundMusicPlayer.sync('off', false);
  await flush();
  let stopped = false;
  const stopping = mod.backgroundMusicPlayer.stop().then(() => {
    stopped = true;
  });
  await flush();
  const stoppedBeforeUnload = stopped;
  gate.resolve();
  await Promise.all([off, stopping]);

  assert.equal(stoppedBeforeUnload, false);
  assert.equal(sound.methods().filter((method) => method === 'unloadAsync').length, 1);
});

test('stop waits for native cleanup begun at the end of an outgoing fade', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  await mod.backgroundMusicPlayer.sync('piano', true);
  const gate = createDeferred();
  assertDefined(sounds[0], 'loaded ambient sound').gates.set('unloadAsync', gate.promise);
  runFade();
  await flush();
  let stopped = false;
  const stopping = mod.backgroundMusicPlayer.stop().then(() => {
    stopped = true;
  });
  await flush();
  const stoppedBeforeCleanup = stopped;
  gate.resolve();
  await stopping;

  assert.equal(stoppedBeforeCleanup, false);
  for (const sound of sounds)
    assert.equal(sound.methods().filter((method) => method === 'unloadAsync').length, 1);
});

test('cleanup is registered before a native stop callback reenters stop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  const sound = assertDefined(sounds[0], 'loaded ambient sound');
  const gate = createDeferred();
  sound.gates.set('stopAsync', gate.promise);
  const originalStop = sound.stopAsync;
  let nestedStop: Promise<void> | null = null;
  let nestedDone = false;
  sound.stopAsync = () => {
    const result = originalStop();
    nestedStop = mod.backgroundMusicPlayer.stop().then(() => {
      nestedDone = true;
    });
    return result;
  };
  const stopping = mod.backgroundMusicPlayer.stop();
  await flush();
  const nestedBeforeCleanup = nestedDone;
  gate.resolve();
  await Promise.all([stopping, nestedStop]);

  assert.equal(nestedBeforeCleanup, false);
  assert.equal(nestedDone, true);
  assert.equal(sound.methods().filter((method) => method === 'unloadAsync').length, 1);
});

test('synchronous detach and stop errors cannot bypass an owned native unload', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  const sound = assertDefined(sounds[0], 'loaded ambient sound');
  const gate = createDeferred();
  sound.rejections.set('setOnPlaybackStatusUpdate', new Error('listener detached'));
  sound.stopAsync = () => {
    sound.calls.push({ method: 'stopAsync', args: [] });
    throw new Error('Seeking interrupted.');
  };
  sound.gates.set('unloadAsync', gate.promise);
  let stopped = false;
  const stopping = mod.backgroundMusicPlayer.stop().then(() => {
    stopped = true;
  });
  await flush();
  const beforeCleanup = stopped;
  gate.resolve();
  await stopping;

  assert.equal(beforeCleanup, false);
  assert.deepEqual(sound.methods().slice(-3), [
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
});

test('stopping during a crossfade unloads both the retiring and the current loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  sounds[0].emitStatus(nearEndOfLoop());
  await flush();
  await mod.backgroundMusicPlayer.stop();

  for (const sound of sounds) {
    assert.deepEqual(sound.methods().slice(-3), [
      'stopAsync',
      'unloadAsync',
      'setOnPlaybackStatusUpdate',
    ]);
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

  assert.deepEqual(sounds[0].methods(), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
    'setOnPlaybackStatusUpdate',
  ]);
});

test('pausing before the first preset finishes loading never starts the music', async () => {
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  const pending = mod.backgroundMusicPlayer.sync('ambient', true);
  await flush();

  await mod.backgroundMusicPlayer.sync('ambient', false);
  nextCreateGate = null;
  gate.resolve();
  await pending;
  runFade();

  assert.equal(sounds[0].methods().includes('playAsync'), false);
  assert.equal(
    sounds[0].volumes().some((volume) => volume > 0),
    false
  );
});

test('pausing while a crossfade replacement loads keeps both loops silent', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  sounds[0].emitStatus(nearEndOfLoop());
  await flush();

  await mod.backgroundMusicPlayer.sync('ambient', false);
  nextCreateGate = null;
  gate.resolve();
  await flush();
  runFade();

  assert.equal(
    sounds[1].volumes().some((volume) => volume > 0),
    false
  );
  assert.equal(sounds[1].methods().includes('unloadAsync'), true);
});

test('a superseded preset load cannot restart the newer paused preset', async () => {
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  const oldLoad = mod.backgroundMusicPlayer.sync('ambient', true);
  await flush();
  nextCreateGate = null;

  await mod.backgroundMusicPlayer.sync('piano', true);
  await mod.backgroundMusicPlayer.sync('piano', false);
  const newSound = sounds[1];
  const callsAtPause = newSound.calls.length;
  gate.resolve();
  await oldLoad;
  runFade();

  assert.equal(newSound.methods().slice(callsAtPause).includes('playAsync'), false);
  assert.equal(
    newSound.volumes(callsAtPause).some((volume) => volume > 0),
    false
  );
});

test('an immediate stop supersedes a preset before audio configuration finishes', async () => {
  const pending = mod.backgroundMusicPlayer.sync('ambient', true);
  await mod.backgroundMusicPlayer.stop();
  await pending;
  runFade();

  assert.equal(
    sounds.some((sound) => sound.methods().includes('playAsync')),
    false
  );
});

test('a failed play can be retried for the same preset', async () => {
  soundDefaultRejections.set('playAsync', new Error('audio focus denied'));
  await mod.backgroundMusicPlayer.sync('ambient', true);
  sounds[0].rejections.delete('playAsync');

  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();

  assert.equal(sounds[0].methods().filter((method) => method === 'playAsync').length, 2);
  assert.equal(sounds[0].volumes().at(-1), AMBIENT_VOLUME);
});

test('a delayed pause cannot pause a subsequently resumed loop', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const gate = createDeferred();
  sounds[0].gates.set('setVolumeAsync', gate.promise);
  const pause = mod.backgroundMusicPlayer.sync('ambient', false);
  await flush();
  sounds[0].gates.clear();

  await mod.backgroundMusicPlayer.sync('ambient', true);
  const callsAtResume = sounds[0].calls.length;
  gate.resolve();
  await pause;

  assert.equal(sounds[0].methods().slice(callsAtResume).includes('pauseAsync'), false);
});

test('a cancelled crossfade that fails still permits looping after resume', async () => {
  await mod.backgroundMusicPlayer.sync('ambient', true);
  runFade();
  const gate = createDeferred();
  nextCreateGate = gate.promise;
  nextCreateFailure = new Error('load interrupted');
  const current = sounds[0];
  current.emitStatus(nearEndOfLoop());
  await flush();
  await mod.backgroundMusicPlayer.sync('ambient', false);
  nextCreateGate = null;
  nextCreateFailure = null;
  gate.resolve();
  await flush();

  await mod.backgroundMusicPlayer.sync('ambient', true);
  current.emitStatus(nearEndOfLoop());
  await flush();

  assert.equal(createCalls.length, 3);
});
