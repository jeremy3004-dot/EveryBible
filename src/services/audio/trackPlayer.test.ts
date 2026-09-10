import assert from 'node:assert/strict';
import test, { after, before, beforeEach, mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';

// ---------------------------------------------------------------------------
// Scripted expo-av fake
//
// `Audio.Sound.createAsync` hands back a FakeSound that records every call and
// keeps the status callback trackPlayer registered, so tests can push
// AVPlaybackStatus updates through the same channel expo-av uses. Loads can be
// gated (`gateNextCreate`) or made to fail (`failNextCreate`) so the stale-load
// race and error paths are reachable without timing tricks.
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface FakeStatus {
  isLoaded: boolean;
  positionMillis?: number;
  durationMillis?: number;
  playableDurationMillis?: number;
  isPlaying?: boolean;
  isBuffering?: boolean;
  didJustFinish?: boolean;
  error?: string;
}

class FakeSound {
  readonly calls: RecordedCall[] = [];
  readonly rejections = new Map<string, unknown>();
  statusListener: ((status: FakeStatus) => void) | null = null;
  status: FakeStatus = {
    isLoaded: true,
    positionMillis: 0,
    durationMillis: 0,
    playableDurationMillis: 0,
    isPlaying: false,
    isBuffering: false,
    didJustFinish: false,
  };

  playAsync = (): Promise<void> => this.record('playAsync', []);
  pauseAsync = (): Promise<void> => this.record('pauseAsync', []);
  stopAsync = (): Promise<void> => this.record('stopAsync', []);
  unloadAsync = (): Promise<void> => this.record('unloadAsync', []);
  setRateAsync = (rate: number, correctPitch: boolean): Promise<void> =>
    this.record('setRateAsync', [rate, correctPitch]);
  setPositionAsync = (positionMillis: number): Promise<void> =>
    this.record('setPositionAsync', [positionMillis]);
  setOnPlaybackStatusUpdate = (listener: ((status: FakeStatus) => void) | null): void => {
    this.calls.push({ method: 'setOnPlaybackStatusUpdate', args: [listener] });
    this.statusListener = listener;
  };
  getStatusAsync = async (): Promise<FakeStatus> => {
    this.calls.push({ method: 'getStatusAsync', args: [] });
    const failure = this.rejections.get('getStatusAsync');
    if (failure) {
      throw failure;
    }
    return this.status;
  };

  /** Push an AVPlaybackStatus through the callback trackPlayer registered. */
  emitStatus(status: FakeStatus): void {
    this.statusListener?.(status);
  }

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }

  private record(method: string, args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    const failure = this.rejections.get(method);
    return failure ? Promise.reject(failure) : Promise.resolve();
  }
}

const soundInstances: FakeSound[] = [];
const createCalls: Array<{ source: unknown; initialStatus: unknown }> = [];
const audioModeCalls: unknown[] = [];

let nextCreateGate: Promise<unknown> | null = null;
let nextCreateFailure: unknown = null;

const createAsync = async (
  source: unknown,
  initialStatus: unknown,
  onStatus?: (status: FakeStatus) => void
): Promise<{ sound: FakeSound; status: FakeStatus }> => {
  createCalls.push({ source, initialStatus });
  const sound = new FakeSound();
  sound.statusListener = onStatus ?? null;
  soundInstances.push(sound);

  const gate = nextCreateGate;
  const failure = nextCreateFailure;
  if (gate) {
    await gate;
  }
  if (failure) {
    soundInstances.splice(soundInstances.indexOf(sound), 1);
    throw failure;
  }

  return { sound, status: sound.status };
};

mockModule(mock, 'expo-av', {
  Audio: {
    Sound: class {
      static createAsync = createAsync;
    },
    setAudioModeAsync: async (mode: unknown): Promise<void> => {
      audioModeCalls.push(mode);
    },
  },
  InterruptionModeIOS: { MixWithOthers: 0, DoNotMix: 1, DuckOthers: 2 },
  InterruptionModeAndroid: { DoNotMix: 1, DuckOthers: 2 },
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type TrackPlayerModule = typeof import('./trackPlayer');

let mod: TrackPlayerModule;

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Records every event the wrapper emits, in order. */
function recordEvents(): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const event of Object.values(mod.Event)) {
    mod.addEventListener(event, (data: unknown) => {
      events.push({ event, data });
    });
  }
  return events;
}

function captureWarnings(): { messages: unknown[][]; restore: () => void } {
  const original = console.warn;
  const messages: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    messages.push(args);
  };
  return {
    messages,
    restore: () => {
      console.warn = original;
    },
  };
}

const track = (id: string, url = `https://audio.test/${id}.mp3`) => ({ id, url });

before(async () => {
  mod = await import('./trackPlayer');
});

beforeEach(async () => {
  // destroy() drops listeners and unloads; setRate resets the sticky rate.
  await mod.default.destroy();
  await mod.default.setRate(1.0);
  soundInstances.length = 0;
  createCalls.length = 0;
  audioModeCalls.length = 0;
  nextCreateGate = null;
  nextCreateFailure = null;
});

after(async () => {
  await mod.default.destroy();
});

// ---------------------------------------------------------------------------
// setupPlayer
// ---------------------------------------------------------------------------

test('setupPlayer claims the audio session for background narration instead of mixing', async () => {
  await mod.default.setupPlayer();

  assert.deepEqual(audioModeCalls, [
    {
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    },
  ]);
});

test('setupPlayer configures the session once and announces Ready a single time', async () => {
  const events = recordEvents();

  await mod.default.setupPlayer();
  await mod.default.setupPlayer({ minBuffer: 5 });

  assert.equal(audioModeCalls.length, 1);
  assert.deepEqual(events, [{ event: mod.Event.PlaybackState, data: { state: mod.State.Ready } }]);
});

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

test('add loads the track through expo-av and publishes it as the active track', async () => {
  const events = recordEvents();

  await mod.default.add(track('gen1'));

  assert.deepEqual(createCalls, [
    {
      source: { uri: 'https://audio.test/gen1.mp3' },
      initialStatus: {
        shouldPlay: false,
        rate: 1,
        shouldCorrectPitch: true,
        progressUpdateIntervalMillis: 1000,
      },
    },
  ]);
  assert.deepEqual(events, [
    { event: mod.Event.PlaybackState, data: { state: mod.State.Ready } },
    { event: mod.Event.PlaybackState, data: { state: mod.State.Loading } },
    { event: mod.Event.PlaybackState, data: { state: mod.State.Ready } },
    { event: mod.Event.PlaybackActiveTrackChanged, data: { track: track('gen1') } },
  ]);
  assert.deepEqual(await mod.default.getActiveTrack(), track('gen1'));
});

test('add loads only the first track of an array because the queue lives in audioStore', async () => {
  await mod.default.add([track('first'), track('second')]);

  assert.equal(createCalls.length, 1);
  assert.deepEqual(await mod.default.getActiveTrack(), track('first'));
});

test('add ignores an empty track list', async () => {
  const events = recordEvents();

  await mod.default.add([]);

  assert.deepEqual(createCalls, []);
  assert.deepEqual(events, []);
});

test('add unloads the previously loaded sound before loading the replacement', async () => {
  await mod.default.add(track('first'));
  await mod.default.add(track('second'));

  assert.deepEqual(soundInstances[0].methods(), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
  assert.equal(soundInstances[0].calls[0].args[0], null);
  assert.deepEqual(soundInstances[1].methods(), []);
  assert.deepEqual(await mod.default.getActiveTrack(), track('second'));
});

test('add applies the sticky playback rate to the next load', async () => {
  await mod.default.setRate(1.5);

  await mod.default.add(track('gen1'));

  assert.deepEqual(createCalls[0].initialStatus, {
    shouldPlay: false,
    rate: 1.5,
    shouldCorrectPitch: true,
    progressUpdateIntervalMillis: 1000,
  });
});

test('a stale load that finishes after a newer one is unloaded instead of becoming active', async () => {
  const events = recordEvents();
  const gate = createDeferred();

  nextCreateGate = gate.promise;
  const stalePending = mod.default.add(track('stale'));
  await flush();

  nextCreateGate = null;
  await mod.default.add(track('fresh'));

  gate.resolve();
  await stalePending;

  const [staleSound, freshSound] = soundInstances;
  assert.deepEqual(staleSound.methods(), ['stopAsync', 'unloadAsync']);
  assert.deepEqual(freshSound.methods(), []);
  assert.deepEqual(await mod.default.getActiveTrack(), track('fresh'));
  assert.deepEqual(
    events.filter((entry) => entry.event === mod.Event.PlaybackActiveTrackChanged),
    [{ event: mod.Event.PlaybackActiveTrackChanged, data: { track: track('fresh') } }]
  );
});

test('a stale load that fails after a newer one succeeded is swallowed', async () => {
  const events = recordEvents();
  const gate = createDeferred();

  nextCreateGate = gate.promise;
  nextCreateFailure = new Error('stale network failure');
  const stalePending = mod.default.add(track('stale'));
  await flush();

  nextCreateGate = null;
  nextCreateFailure = null;
  await mod.default.add(track('fresh'));

  gate.resolve();
  await assert.doesNotReject(stalePending);

  assert.deepEqual(
    events.filter((entry) => entry.event === mod.Event.PlaybackError),
    []
  );
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Ready });
});

test('add surfaces a load failure as a PlaybackError and rethrows for the caller', async () => {
  const events = recordEvents();
  nextCreateFailure = new Error('404 not found');

  await assert.rejects(() => mod.default.add(track('missing')), /404 not found/);

  assert.deepEqual(
    events.filter((entry) => entry.event !== mod.Event.PlaybackState),
    [
      {
        event: mod.Event.PlaybackError,
        data: { code: 'LOAD_ERROR', message: '404 not found' },
      },
    ]
  );
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Error });
});

test('add reports a generic message when the load rejects with a non-Error value', async () => {
  const events = recordEvents();
  nextCreateFailure = 'kaboom';

  await assert.rejects(() => mod.default.add(track('missing')));

  assert.deepEqual(
    events.filter((entry) => entry.event === mod.Event.PlaybackError),
    [
      {
        event: mod.Event.PlaybackError,
        data: { code: 'LOAD_ERROR', message: 'Failed to load track' },
      },
    ]
  );
});

// ---------------------------------------------------------------------------
// AVPlaybackStatus -> event translation
// ---------------------------------------------------------------------------

test('a playing status update reports progress in seconds and moves the player to Playing', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({
    isLoaded: true,
    positionMillis: 12_500,
    durationMillis: 60_000,
    playableDurationMillis: 30_000,
    isPlaying: true,
  });

  assert.deepEqual(events, [
    {
      event: mod.Event.PlaybackProgressUpdated,
      data: { position: 12.5, duration: 60, buffered: 30 },
    },
    { event: mod.Event.PlaybackState, data: { state: mod.State.Playing } },
  ]);
});

test('a status update without a buffered figure reports the current position as buffered', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({ isLoaded: true, positionMillis: 4_000, isPlaying: true });

  assert.deepEqual(events[0], {
    event: mod.Event.PlaybackProgressUpdated,
    data: { position: 4, duration: 0, buffered: 4 },
  });
});

test('a buffering status update moves the player to Buffering', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({
    isLoaded: true,
    positionMillis: 0,
    isPlaying: false,
    isBuffering: true,
  });

  assert.deepEqual(events[1], {
    event: mod.Event.PlaybackState,
    data: { state: mod.State.Buffering },
  });
});

test('a stalled status update that is neither playing nor buffering reports Paused', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({ isLoaded: true, positionMillis: 1_000, isPlaying: false });

  assert.deepEqual(events[1], {
    event: mod.Event.PlaybackState,
    data: { state: mod.State.Paused },
  });
});

test('didJustFinish ends the queue and returns the player to Ready', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].emitStatus({ isLoaded: true, positionMillis: 0, isPlaying: true });
  const events = recordEvents();

  soundInstances[0].emitStatus({
    isLoaded: true,
    positionMillis: 60_000,
    durationMillis: 60_000,
    isPlaying: false,
    didJustFinish: true,
  });

  assert.deepEqual(events, [
    {
      event: mod.Event.PlaybackProgressUpdated,
      data: { position: 60, duration: 60, buffered: 60 },
    },
    { event: mod.Event.PlaybackQueueEnded, data: {} },
    { event: mod.Event.PlaybackState, data: { state: mod.State.Ready } },
  ]);
});

test('an unloaded status carrying an error surfaces a PlaybackError', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({ isLoaded: false, error: 'AVFoundation decode failure' });

  assert.deepEqual(events, [
    { event: mod.Event.PlaybackState, data: { state: mod.State.Error } },
    {
      event: mod.Event.PlaybackError,
      data: { code: 'LOAD_ERROR', message: 'AVFoundation decode failure' },
    },
  ]);
});

test('an unloaded status without an error is ignored', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  soundInstances[0].emitStatus({ isLoaded: false });

  assert.deepEqual(events, []);
});

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------

test('play, pause and seekTo drive the loaded sound', async () => {
  await mod.default.add(track('gen1'));

  await mod.default.play();
  await mod.default.pause();
  await mod.default.seekTo(42.5);

  assert.deepEqual(soundInstances[0].calls, [
    { method: 'playAsync', args: [] },
    { method: 'pauseAsync', args: [] },
    { method: 'setPositionAsync', args: [42_500] },
  ]);
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Paused });
});

test('transport controls are no-ops while nothing is loaded', async () => {
  const events = recordEvents();

  await mod.default.play();
  await mod.default.pause();
  await mod.default.seekTo(10);

  assert.deepEqual(events, []);
  assert.deepEqual(soundInstances, []);
});

test('a failed play surfaces PLAY_ERROR without throwing', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('playAsync', new Error('session busy'));
  const events = recordEvents();

  await assert.doesNotReject(() => mod.default.play());

  assert.deepEqual(events, [
    { event: mod.Event.PlaybackError, data: { code: 'PLAY_ERROR', message: 'session busy' } },
  ]);
});

test('a failed pause surfaces PAUSE_ERROR without throwing', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('pauseAsync', 'not an error');
  const events = recordEvents();

  await assert.doesNotReject(() => mod.default.pause());

  assert.deepEqual(events, [
    { event: mod.Event.PlaybackError, data: { code: 'PAUSE_ERROR', message: 'Failed to pause' } },
  ]);
});

test('a failed seek surfaces SEEK_ERROR without throwing', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('setPositionAsync', new Error('seek past end'));
  const events = recordEvents();

  await assert.doesNotReject(() => mod.default.seekTo(5));

  assert.deepEqual(events, [
    { event: mod.Event.PlaybackError, data: { code: 'SEEK_ERROR', message: 'seek past end' } },
  ]);
});

test('setRate applies pitch correction to the loaded sound', async () => {
  await mod.default.add(track('gen1'));

  await mod.default.setRate(1.25);

  assert.deepEqual(soundInstances[0].calls, [{ method: 'setRateAsync', args: [1.25, true] }]);
});

test('a failed rate change surfaces RATE_ERROR without throwing', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('setRateAsync', new Error('rate unsupported'));
  const events = recordEvents();

  await assert.doesNotReject(() => mod.default.setRate(2));

  assert.deepEqual(events, [
    { event: mod.Event.PlaybackError, data: { code: 'RATE_ERROR', message: 'rate unsupported' } },
  ]);
});

// ---------------------------------------------------------------------------
// Progress reads
// ---------------------------------------------------------------------------

test('getProgress reports zeroes while nothing is loaded', async () => {
  assert.deepEqual(await mod.default.getProgress(), { position: 0, duration: 0, buffered: 0 });
});

test('getProgress converts the loaded sound status to seconds', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].status = {
    isLoaded: true,
    positionMillis: 15_000,
    durationMillis: 300_000,
    playableDurationMillis: 90_000,
  };

  assert.deepEqual(await mod.default.getProgress(), {
    position: 15,
    duration: 300,
    buffered: 90,
  });
});

test('getProgress reports zeroes when the sound says it is no longer loaded', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].status = { isLoaded: false };

  assert.deepEqual(await mod.default.getProgress(), { position: 0, duration: 0, buffered: 0 });
});

test('getProgress reports zeroes when the status read throws', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('getStatusAsync', new Error('sound released'));

  assert.deepEqual(await mod.default.getProgress(), { position: 0, duration: 0, buffered: 0 });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

test('stop unloads the sound, clears the active track and announces the change', async () => {
  await mod.default.add(track('gen1'));
  const events = recordEvents();

  await mod.default.stop();

  assert.deepEqual(soundInstances[0].methods(), [
    'setOnPlaybackStatusUpdate',
    'stopAsync',
    'unloadAsync',
  ]);
  assert.deepEqual(events, [
    { event: mod.Event.PlaybackState, data: { state: mod.State.Stopped } },
    { event: mod.Event.PlaybackActiveTrackChanged, data: { track: null } },
  ]);
  assert.equal(await mod.default.getActiveTrack(), null);
});

test('stop tolerates a sound that is already gone', async () => {
  await mod.default.add(track('gen1'));
  soundInstances[0].rejections.set('stopAsync', new Error('already unloaded'));

  await assert.doesNotReject(() => mod.default.stop());

  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Stopped });
  assert.deepEqual(await mod.default.getProgress(), { position: 0, duration: 0, buffered: 0 });
});

test('reset returns the player to None and re-configures the session on the next setup', async () => {
  await mod.default.setupPlayer();

  await mod.default.reset();

  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.None });

  await mod.default.setupPlayer();
  assert.equal(audioModeCalls.length, 2);
});

test('destroy drops every registered listener', async () => {
  const events = recordEvents();

  await mod.default.destroy();
  const eventsAfterDestroy = events.length;
  await mod.default.setupPlayer();

  assert.equal(events.length, eventsAfterDestroy);
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Ready });
});

// ---------------------------------------------------------------------------
// Listener registry
// ---------------------------------------------------------------------------

test('removing one subscription leaves the other listeners for that event subscribed', async () => {
  const kept: unknown[] = [];
  const removed: unknown[] = [];
  mod.addEventListener(mod.Event.PlaybackState, (data) => kept.push(data));
  const subscription = mod.addEventListener(mod.Event.PlaybackState, (data) => removed.push(data));

  subscription.remove();
  await mod.default.setupPlayer();

  assert.deepEqual(kept, [{ state: mod.State.Ready }]);
  assert.deepEqual(removed, []);
});

test('a listener that throws is warned about and does not block the other listeners', async () => {
  const warnings = captureWarnings();
  const seen: unknown[] = [];
  const throwing = mod.addEventListener(mod.Event.PlaybackState, () => {
    throw new Error('listener exploded');
  });
  const healthy = mod.addEventListener(mod.Event.PlaybackState, (data) => seen.push(data));

  try {
    await mod.default.setupPlayer();
  } finally {
    throwing.remove();
    healthy.remove();
    warnings.restore();
  }

  assert.deepEqual(seen, [{ state: mod.State.Ready }]);
  assert.equal(warnings.messages.length, 1);
  assert.match(String(warnings.messages[0][0]), /playback-state listener/);
});

// ---------------------------------------------------------------------------
// loadAndPlay
// ---------------------------------------------------------------------------

test('loadAndPlay re-applies a non-default rate with pitch correction before playing', async () => {
  await mod.default.loadAndPlay('https://audio.test/john3.mp3', 1.5);

  assert.deepEqual(createCalls[0], {
    source: { uri: 'https://audio.test/john3.mp3' },
    initialStatus: {
      shouldPlay: false,
      rate: 1.5,
      shouldCorrectPitch: true,
      progressUpdateIntervalMillis: 1000,
    },
  });
  assert.deepEqual(soundInstances[0].calls, [
    { method: 'setRateAsync', args: [1.5, true] },
    { method: 'playAsync', args: [] },
  ]);
});

test('loadAndPlay skips the redundant rate call at 1x', async () => {
  await mod.default.loadAndPlay('https://audio.test/john3.mp3');

  assert.deepEqual(soundInstances[0].methods(), ['playAsync']);
});

test('loadAndPlay stamps the loaded track with the current clock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  await mod.default.loadAndPlay('https://audio.test/john3.mp3');

  assert.deepEqual(await mod.default.getActiveTrack(), {
    id: '1700000000000',
    url: 'https://audio.test/john3.mp3',
  });
});
