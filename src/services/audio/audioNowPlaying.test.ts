import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';
import type { BibleNowPlayingRemoteCommand } from './audioNowPlaying';

// ---------------------------------------------------------------------------
// react-native stub
//
// The bridge reads NativeModules and Platform.OS on every call, so both are
// mutated in place between tests (the module namespace holds the same object
// references the stub exposes). NativeEventEmitter is subclassed so the test
// can reach the instance the module constructs and push remote commands.
// ---------------------------------------------------------------------------

interface NativeCall {
  method: string;
  args: unknown[];
}

const nativeCalls: NativeCall[] = [];

const nativeModule = {
  syncBibleNowPlaying: (payload: unknown) => {
    nativeCalls.push({ method: 'syncBibleNowPlaying', args: [payload] });
  },
  clearBibleNowPlaying: () => {
    nativeCalls.push({ method: 'clearBibleNowPlaying', args: [] });
  },
  addListener: (eventName: string) => {
    nativeCalls.push({ method: 'addListener', args: [eventName] });
  },
  removeListeners: (count: number) => {
    nativeCalls.push({ method: 'removeListeners', args: [count] });
  },
};

const nativeModules: Record<string, unknown> = {
  EveryBibleAudioNowPlayingModule: nativeModule,
};

const rn = createReactNativeStub({ os: 'ios', nativeModules });

type StubEmitter = InstanceType<typeof rn.NativeEventEmitter>;
const emitters: StubEmitter[] = [];
const BaseEmitter = rn.NativeEventEmitter;

class RecordingNativeEventEmitter extends BaseEmitter {
  constructor(nativeModuleArgument?: unknown) {
    super(nativeModuleArgument);
    emitters.push(this);
  }
}

rn.NativeEventEmitter = RecordingNativeEventEmitter;
mockModule(mock, 'react-native', rn);

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type AudioNowPlayingModule = typeof import('./audioNowPlaying');

const EVENT_NAME = 'EveryBibleAudioNowPlayingCommand';

let mod: AudioNowPlayingModule;

const warnings: unknown[][] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args);
};

const devFlag = globalThis as { __DEV__?: boolean };

const genesisOne = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  positionMs: 30_000,
  durationMs: 600_000,
  isPlaying: true,
  playbackRate: 1,
};

before(async () => {
  mod = await import('./audioNowPlaying');
});

beforeEach(() => {
  nativeCalls.length = 0;
  emitters.length = 0;
  warnings.length = 0;
  rn.Platform.OS = 'ios';
  nativeModules.EveryBibleAudioNowPlayingModule = nativeModule;
  delete devFlag.__DEV__;
});

test.after(() => {
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Payload sync
// ---------------------------------------------------------------------------

test('syncing a chapter pushes a full lock-screen payload to the native module', async () => {
  await mod.syncBibleNowPlaying(genesisOne);

  assert.deepEqual(nativeCalls, [
    {
      method: 'syncBibleNowPlaying',
      args: [
        {
          title: 'Genesis 1',
          artist: 'Berean Standard Bible',
          albumTitle: 'Every Bible',
          elapsedSeconds: 30,
          durationSeconds: 600,
          playbackRate: 1,
          isPlaying: true,
          artworkUri: 'everybible://artwork/default',
          canSkipNext: true,
          canSkipPrevious: true,
        },
      ],
    },
  ]);
});

test('an explicit translation name wins over the bundled catalog name', async () => {
  await mod.syncBibleNowPlaying({
    ...genesisOne,
    translationId: 'unknown-runtime-id',
    translationName: 'Ahirani New Testament',
    canSkipNext: false,
    canSkipPrevious: false,
  });

  assert.deepEqual(mod.getBibleNowPlayingSnapshot(), {
    title: 'Genesis 1',
    artist: 'Ahirani New Testament',
    albumTitle: 'Every Bible',
    elapsedSeconds: 30,
    durationSeconds: 600,
    playbackRate: 1,
    isPlaying: true,
    artworkUri: 'everybible://artwork/default',
    canSkipNext: false,
    canSkipPrevious: false,
  });
});

test('the last synced payload is cached for later readers', async () => {
  await mod.syncBibleNowPlaying(genesisOne);

  assert.equal(mod.getBibleNowPlayingSnapshot()?.title, 'Genesis 1');
});

test('syncing a chapter the app does not know clears the lock screen instead of caching junk', async () => {
  await mod.syncBibleNowPlaying(genesisOne);
  nativeCalls.length = 0;

  await mod.syncBibleNowPlaying({ ...genesisOne, bookId: 'NOT-A-BOOK' });

  assert.equal(mod.getBibleNowPlayingSnapshot(), null);
  assert.deepEqual(nativeCalls, [{ method: 'clearBibleNowPlaying', args: [] }]);
});

test('clearing drops the cached payload and the native lock-screen entry', async () => {
  await mod.syncBibleNowPlaying(genesisOne);
  nativeCalls.length = 0;

  await mod.clearBibleNowPlaying();

  assert.equal(mod.getBibleNowPlayingSnapshot(), null);
  assert.deepEqual(nativeCalls, [{ method: 'clearBibleNowPlaying', args: [] }]);
});

// ---------------------------------------------------------------------------
// Remote commands
// ---------------------------------------------------------------------------

test('every supported remote command reaches the listener', async () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  for (const command of [
    'play',
    'pause',
    'stop',
    'next',
    'previous',
    'seek-forward',
    'seek-backward',
    'seek-position',
  ]) {
    emitters[0].emit(EVENT_NAME, { command });
  }
  unsubscribe();

  assert.deepEqual(
    received.map((entry) => entry.command),
    ['play', 'pause', 'stop', 'next', 'previous', 'seek-forward', 'seek-backward', 'seek-position']
  );
});

test('a seek command carries its position through to the listener', async () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  emitters[0].emit(EVENT_NAME, { command: 'seek-position', positionSeconds: 84.5 });
  unsubscribe();

  assert.deepEqual(received, [{ command: 'seek-position', positionSeconds: 84.5 }]);
});

test('a non-numeric seek position is dropped rather than forwarded', async () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  emitters[0].emit(EVENT_NAME, { command: 'seek-position', positionSeconds: '84.5' });
  unsubscribe();

  assert.deepEqual(received, [{ command: 'seek-position', positionSeconds: undefined }]);
});

test('an unrecognised command name is ignored', async () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  emitters[0].emit(EVENT_NAME, { command: 'eject' });
  emitters[0].emit(EVENT_NAME, {});
  emitters[0].emit(EVENT_NAME, { command: 42 });
  unsubscribe();

  assert.deepEqual(received, []);
});

test('unsubscribing removes the native listener', async () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  unsubscribe();
  emitters[0].emit(EVENT_NAME, { command: 'play' });

  assert.equal(emitters[0].listenerCount(EVENT_NAME), 0);
  assert.deepEqual(received, []);
});

// ---------------------------------------------------------------------------
// Platforms without the native module
// ---------------------------------------------------------------------------

test('a production build with no native module stays silent and does not throw', async () => {
  delete nativeModules.EveryBibleAudioNowPlayingModule;

  await assert.doesNotReject(() => mod.syncBibleNowPlaying(genesisOne));
  await assert.doesNotReject(() => mod.clearBibleNowPlaying());

  assert.deepEqual(warnings, []);
  assert.deepEqual(nativeCalls, []);
});

test('a dev build warns exactly once about the missing native module', async () => {
  devFlag.__DEV__ = true;
  delete nativeModules.EveryBibleAudioNowPlayingModule;

  await mod.syncBibleNowPlaying(genesisOne);
  await mod.syncBibleNowPlaying(genesisOne);
  await mod.clearBibleNowPlaying();

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /EveryBibleAudioNowPlayingModule is missing/);
});

test('the payload is still cached on a platform with no lock-screen bridge', async () => {
  rn.Platform.OS = 'android';

  await mod.syncBibleNowPlaying(genesisOne);

  assert.equal(mod.getBibleNowPlayingSnapshot()?.title, 'Genesis 1');
  assert.deepEqual(nativeCalls, []);
});

test('subscribing off iOS returns a no-op unsubscribe and constructs no emitter', async () => {
  rn.Platform.OS = 'android';

  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands(() => {
    throw new Error('remote commands must not fire without the native bridge');
  });

  assert.equal(emitters.length, 0);
  assert.doesNotThrow(() => unsubscribe());
});

test('subscribing without the native module returns a no-op unsubscribe', async () => {
  delete nativeModules.EveryBibleAudioNowPlayingModule;

  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands(() => {
    throw new Error('remote commands must not fire without the native bridge');
  });

  assert.equal(emitters.length, 0);
  assert.doesNotThrow(() => unsubscribe());
});

test('a native module without the sync bridge falls back to the missing-module path', async () => {
  nativeModules.EveryBibleAudioNowPlayingModule = {
    addListener: () => {},
    removeListeners: () => {},
  };

  await assert.doesNotReject(() => mod.syncBibleNowPlaying(genesisOne));
  await assert.doesNotReject(() => mod.clearBibleNowPlaying());

  assert.deepEqual(nativeCalls, []);
});
