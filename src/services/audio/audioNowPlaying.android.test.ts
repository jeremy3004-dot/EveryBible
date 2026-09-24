import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';
import { ANDROID_REENABLE_GAP_MS } from './androidMediaSession';
import type { BibleNowPlayingRemoteCommand } from './audioNowPlaying';

// Android wiring of the public now-playing API: calls must reach the
// expo-media-control native module (looked up through `expo`), never the iOS
// bridge, and the bundled artwork must resolve to a uri the service can open.

type NativeCall = { method: string; args: unknown[] };

const mediaControlCalls: NativeCall[] = [];
const mediaControlListeners = new Set<(event: unknown) => void>();
const mediaControlModule = {
  enableMediaControls: async (options: unknown) => {
    mediaControlCalls.push({ method: 'enableMediaControls', args: [options] });
  },
  disableMediaControls: async () => {
    mediaControlCalls.push({ method: 'disableMediaControls', args: [] });
  },
  updateMetadata: async (metadata: unknown) => {
    mediaControlCalls.push({ method: 'updateMetadata', args: [metadata] });
  },
  updatePlaybackState: async (state: number, position?: number, rate?: number) => {
    mediaControlCalls.push({ method: 'updatePlaybackState', args: [state, position, rate] });
  },
  addListener: (eventName: string, listener: (event: unknown) => void) => {
    assert.equal(eventName, 'mediaControlEvent');
    mediaControlListeners.add(listener);
    return { remove: () => mediaControlListeners.delete(listener) };
  },
};

const requestedModules: string[] = [];
mockModule(mock, 'expo', {
  requireOptionalNativeModule: (name: string) => {
    requestedModules.push(name);
    return name === 'ExpoMediaControl' ? mediaControlModule : null;
  },
});
mockModule(mock, 'expo-constants', {
  default: { expoConfig: { android: { package: 'com.everybible.app' } } },
});

const privacyState = { mode: 'standard' as 'standard' | 'discreet' };
mockModule(mock, sourcePath('stores/privacyStore.ts'), {
  usePrivacyStore: { getState: () => privacyState },
});

mockModule(
  mock,
  fileURLToPath(new URL('../../../assets/audio/now-playing-artwork.png', import.meta.url).href),
  { default: 1 }
);

const iosCalls: string[] = [];
const rn = createReactNativeStub({
  os: 'android',
  nativeModules: {
    EveryBibleAudioNowPlayingModule: {
      syncBibleNowPlaying: () => iosCalls.push('sync'),
      clearBibleNowPlaying: () => iosCalls.push('clear'),
      addListener: () => iosCalls.push('addListener'),
      removeListeners: () => iosCalls.push('removeListeners'),
    },
  },
});
// Release builds resolve a bundled image to its drawable resource name.
(rn as Record<string, unknown>).Image = {
  resolveAssetSource: () => ({ uri: 'assets_audio_nowplayingartwork', width: 300, height: 300 }),
};
mockModule(mock, 'react-native', rn);

let mod: typeof import('./audioNowPlaying');

const localized = {
  bookName: 'Génesis',
  channelName: 'Reproduciendo ahora',
  play: 'Reproducir audio del capítulo',
  pause: 'Pausar audio del capítulo',
  previous: 'Capítulo anterior',
  next: 'Capítulo siguiente',
  skipBackward: 'Retroceder 10 segundos',
  skipForward: 'Avanzar 10 segundos',
};

const genesisOne = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  positionMs: 30_000,
  durationMs: 600_000,
  isPlaying: true,
  playbackRate: 1,
  localized,
};

before(async () => {
  // Only Date is faked: the session waits out a native teardown gap after a
  // stop, and each test starts right after the previous one stopped.
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  mod = await import('./audioNowPlaying');
});

beforeEach(async () => {
  // The session is a module singleton; end each test stopped and past the
  // re-enable gap so the next start does not wait.
  await mod.clearBibleNowPlaying();
  mock.timers.tick(ANDROID_REENABLE_GAP_MS);
  mediaControlCalls.length = 0;
  iosCalls.length = 0;
  privacyState.mode = 'standard';
});

test('syncing on Android starts the media session with localized metadata and artwork', async () => {
  await mod.syncBibleNowPlaying(genesisOne);

  assert.deepEqual(
    mediaControlCalls.map((call) => call.method),
    ['enableMediaControls', 'updateMetadata', 'updatePlaybackState']
  );
  assert.deepEqual(mediaControlCalls[1].args[0], {
    title: 'Génesis 1',
    artist: 'Berean Standard Bible',
    album: 'Every Bible',
    duration: 600,
    artwork: {
      uri: 'android.resource://com.everybible.app/drawable/assets_audio_nowplayingartwork',
    },
  });
  assert.deepEqual(mediaControlCalls[2].args, [2, 30, 1]);
  assert.ok(requestedModules.every((name) => name === 'ExpoMediaControl'));
  assert.deepEqual(iosCalls, []);
});

test('clearing on Android stops the media session and never touches the iOS bridge', async () => {
  await mod.syncBibleNowPlaying(genesisOne);
  mediaControlCalls.length = 0;

  await mod.clearBibleNowPlaying();

  assert.deepEqual(mediaControlCalls, [{ method: 'disableMediaControls', args: [] }]);
  assert.deepEqual(iosCalls, []);
});

test('an unknown book clears the Android session instead of publishing junk', async () => {
  await mod.syncBibleNowPlaying(genesisOne);
  mediaControlCalls.length = 0;

  await mod.syncBibleNowPlaying({ ...genesisOne, bookId: 'NOT-A-BOOK' });

  assert.deepEqual(mediaControlCalls, [{ method: 'disableMediaControls', args: [] }]);
});

test('discreet mode from the privacy store hides the chapter on the Android lock screen', async () => {
  privacyState.mode = 'discreet';

  await mod.syncBibleNowPlaying(genesisOne);

  assert.deepEqual(mediaControlCalls[1].args[0], {
    title: 'Reproduciendo ahora',
    artist: '',
    album: '',
    duration: 600,
  });
});

test('remote commands from the Android session reach subscribers', () => {
  const received: BibleNowPlayingRemoteCommand[] = [];
  const unsubscribe = mod.subscribeBibleNowPlayingRemoteCommands((command) =>
    received.push(command)
  );

  for (const listener of mediaControlListeners) {
    listener({ command: 'nextTrack', timestamp: 1 });
    listener({ command: 'seek', data: { position: 12 }, timestamp: 2 });
  }
  unsubscribe();

  assert.deepEqual(received, [
    { command: 'next' },
    { command: 'seek-position', positionSeconds: 12 },
  ]);
  assert.equal(mediaControlListeners.size, 0);
  assert.deepEqual(iosCalls, []);
});
