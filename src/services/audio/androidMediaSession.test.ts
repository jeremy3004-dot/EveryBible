import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANDROID_MEDIA_CONTROL_EVENT,
  ANDROID_REENABLE_GAP_MS,
  createAndroidMediaSession,
  type AndroidMediaControlNativeModule,
  type AndroidMediaSessionEnvironment,
} from './androidMediaSession';
import type { BibleNowPlayingRemoteCommand } from './audioNowPlaying';
import {
  buildBibleNowPlayingPayload,
  type BibleNowPlayingInput,
  type BibleNowPlayingLocalizedStrings,
} from './audioNowPlayingModel';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type NativeCall = { method: string; args: unknown[] };

function createFakeNativeModule() {
  const calls: NativeCall[] = [];
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const failures = new Set<string>();
  const gates = new Map<string, Promise<void>>();

  const record = async (method: string, args: unknown[]) => {
    calls.push({ method, args });
    const gate = gates.get(method);
    if (gate) await gate;
    if (failures.has(method)) throw new Error(`${method} failed`);
  };

  const module: AndroidMediaControlNativeModule = {
    enableMediaControls: (options) => record('enableMediaControls', [options]),
    disableMediaControls: () => record('disableMediaControls', []),
    updateMetadata: (metadata) => record('updateMetadata', [metadata]),
    updatePlaybackState: (state, position, rate) =>
      record('updatePlaybackState', [state, position, rate]),
    addListener: (eventName, listener) => {
      const set = listeners.get(eventName) ?? new Set();
      set.add(listener);
      listeners.set(eventName, set);
      return { remove: () => set.delete(listener) };
    },
  };

  return {
    module,
    calls,
    failures,
    gates,
    emit(event: unknown) {
      for (const listener of listeners.get(ANDROID_MEDIA_CONTROL_EVENT) ?? []) listener(event);
    },
    listenerCount: () => listeners.get(ANDROID_MEDIA_CONTROL_EVENT)?.size ?? 0,
    methods: () => calls.map((call) => call.method),
  };
}

function createHarness(options: { module?: boolean } = {}) {
  const native = createFakeNativeModule();
  const clock = { now: 1_000_000 };
  const sleeps: number[] = [];
  const errors: string[] = [];
  const privacy = { discreet: false as boolean | 'throw' };
  const artwork = { uri: 'android.resource://com.everybible.app/drawable/art', resolved: 0 };

  const env: AndroidMediaSessionEnvironment = {
    resolveNativeModule: () => (options.module === false ? null : native.module),
    resolveArtworkUri: () => {
      artwork.resolved += 1;
      return artwork.uri;
    },
    isDiscreetMode: () => {
      if (privacy.discreet === 'throw') throw new Error('privacy store unavailable');
      return privacy.discreet;
    },
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
    reportError: (operation) => {
      errors.push(operation);
    },
  };

  const session = createAndroidMediaSession(env);
  return { session, native, clock, sleeps, errors, privacy, artwork };
}

const english: BibleNowPlayingLocalizedStrings = {
  bookName: 'Genesis',
  channelName: 'Now playing',
  play: 'Play chapter audio',
  pause: 'Pause chapter audio',
  previous: 'Previous chapter',
  next: 'Next chapter',
  skipBackward: 'Skip back 10 seconds',
  skipForward: 'Skip forward 10 seconds',
};

const genesisOne: BibleNowPlayingInput = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  positionMs: 0,
  durationMs: 600_000,
  isPlaying: true,
  playbackRate: 1,
  localized: english,
};

function sync(harness: ReturnType<typeof createHarness>, input: BibleNowPlayingInput) {
  const payload = buildBibleNowPlayingPayload(input);
  assert.ok(payload);
  return harness.session.sync(input, payload);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('the first sync starts the session, then publishes metadata and the playing state', async () => {
  const h = createHarness();

  await sync(h, genesisOne);

  assert.deepEqual(h.native.calls, [
    {
      method: 'enableMediaControls',
      args: [
        {
          capabilities: [
            'previousTrack',
            'play',
            'pause',
            'nextTrack',
            'seek',
            'skipBackward',
            'skipForward',
          ],
          compactCapabilities: ['previousTrack', 'play', 'nextTrack'],
          android: {
            skipInterval: 10,
            channelName: 'Now playing',
            actionLabels: {
              play: 'Play chapter audio',
              pause: 'Pause chapter audio',
              previousTrack: 'Previous chapter',
              nextTrack: 'Next chapter',
              skipBackward: 'Skip back 10 seconds',
              skipForward: 'Skip forward 10 seconds',
            },
          },
        },
      ],
    },
    {
      method: 'updateMetadata',
      args: [
        {
          title: 'Genesis 1',
          artist: 'Berean Standard Bible',
          album: 'Every Bible',
          duration: 600,
          artwork: { uri: 'android.resource://com.everybible.app/drawable/art' },
        },
      ],
    },
    { method: 'updatePlaybackState', args: [2, 0, 1] },
  ]);
});

test('second-by-second progress while playing does not touch the notification', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  for (let second = 1; second <= 30; second += 1) {
    h.clock.now += 1000;
    await sync(h, { ...genesisOne, positionMs: second * 1000 });
  }

  assert.deepEqual(h.native.calls, []);
});

test('pause, resume and a seek each publish a new playback state', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  h.clock.now += 5_000;
  await sync(h, { ...genesisOne, positionMs: 5_000, isPlaying: false });
  h.clock.now += 60_000;
  await sync(h, { ...genesisOne, positionMs: 5_000, isPlaying: true });
  h.clock.now += 1_000;
  await sync(h, { ...genesisOne, positionMs: 120_000, isPlaying: true });

  assert.deepEqual(h.native.calls, [
    { method: 'updatePlaybackState', args: [3, 5, 1] },
    { method: 'updatePlaybackState', args: [2, 5, 1] },
    { method: 'updatePlaybackState', args: [2, 120, 1] },
  ]);
});

test('advancing to the next chapter updates metadata on the running session without restarting it', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  // The hook reports the new chapter as loading (not playing), then playing.
  h.clock.now += 1_000;
  await sync(h, { ...genesisOne, chapter: 2, isPlaying: false, durationMs: 0 });
  h.clock.now += 1_000;
  await sync(h, { ...genesisOne, chapter: 2, durationMs: 540_000 });

  assert.deepEqual(h.native.methods(), [
    'updateMetadata',
    'updatePlaybackState',
    'updateMetadata',
    'updatePlaybackState',
  ]);
  assert.equal(h.native.methods().filter((method) => method === 'enableMediaControls').length, 0);
  assert.deepEqual(h.native.calls[2].args[0], {
    title: 'Genesis 2',
    artist: 'Berean Standard Bible',
    album: 'Every Bible',
    duration: 540,
    artwork: { uri: 'android.resource://com.everybible.app/drawable/art' },
  });
});

test('clearing stops the session once, and a repeated clear is a no-op', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  await h.session.clear();
  await h.session.clear();

  assert.deepEqual(h.native.methods(), ['disableMediaControls']);
});

test('clearing before anything played does not start or stop the native service', async () => {
  const h = createHarness();

  await h.session.clear();

  assert.deepEqual(h.native.calls, []);
});

test('playing again right after a stop waits for the native teardown, then re-publishes everything', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  await h.session.clear();
  h.native.calls.length = 0;

  h.clock.now += 100;
  await sync(h, genesisOne);

  assert.deepEqual(h.sleeps, [ANDROID_REENABLE_GAP_MS - 100]);
  assert.deepEqual(h.native.methods(), [
    'enableMediaControls',
    'updateMetadata',
    'updatePlaybackState',
  ]);
});

test('playing again long after a stop does not wait', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  await h.session.clear();

  h.clock.now += ANDROID_REENABLE_GAP_MS * 10;
  await sync(h, genesisOne);

  assert.deepEqual(h.sleeps, []);
});

test('native calls keep the order the hook issued them: sync, clear, sync', async () => {
  const h = createHarness();
  let releaseEnable!: () => void;
  h.native.gates.set(
    'enableMediaControls',
    new Promise<void>((resolve) => {
      releaseEnable = resolve;
    })
  );

  const first = sync(h, genesisOne);
  const cleared = h.session.clear();
  const second = sync(h, { ...genesisOne, chapter: 3 });
  h.native.gates.delete('enableMediaControls');
  releaseEnable();
  await Promise.all([first, cleared, second]);

  assert.deepEqual(h.native.methods(), [
    'enableMediaControls',
    'updateMetadata',
    'updatePlaybackState',
    'disableMediaControls',
    'enableMediaControls',
    'updateMetadata',
    'updatePlaybackState',
  ]);
  assert.equal((h.native.calls[5].args[0] as { title: string }).title, 'Genesis 3');
});

test('syncs that queue up behind a slow native call collapse into the latest one', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  let releaseMetadata!: () => void;
  h.native.gates.set(
    'updateMetadata',
    new Promise<void>((resolve) => {
      releaseMetadata = resolve;
    })
  );
  const running = sync(h, { ...genesisOne, chapter: 2 });
  // Let the queued job start and block inside updateMetadata.
  await new Promise((resolve) => setImmediate(resolve));
  const queued = [3, 4, 5].map((chapter) => sync(h, { ...genesisOne, chapter }));
  h.native.gates.delete('updateMetadata');
  releaseMetadata();
  await Promise.all([running, ...queued]);

  assert.deepEqual(
    h.native.calls
      .filter((call) => call.method === 'updateMetadata')
      .map((call) => (call.args[0] as { title: string }).title),
    ['Genesis 2', 'Genesis 5']
  );
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

test('a failed enable is reported and retried on the next sync instead of publishing into nothing', async () => {
  const h = createHarness();
  h.native.failures.add('enableMediaControls');

  await sync(h, genesisOne);
  assert.deepEqual(h.native.methods(), ['enableMediaControls']);
  assert.deepEqual(h.errors, ['enableMediaControls']);

  h.native.failures.delete('enableMediaControls');
  h.native.calls.length = 0;
  await sync(h, genesisOne);

  assert.deepEqual(h.native.methods(), [
    'enableMediaControls',
    'updateMetadata',
    'updatePlaybackState',
  ]);
});

test('a failed metadata update is retried on the next sync', async () => {
  const h = createHarness();
  h.native.failures.add('updateMetadata');
  await sync(h, genesisOne);

  h.native.failures.delete('updateMetadata');
  h.native.calls.length = 0;
  h.clock.now += 1_000;
  await sync(h, { ...genesisOne, positionMs: 1_000 });

  assert.deepEqual(h.native.methods(), ['updateMetadata']);
  assert.deepEqual(h.errors, ['updateMetadata']);
});

test('without the native module (not linked) every call is a silent no-op', async () => {
  const h = createHarness({ module: false });

  await sync(h, genesisOne);
  await h.session.clear();
  const unsubscribe = h.session.subscribe(() => {
    throw new Error('no commands without a native module');
  });
  unsubscribe();

  assert.deepEqual(h.native.calls, []);
  assert.deepEqual(h.errors, []);
});

test('artwork is resolved once per session object', async () => {
  const h = createHarness();

  await sync(h, genesisOne);
  await sync(h, { ...genesisOne, chapter: 2 });
  await sync(h, { ...genesisOne, chapter: 3 });

  assert.equal(h.artwork.resolved, 1);
});

// ---------------------------------------------------------------------------
// Discreet mode
// ---------------------------------------------------------------------------

test('discreet mode keeps the chapter, translation and artwork off the lock screen', async () => {
  const h = createHarness();
  h.privacy.discreet = true;

  await sync(h, genesisOne);

  assert.deepEqual(h.native.calls[1], {
    method: 'updateMetadata',
    args: [{ title: 'Now playing', artist: '', album: '', duration: 600 }],
  });
  assert.equal(h.artwork.resolved, 0);
});

test('switching discreet mode on mid-playback replaces the visible metadata', async () => {
  const h = createHarness();
  await sync(h, genesisOne);
  h.native.calls.length = 0;

  h.privacy.discreet = true;
  h.clock.now += 1_000;
  await sync(h, { ...genesisOne, positionMs: 1_000 });

  assert.deepEqual(h.native.calls, [
    {
      method: 'updateMetadata',
      args: [{ title: 'Now playing', artist: '', album: '', duration: 600 }],
    },
  ]);
});

test('an unreadable privacy setting fails closed to the neutral entry', async () => {
  const h = createHarness();
  h.privacy.discreet = 'throw';

  await sync(h, genesisOne);

  assert.equal((h.native.calls[1].args[0] as { title: string }).title, 'Now playing');
  assert.deepEqual(h.errors, ['isDiscreetMode']);
});

// ---------------------------------------------------------------------------
// Remote commands
// ---------------------------------------------------------------------------

test('notification and headset commands reach the listener in the shared vocabulary', () => {
  const h = createHarness();
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = h.session.subscribe((command) => received.push(command));

  h.native.emit({ command: 'pause', timestamp: 1 });
  h.native.emit({ command: 'play', timestamp: 2 });
  h.native.emit({ command: 'nextTrack', timestamp: 3 });
  h.native.emit({ command: 'previousTrack', timestamp: 4 });
  h.native.emit({ command: 'seek', data: { position: 42 }, timestamp: 5 });
  h.native.emit({ command: 'setRating', data: { rating: 1 }, timestamp: 6 });
  unsubscribe();

  assert.deepEqual(received, [
    { command: 'pause' },
    { command: 'play' },
    { command: 'next' },
    { command: 'previous' },
    { command: 'seek-position', positionSeconds: 42 },
  ]);
});

test('unsubscribing removes the native listener', () => {
  const h = createHarness();
  const received: BibleNowPlayingRemoteCommand[] = [];

  const unsubscribe = h.session.subscribe((command) => received.push(command));
  assert.equal(h.native.listenerCount(), 1);
  unsubscribe();
  h.native.emit({ command: 'play' });

  assert.equal(h.native.listenerCount(), 0);
  assert.deepEqual(received, []);
});
