import assert from 'node:assert/strict';
import test, { after, before, beforeEach, mock } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Audio } from 'expo-av';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';

// Exercise the installed SDK class; only its native boundary is fake.
const sdkRoot = dirname(createRequire(import.meta.url).resolve('expo-av/package.json'));
interface NativeSubscription {
  event: string;
  listener: (payload: unknown) => void;
}
const subscriptions = new Set<NativeSubscription>();
class NativeEmitter {
  addListener(event: string, listener: (payload: unknown) => void) {
    const subscription = { event, listener };
    subscriptions.add(subscription);
    return { remove: () => subscriptions.delete(subscription) };
  }
}
let nextKey = 0;
const players = new Map<number, Record<string, unknown>>();
const calls: string[] = [];
const unloadGates = new Map<number, Promise<void>>();
const loadFailures: Error[] = [];
const setFailures = new Set<number>();
let nextLoadGate: Promise<void> | null = null;
let nextNativeReadyGate: Promise<void> | null = null;
const nativeError = () =>
  Object.assign(new Error('Player does not exist.'), { code: 'E_AUDIO_NOPLAYER' });
const native = {
  Qualities: { Low: 0, Medium: 1, High: 2 },
  loadForSound: async (_source: unknown, status: Record<string, unknown>) => {
    const failure = loadFailures.shift();
    if (failure) {
      calls.push('load:failed');
      throw failure;
    }
    const key = ++nextKey;
    const full = {
      ...status,
      isLoaded: true,
      isPlaying: Boolean(status.shouldPlay),
      isBuffering: false,
      didJustFinish: false,
      durationMillis: 100_000,
    };
    const gate = nextLoadGate;
    nextLoadGate = null;
    const ready = nextNativeReadyGate;
    nextNativeReadyGate = null;
    // Android applies shouldPlay while preparing; the SDK does not receive its
    // Sound key until native STATE_READY resolves the load operation.
    players.set(key, ready ? { ...full, isPlaying: false, isBuffering: true } : full);
    calls.push(`load:${key}`);
    await ready;
    players.set(key, full);
    await gate;
    return [key, full];
  },
  getStatusForSound: async (key: number) => {
    calls.push(`get:${key}`);
    if (!players.has(key)) throw nativeError();
    return players.get(key);
  },
  setStatusForSound: async (key: number, update: Record<string, unknown>) => {
    calls.push(`set:${key}`);
    if (!players.has(key) || setFailures.has(key)) throw nativeError();
    const full = {
      ...players.get(key),
      ...update,
      isPlaying: update.shouldPlay ?? players.get(key)?.isPlaying,
    };
    players.set(key, full);
    return full;
  },
  unloadForSound: async (key: number) => {
    calls.push(`unload:${key}`);
    await unloadGates.get(key);
    if (!players.has(key)) throw nativeError();
    players.delete(key);
    return { isLoaded: false };
  },
};
mockPackage(mock, 'expo-modules-core', {
  LegacyEventEmitter: NativeEmitter,
  Platform: { OS: 'android' },
  UnavailabilityError: class extends Error {},
});
mockPackage(mock, 'expo-asset', { Asset: class {} });
mockModule(mock, join(sdkRoot, 'src/ExponentAV.ts'), { default: native });
mockModule(mock, join(sdkRoot, 'build/ExponentAV.js'), { default: native });
// Sound's enum import should not load the unrelated recording subsystem.
mockModule(mock, join(sdkRoot, 'src/Audio.ts'), {
  PitchCorrectionQuality: { Low: 0, Medium: 1, High: 2 },
});

let Sound: typeof Audio.Sound;
let mod: typeof import('./backgroundMusicPlayer');
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
function emitNearEnd(key: number, positionMillis = 99_000) {
  for (const subscription of [...subscriptions]) {
    if (subscription.event === 'didUpdatePlaybackStatus') {
      subscription.listener({
        key,
        status: {
          isLoaded: true,
          isPlaying: true,
          positionMillis,
          durationMillis: 100_000,
        },
      });
    }
  }
}
const cachedOption = {
  id: 'rain',
  defaultVolume: 0.2,
  source: { kind: 'remote', path: 'background-sounds/v1/rain.m4a' },
};
const hymnOption = {
  id: 'hymns',
  defaultVolume: 0.24,
  source: { kind: 'remote', path: 'background-sounds/v1/hymns.m4a' },
};
mockModule(mock, sourcePath('services/audio/audioPlayer.ts'), {
  configureAudioMode: async () => {},
});
mockModule(mock, sourcePath('services/audio/backgroundMusicCatalog.ts'), {
  BACKGROUND_MUSIC_OPTIONS: [cachedOption, hymnOption],
  getBackgroundMusicOption: (choice: string) => (choice === 'hymns' ? hymnOption : cachedOption),
  getBackgroundMusicSource: () => null,
  getBackgroundMusicVolume: (base: number, level: number) => base * level * 2,
});
mockModule(mock, sourcePath('services/audio/backgroundSoundCache.ts'), {
  backgroundSoundCache: {
    refresh: async () => {},
    getCachedUri: async (option: typeof cachedOption) => `file:///docs/${option.source.path}`,
    getAvailability: () => 'cached',
    ensureCached: async () => null,
    discard: async () => {},
  },
});
before(async () => {
  Sound = (await import(pathToFileURL(join(sdkRoot, 'src/Audio/Sound.ts')).href)).Sound;
  mockModule(mock, 'expo-av', {
    Audio: {
      Sound: {
        createAsync: async (...args: Parameters<typeof Sound.createAsync>) => {
          const result = await Sound.createAsync(...args);
          // Node/tsx materializes SDK declaration-only playback fields as undefined.
          // Restore the actual installed public mixin implementations for this harness.
          for (const method of [
            'playAsync',
            'pauseAsync',
            'stopAsync',
            'setVolumeAsync',
            'setPositionAsync',
          ] as const) {
            Object.defineProperty(result.sound, method, { value: Sound.prototype[method] });
          }
          return result;
        },
      },
    },
  });
  mod = await import('./backgroundMusicPlayer');
});
beforeEach(async () => {
  await mod.backgroundMusicPlayer.stop();
  subscriptions.clear();
  players.clear();
  calls.length = 0;
  unloadGates.clear();
  loadFailures.length = 0;
  setFailures.clear();
  nextLoadGate = null;
  nextNativeReadyGate = null;
});
after(async () => {
  await mod.backgroundMusicPlayer.stop();
  mock.reset();
});
test('ordinary cached ambient stop drains all installed SDK listeners', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  assert.equal(subscriptions.size, 3);
  await mod.backgroundMusicPlayer.stop();
  await flush();
  assert.equal(subscriptions.size, 0);
  assert.equal(players.size, 0);
});
test('cached ambient stop after Android fatal local playback error has no hidden SDK rejection', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  assert.equal(subscriptions.size, 3);
  // Actual AVManager ErrorListener removes the key; SimpleExoPlayerData onFatalError
  // takes this path after load, including cached file:// media. No JS onError event.
  players.delete(nextKey);
  const errors: unknown[] = [];
  const capture = (error: unknown) => errors.push(error);
  process.on('unhandledRejection', capture);
  try {
    await mod.backgroundMusicPlayer.stop();
    await flush();
    assert.equal(subscriptions.size, 0, 'the existing 90 SDK patch cleans failed unload listeners');
    assert.deepEqual(errors, [], 'stop must not detach a still-JS-loaded dead native Sound');
  } finally {
    process.off('unhandledRejection', capture);
  }
});

test('preset retirement after fatal local playback does not detach a dead native Sound', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  players.delete(nextKey);
  const errors: unknown[] = [];
  const capture = (error: unknown) => errors.push(error);
  process.on('unhandledRejection', capture);
  try {
    await mod.backgroundMusicPlayer.sync('hymns', true);
    await flush();
    assert.ok(calls.filter((call) => call.startsWith('load:')).length >= 2);
    assert.deepEqual(errors, []);
  } finally {
    await mod.backgroundMusicPlayer.stop();
    await flush();
    process.off('unhandledRejection', capture);
  }
});
test('queued end-of-loop event after fatal local playback cannot create a hidden status rejection', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  const key = nextKey;
  players.delete(key);
  const errors: unknown[] = [];
  const capture = (error: unknown) => errors.push(error);
  process.on('unhandledRejection', capture);
  try {
    // A native status posted just before the fatal error may reach JS afterward.
    emitNearEnd(key);
    await flush();
    assert.ok(calls.filter((call) => call.startsWith('load:')).length >= 2);
    assert.deepEqual(errors, []);
  } finally {
    await mod.backgroundMusicPlayer.stop();
    await flush();
    process.off('unhandledRejection', capture);
  }
});

test('failed installed SDK replacement and rewind do not query status or spin replacements', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  const key = nextKey;
  loadFailures.push(new Error('replacement decode failed'));
  setFailures.add(key);
  emitNearEnd(key);
  await flush();
  assert.equal(calls.filter((call) => call === 'load:failed').length, 1);
  assert.equal(calls.filter((call) => call === `get:${key}`).length, 0);
  assert.equal(subscriptions.size, 3, 'the current callback remains installed without reattaching');
  await flush();
  assert.equal(calls.filter((call) => call.startsWith('load:')).length, 2);
  setFailures.clear();
  emitNearEnd(key, 99_250);
  await flush();
  assert.equal(calls.filter((call) => call.startsWith('load:')).length, 3);
  emitNearEnd(key);
  await flush();
  assert.equal(
    calls.filter((call) => call.startsWith('load:')).length,
    3,
    'retired events lose authority'
  );
  await mod.backgroundMusicPlayer.stop();
  assert.equal(subscriptions.size, 0);
});

test('stale installed SDK crossfade candidate cleanup drains before a newer preset loads', async () => {
  await mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  const oldKey = nextKey;
  const loaded = deferred();
  nextLoadGate = loaded.promise;
  emitNearEnd(oldKey);
  await flush();
  const candidateKey = nextKey;
  assert.notEqual(candidateKey, oldKey);
  const stopping = mod.backgroundMusicPlayer.stop();
  const released = deferred();
  unloadGates.set(candidateKey, released.promise);
  loaded.resolve();
  await flush();
  let switched = false;
  const switching = mod.backgroundMusicPlayer.sync('hymns', true).then(() => {
    switched = true;
  });
  await flush();
  assert.equal(switched, false);
  assert.equal(calls.filter((call) => call.startsWith('load:')).length, 2);
  released.resolve();
  await switching;
  await stopping;
  assert.equal(calls.filter((call) => call.startsWith('load:')).length, 3);
  assert.equal(players.size, 1);
  assert.equal(subscriptions.size, 3);
  await mod.backgroundMusicPlayer.stop();
  assert.equal(players.size, 0);
  assert.equal(subscriptions.size, 0);
});

test('recording handoff awaits a preparing installed SDK crossfade and its native unload', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const ownership = await import('./narrationOwnership');
  ownership.resetNarrationOwnership();
  ownership.claimNarration('bible', ownership.bibleNarrationOwner, () =>
    mod.backgroundMusicPlayer.stop()
  );
  await mod.backgroundMusicPlayer.sync('rain', true);
  const ready = deferred();
  const response = deferred();
  const released = deferred();
  nextNativeReadyGate = ready.promise;
  nextLoadGate = response.promise;
  emitNearEnd(nextKey);
  await flush();
  const candidate = nextKey;
  unloadGates.set(candidate, released.promise);
  let recordingReady = false;
  const feedback = ownership.claimNarration('feedback', {}, async () => {});
  const handoff = feedback.ready.then(() => {
    recordingReady = true;
  });
  try {
    await flush();
    assert.equal(recordingReady, false, 'the native candidate still has armed playback intent');
    ready.resolve();
    await flush();
    assert.equal(players.get(candidate)?.isPlaying, true);
    assert.equal(players.get(candidate)?.volume, 0, 'no audible overlap is implied');
    assert.equal(recordingReady, false, 'the SDK has not returned the native Sound yet');
    response.resolve();
    await flush();
    assert.equal(players.get(candidate)?.isPlaying, false, 'stale cleanup stops the candidate');
    assert.equal(recordingReady, false, 'native unload is still pending');
    released.resolve();
    await handoff;
    assert.equal(players.size, 0);
    assert.equal(subscriptions.size, 0);
  } finally {
    ready.resolve();
    response.resolve();
    released.resolve();
    await handoff;
    await flush();
    await mod.backgroundMusicPlayer.stop();
    ownership.resetNarrationOwnership();
  }
});

test('recording handoff can finish before a preparing first preset because it loads paused', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const ownership = await import('./narrationOwnership');
  ownership.resetNarrationOwnership();
  ownership.claimNarration('bible', ownership.bibleNarrationOwner, () =>
    mod.backgroundMusicPlayer.stop()
  );
  const ready = deferred();
  const response = deferred();
  nextNativeReadyGate = ready.promise;
  nextLoadGate = response.promise;
  const loading = mod.backgroundMusicPlayer.sync('rain', true);
  await flush();
  const candidate = nextKey;
  try {
    const feedback = ownership.claimNarration('feedback', {}, async () => {});
    await feedback.ready;
    ready.resolve();
    await flush();
    assert.equal(players.get(candidate)?.isPlaying, false);
    response.resolve();
    await loading;
    assert.equal(players.size, 0);
  } finally {
    ready.resolve();
    response.resolve();
    await loading;
    await mod.backgroundMusicPlayer.stop();
    ownership.resetNarrationOwnership();
  }
});

test('recording handoff drains all overlapping installed SDK crossfade creations', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const ownership = await import('./narrationOwnership');
  ownership.resetNarrationOwnership();
  ownership.claimNarration('bible', ownership.bibleNarrationOwner, () =>
    mod.backgroundMusicPlayer.stop()
  );
  await mod.backgroundMusicPlayer.sync('rain', true);
  const first = deferred();
  nextLoadGate = first.promise;
  emitNearEnd(nextKey);
  await flush();
  const firstCandidate = nextKey;
  await mod.backgroundMusicPlayer.sync('hymns', true);
  const second = deferred();
  nextLoadGate = second.promise;
  emitNearEnd(nextKey);
  await flush();
  const secondCandidate = nextKey;
  let recordingReady = false;
  const feedback = ownership.claimNarration('feedback', {}, async () => {});
  const handoff = feedback.ready.then(() => {
    recordingReady = true;
  });
  try {
    await flush();
    assert.equal(recordingReady, false);
    second.resolve();
    await flush();
    assert.equal(players.has(secondCandidate), false);
    assert.equal(players.has(firstCandidate), true);
    assert.equal(recordingReady, false, 'an earlier crossfade still owns a native candidate');
    first.resolve();
    await handoff;
    assert.equal(players.size, 0);
    assert.equal(subscriptions.size, 0);
  } finally {
    first.resolve();
    second.resolve();
    await handoff;
    await flush();
    await mod.backgroundMusicPlayer.stop();
    ownership.resetNarrationOwnership();
  }
});

test('an ordinary installed SDK crossfade keeps its initial Play and accepted fade-in', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  await mod.backgroundMusicPlayer.sync('rain', true);
  const ready = deferred();
  const response = deferred();
  nextNativeReadyGate = ready.promise;
  nextLoadGate = response.promise;
  emitNearEnd(nextKey);
  await flush();
  const candidate = nextKey;
  try {
    ready.resolve();
    await flush();
    assert.equal(players.get(candidate)?.isPlaying, true);
    assert.equal(players.get(candidate)?.volume, 0);
    response.resolve();
    await flush();
    t.mock.timers.tick(5_000);
    await flush();
    assert.ok(Number(players.get(candidate)?.volume) > 0);
    assert.equal(players.size, 1);
  } finally {
    ready.resolve();
    response.resolve();
    await flush();
    await mod.backgroundMusicPlayer.stop();
  }
});
