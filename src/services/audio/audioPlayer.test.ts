import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';

// ---------------------------------------------------------------------------
// Recording ./trackPlayer double
//
// audioPlayer's own job is callback wiring, snapshot merging and load gating,
// so the wrapper underneath is replaced by a recorder. The enums are inlined
// (mocking the module by path also intercepts this file's own import of it),
// and their values mirror trackPlayer.ts.
// ---------------------------------------------------------------------------

const Event = {
  PlaybackState: 'playback-state',
  PlaybackProgressUpdated: 'playback-progress-updated',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackPlayWhenReadyChanged: 'playback-play-when-ready-changed',
  PlaybackError: 'playback-error',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  RemoteSeek: 'remote-seek',
  RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous',
} as const;

const State = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Buffering: 'buffering',
  Loading: 'loading',
  Error: 'error',
} as const;

interface RecordedCall {
  method: string;
  args: unknown[];
}

type EventName = (typeof Event)[keyof typeof Event];
type Listener = (data: unknown) => void;

const trackPlayerCalls: RecordedCall[] = [];
const failures = new Map<string, unknown>();
const listeners = new Map<EventName, Set<Listener>>();

let progressResult = { position: 0, duration: 0, buffered: 0 };
let playbackStateResult: { state: string } = { state: State.None };

function record(method: string, args: unknown[] = []): Promise<void> {
  trackPlayerCalls.push({ method, args });
  const failure = failures.get(method);
  return failure ? Promise.reject(failure) : Promise.resolve();
}

/** Push an event the way trackPlayer would. */
function emit(event: EventName, data: unknown): void {
  for (const listener of listeners.get(event) ?? []) {
    listener(data);
  }
}

function listenerCount(event: EventName): number {
  return listeners.get(event)?.size ?? 0;
}

const trackPlayerDouble = {
  setupPlayer: () => record('setupPlayer'),
  play: () => record('play'),
  pause: () => record('pause'),
  stop: () => record('stop'),
  seekTo: (positionSeconds: number) => record('seekTo', [positionSeconds]),
  setRate: (rate: number) => record('setRate', [rate]),
  loadAndPlay: (url: string, rate: number) => record('loadAndPlay', [url, rate]),
  getProgress: async () => {
    await record('getProgress');
    return progressResult;
  },
  getPlaybackState: async () => {
    await record('getPlaybackState');
    return playbackStateResult;
  },
  addEventListener: (event: EventName, listener: Listener) => {
    trackPlayerCalls.push({ method: 'addEventListener', args: [event] });
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return {
      remove: () => {
        trackPlayerCalls.push({ method: 'removeListener', args: [event] });
        set.delete(listener);
      },
    };
  },
};

mockModule(mock, sourcePath('services/audio/trackPlayer.ts'), {
  default: trackPlayerDouble,
  Event,
  State,
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type AudioPlayerModule = typeof import('./audioPlayer');

let mod: AudioPlayerModule;

function captureErrors(): { messages: unknown[][]; restore: () => void } {
  const original = console.error;
  const messages: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    messages.push(args);
  };
  return {
    messages,
    restore: () => {
      console.error = original;
    },
  };
}

before(async () => {
  mod = await import('./audioPlayer');
});

beforeEach(async () => {
  failures.clear();
  progressResult = { position: 0, duration: 0, buffered: 0 };
  playbackStateResult = { state: State.None };
  if (mod) {
    // stop() clears the loaded flag and the merged snapshot fields.
    await mod.audioPlayer.stop();
    mod.audioPlayer.setCallbacks({});
  }
  trackPlayerCalls.length = 0;
});

// ---------------------------------------------------------------------------
// configureAudioMode
// ---------------------------------------------------------------------------

test('configureAudioMode delegates to the track-player setup', async () => {
  await mod.configureAudioMode();

  assert.deepEqual(trackPlayerCalls, [{ method: 'setupPlayer', args: [] }]);
});

test('configureAudioMode logs and swallows a setup failure so playback can still be attempted', async () => {
  failures.set('setupPlayer', new Error('audio session unavailable'));
  const errors = captureErrors();

  try {
    await assert.doesNotReject(() => mod.configureAudioMode());
  } finally {
    errors.restore();
  }

  assert.equal(errors.messages.length, 1);
  assert.equal(errors.messages[0][0], 'Error configuring audio mode:');
});

// ---------------------------------------------------------------------------
// configure / event wiring
// ---------------------------------------------------------------------------

test('configure sets up the session and subscribes to progress, state, queue-end and error events', async () => {
  await mod.audioPlayer.configure();

  assert.deepEqual(trackPlayerCalls, [
    { method: 'setupPlayer', args: [] },
    { method: 'addEventListener', args: [Event.PlaybackProgressUpdated] },
    { method: 'addEventListener', args: [Event.PlaybackState] },
    { method: 'addEventListener', args: [Event.PlaybackQueueEnded] },
    { method: 'addEventListener', args: [Event.PlaybackError] },
  ]);
});

// Depends on the preceding test having configured the singleton: `configure()`
// short-circuits on `isConfigured`, which nothing resets, so a second call can
// only be observed after a first one somewhere in this file.
test('configure is idempotent and never double-subscribes', async () => {
  await mod.audioPlayer.configure();

  assert.deepEqual(trackPlayerCalls, []);
  assert.equal(listenerCount(Event.PlaybackProgressUpdated), 1);
  assert.equal(listenerCount(Event.PlaybackState), 1);
  assert.equal(listenerCount(Event.PlaybackQueueEnded), 1);
  assert.equal(listenerCount(Event.PlaybackError), 1);
});

test('a progress event reaches onStatusUpdate as a millisecond snapshot', async () => {
  const snapshots: unknown[] = [];
  mod.audioPlayer.setCallbacks({ onStatusUpdate: (status) => snapshots.push(status) });

  emit(Event.PlaybackProgressUpdated, { position: 12.5, duration: 60, buffered: 30 });

  assert.deepEqual(snapshots, [
    {
      isLoaded: true,
      positionMillis: 12_500,
      durationMillis: 60_000,
      isPlaying: false,
      isBuffering: false,
      didJustFinish: false,
    },
  ]);
});

test('a Playing state event marks the merged snapshot as playing', async () => {
  const snapshots: Array<{ isPlaying: boolean; isBuffering: boolean }> = [];
  mod.audioPlayer.setCallbacks({
    onStatusUpdate: (status) =>
      snapshots.push({ isPlaying: status.isPlaying, isBuffering: status.isBuffering }),
  });

  emit(Event.PlaybackState, { state: State.Playing });

  assert.deepEqual(snapshots, [{ isPlaying: true, isBuffering: false }]);
});

test('Buffering and Loading states both read as buffering', async () => {
  const snapshots: Array<{ isPlaying: boolean; isBuffering: boolean }> = [];
  mod.audioPlayer.setCallbacks({
    onStatusUpdate: (status) =>
      snapshots.push({ isPlaying: status.isPlaying, isBuffering: status.isBuffering }),
  });

  emit(Event.PlaybackState, { state: State.Buffering });
  emit(Event.PlaybackState, { state: State.Loading });
  emit(Event.PlaybackState, { state: State.Paused });

  assert.deepEqual(snapshots, [
    { isPlaying: false, isBuffering: true },
    { isPlaying: false, isBuffering: true },
    { isPlaying: false, isBuffering: false },
  ]);
});

test('the merged snapshot keeps position and state from separate events', async () => {
  const snapshots: unknown[] = [];
  mod.audioPlayer.setCallbacks({ onStatusUpdate: (status) => snapshots.push(status) });

  emit(Event.PlaybackProgressUpdated, { position: 5, duration: 120, buffered: 5 });
  emit(Event.PlaybackState, { state: State.Playing });

  assert.deepEqual(snapshots[1], {
    isLoaded: true,
    positionMillis: 5_000,
    durationMillis: 120_000,
    isPlaying: true,
    isBuffering: false,
    didJustFinish: false,
  });
});

test('a queue-ended event invokes onPlaybackFinished', async () => {
  let finished = 0;
  mod.audioPlayer.setCallbacks({ onPlaybackFinished: () => (finished += 1) });

  emit(Event.PlaybackQueueEnded, {});

  assert.equal(finished, 1);
});

test('a playback error event forwards the message to onError', async () => {
  const errors: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => errors.push(message) });

  emit(Event.PlaybackError, { code: 'LOAD_ERROR', message: 'chapter unavailable' });

  assert.deepEqual(errors, ['chapter unavailable']);
});

test('events are dropped silently once the callbacks are cleared', async () => {
  mod.audioPlayer.setCallbacks({});

  assert.doesNotThrow(() => {
    emit(Event.PlaybackProgressUpdated, { position: 1, duration: 2, buffered: 1 });
    emit(Event.PlaybackQueueEnded, {});
    emit(Event.PlaybackError, { code: 'X', message: 'y' });
  });
});

test('replacing the callbacks re-targets the already-registered subscriptions', async () => {
  const first: string[] = [];
  const second: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => first.push(message) });
  mod.audioPlayer.setCallbacks({ onError: (message) => second.push(message) });

  emit(Event.PlaybackError, { code: 'PLAY_ERROR', message: 'boom' });

  assert.deepEqual(first, []);
  assert.deepEqual(second, ['boom']);
});

// ---------------------------------------------------------------------------
// loadAndPlay
// ---------------------------------------------------------------------------

test('loadAndPlay forwards the url and rate and marks the player loaded', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3', 1.5);

  assert.deepEqual(trackPlayerCalls, [
    { method: 'loadAndPlay', args: ['https://audio.test/john3.mp3', 1.5] },
  ]);
  assert.equal(mod.audioPlayer.isLoaded(), true);
});

test('loadAndPlay defaults to 1x playback', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');

  assert.deepEqual(trackPlayerCalls, [
    { method: 'loadAndPlay', args: ['https://audio.test/john3.mp3', 1] },
  ]);
});

test('loadAndPlay resets the merged snapshot to a buffering start-of-track', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/first.mp3');
  emit(Event.PlaybackProgressUpdated, { position: 30, duration: 60, buffered: 60 });
  emit(Event.PlaybackState, { state: State.Playing });

  const snapshots: unknown[] = [];
  mod.audioPlayer.setCallbacks({ onStatusUpdate: (status) => snapshots.push(status) });
  await mod.audioPlayer.loadAndPlay('https://audio.test/second.mp3');
  emit(Event.PlaybackProgressUpdated, { position: 0, duration: 0, buffered: 0 });

  assert.deepEqual(snapshots, [
    {
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
      isBuffering: true,
      didJustFinish: false,
    },
  ]);
});

test('a load that fails leaves the player unloaded so the transport stays inert', async () => {
  failures.set('loadAndPlay', new Error('chapter unavailable'));

  await assert.rejects(
    () => mod.audioPlayer.loadAndPlay('https://audio.test/missing.mp3'),
    /chapter unavailable/
  );
  trackPlayerCalls.length = 0;

  await mod.audioPlayer.play();
  await mod.audioPlayer.seekTo(1_000);

  assert.equal(mod.audioPlayer.isLoaded(), false);
  assert.deepEqual(trackPlayerCalls, []);
});

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------

test('transport controls do nothing until a track has been loaded', async () => {
  await mod.audioPlayer.play();
  await mod.audioPlayer.pause();
  await mod.audioPlayer.resume();
  await mod.audioPlayer.seekTo(5_000);
  await mod.audioPlayer.setRate(1.25);

  assert.deepEqual(trackPlayerCalls, []);
});

test('play, pause and resume delegate once a track is loaded', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  trackPlayerCalls.length = 0;

  await mod.audioPlayer.play();
  await mod.audioPlayer.pause();
  await mod.audioPlayer.resume();

  assert.deepEqual(trackPlayerCalls, [
    { method: 'play', args: [] },
    { method: 'pause', args: [] },
    { method: 'play', args: [] },
  ]);
});

test('seekTo converts the millisecond position the UI uses into seconds', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  trackPlayerCalls.length = 0;

  await mod.audioPlayer.seekTo(42_500);

  assert.deepEqual(trackPlayerCalls, [{ method: 'seekTo', args: [42.5] }]);
});

test('setRate forwards the requested playback rate', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  trackPlayerCalls.length = 0;

  await mod.audioPlayer.setRate(2);

  assert.deepEqual(trackPlayerCalls, [{ method: 'setRate', args: [2] }]);
});

test('a failed play is reported through onError instead of throwing', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  const errors: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => errors.push(message) });
  failures.set('play', new Error('audio focus lost'));

  await assert.doesNotReject(() => mod.audioPlayer.play());

  assert.deepEqual(errors, ['audio focus lost']);
});

test('a failed pause reports a default message when the rejection is not an Error', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  const errors: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => errors.push(message) });
  failures.set('pause', 'not an error');

  await assert.doesNotReject(() => mod.audioPlayer.pause());

  assert.deepEqual(errors, ['Failed to pause audio']);
});

test('a failed seek is reported through onError', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  const errors: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => errors.push(message) });
  failures.set('seekTo', 'nope');

  await assert.doesNotReject(() => mod.audioPlayer.seekTo(1_000));

  assert.deepEqual(errors, ['Failed to seek']);
});

test('a failed rate change is reported through onError', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  const errors: string[] = [];
  mod.audioPlayer.setCallbacks({ onError: (message) => errors.push(message) });
  failures.set('setRate', 'nope');

  await assert.doesNotReject(() => mod.audioPlayer.setRate(1.75));

  assert.deepEqual(errors, ['Failed to set playback rate']);
});

test('stop unloads the track and clears the loaded flag', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  trackPlayerCalls.length = 0;

  await mod.audioPlayer.stop();

  assert.deepEqual(trackPlayerCalls, [{ method: 'stop', args: [] }]);
  assert.equal(mod.audioPlayer.isLoaded(), false);
});

test('stop clears the merged snapshot so the next track starts from zero', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  emit(Event.PlaybackProgressUpdated, { position: 30, duration: 60, buffered: 60 });
  emit(Event.PlaybackState, { state: State.Playing });

  await mod.audioPlayer.stop();

  const snapshots: unknown[] = [];
  mod.audioPlayer.setCallbacks({ onStatusUpdate: (status) => snapshots.push(status) });
  emit(Event.PlaybackState, { state: State.Paused });

  assert.deepEqual(snapshots, [
    {
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
      isBuffering: false,
      didJustFinish: false,
    },
  ]);
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

test('getStatus returns null before anything is loaded', async () => {
  assert.equal(await mod.audioPlayer.getStatus(), null);
  assert.deepEqual(trackPlayerCalls, []);
});

test('getStatus merges the live progress and playback state into one snapshot', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  progressResult = { position: 33, duration: 210, buffered: 90 };
  playbackStateResult = { state: State.Playing };

  assert.deepEqual(await mod.audioPlayer.getStatus(), {
    isLoaded: true,
    positionMillis: 33_000,
    durationMillis: 210_000,
    isPlaying: true,
    isBuffering: false,
    didJustFinish: false,
  });
});

test('getStatus reports buffering while the wrapper is still loading', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  playbackStateResult = { state: State.Loading };

  const status = await mod.audioPlayer.getStatus();

  assert.equal(status?.isBuffering, true);
  assert.equal(status?.isPlaying, false);
});

test('getStatus returns null when the wrapper cannot report progress', async () => {
  await mod.audioPlayer.loadAndPlay('https://audio.test/john3.mp3');
  failures.set('getProgress', new Error('sound released'));

  assert.equal(await mod.audioPlayer.getStatus(), null);
});
