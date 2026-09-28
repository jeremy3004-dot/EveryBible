import assert from 'node:assert/strict';
import test, { after, before, beforeEach, mock } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Audio } from 'expo-av';
import { mockModule, mockPackage } from '../../testing/mockModules';

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
const nativeError = () =>
  Object.assign(new Error('Player does not exist.'), { code: 'E_AUDIO_NOPLAYER' });
const native = {
  Qualities: { Low: 0, Medium: 1, High: 2 },
  loadForSound: async (_source: unknown, status: Record<string, unknown>) => {
    const key = ++nextKey;
    const full = {
      ...status,
      isLoaded: true,
      isPlaying: false,
      isBuffering: false,
      didJustFinish: false,
      durationMillis: 100_000,
    };
    players.set(key, full);
    calls.push(`load:${key}`);
    return [key, full];
  },
  getStatusForSound: async (key: number) => {
    calls.push(`get:${key}`);
    if (!players.has(key)) throw nativeError();
    return players.get(key);
  },
  setStatusForSound: async (key: number, update: Record<string, unknown>) => {
    calls.push(`set:${key}`);
    if (!players.has(key)) throw nativeError();
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
let RuntimeSound: typeof Audio.Sound;
let mod: typeof import('./trackPlayer');
const track = (id: string) => ({ id, url: `https://audio.test/${id}.mp3` });
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
function emitNativeStatus(key: number, status: Record<string, unknown>) {
  for (const subscription of subscriptions) {
    if (subscription.event === 'didUpdatePlaybackStatus') {
      subscription.listener({ key, status });
    }
  }
}

before(async () => {
  Sound = (await import(pathToFileURL(join(sdkRoot, 'src/Audio/Sound.ts')).href)).Sound;
  RuntimeSound = (await import(pathToFileURL(join(sdkRoot, 'build/Audio/Sound.js')).href)).Sound;
  mockModule(mock, 'expo-av', {
    Audio: { Sound, setAudioModeAsync: async () => {} },
    InterruptionModeAndroid: { DoNotMix: 1 },
    InterruptionModeIOS: { DoNotMix: 1 },
  });
  mod = await import('./trackPlayer');
});
beforeEach(async () => {
  await mod.default.destroy();
  // Isolate native fixtures even when an unpatched SDK failed the prior regression.
  subscriptions.clear();
  players.clear();
  calls.length = 0;
  unloadGates.clear();
});
after(async () => {
  await mod.default.destroy();
  mock.reset();
});

for (const implementation of ['source', 'runtime'] as const) {
  test(`installed Sound ${implementation} removes all native subscriptions after a rejected unload`, async () => {
    const InstalledSound = implementation === 'source' ? Sound : RuntimeSound;
    const { sound } = await InstalledSound.createAsync({ uri: 'https://audio.test/released.mp3' });
    assert.equal(subscriptions.size, 3);
    players.delete(nextKey); // Android AVManager releases errored streams without a JS error event.
    await assert.rejects(() => sound.unloadAsync(), { code: 'E_AUDIO_NOPLAYER' });
    assert.equal(subscriptions.size, 0);
    await sound.unloadAsync();
    assert.equal(subscriptions.size, 0);
  });

  test(`installed Sound ${implementation} retains subscriptions until a successful native unload settles`, async () => {
    const InstalledSound = implementation === 'source' ? Sound : RuntimeSound;
    const { sound } = await InstalledSound.createAsync({ uri: 'https://audio.test/retained.mp3' });
    const gate = deferred();
    unloadGates.set(nextKey, gate.promise);
    const unloading = sound.unloadAsync();
    await flush();
    assert.equal(subscriptions.size, 3);
    gate.resolve();
    await unloading;
    assert.equal(subscriptions.size, 0);
  });
}

test('verifying a released installed Sound retires listeners without a hidden rejection', async () => {
  await mod.default.add(track('released'));
  const releasedKey = nextKey;
  players.delete(releasedKey);
  const errors: unknown[] = [];
  const capture = (error: unknown) => errors.push(error);
  process.on('unhandledRejection', capture);
  try {
    assert.equal(await mod.default.verifyActiveTrack(), false);
    await mod.default.stop();
    await flush();
    assert.equal(subscriptions.size, 0);
    assert.deepEqual(errors, []);
    assert.equal(calls.filter((call) => call === `get:${releasedKey}`).length, 1);
    assert.equal(await mod.default.getActiveTrack(), null);
  } finally {
    process.off('unhandledRejection', capture);
  }
});

test('stopping a native-released installed Sound drains its rejected unload', async () => {
  await mod.default.add(track('released'));
  players.delete(nextKey);
  await mod.default.stop();
  await flush();
  assert.equal(subscriptions.size, 0);
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Stopped });
});

test('failed SDK unload removes only that Sound and preserves another live subscription', async () => {
  const { sound: released } = await Sound.createAsync({ uri: 'https://audio.test/released.mp3' });
  const oldKey = nextKey;
  const statuses: unknown[] = [];
  const { sound: retained } = await Sound.createAsync(
    { uri: 'https://audio.test/independent.mp3' },
    {},
    (status) => statuses.push(status)
  );
  const liveKey = nextKey;
  assert.equal(subscriptions.size, 6);
  players.delete(oldKey);
  await assert.rejects(() => released.unloadAsync(), { code: 'E_AUDIO_NOPLAYER' });
  assert.equal(subscriptions.size, 3);
  const playing = { isLoaded: true, isPlaying: true, positionMillis: 1000 };
  emitNativeStatus(liveKey, playing);
  assert.deepEqual(statuses.at(-1), playing);
  await retained.unloadAsync();
  assert.equal(subscriptions.size, 0);
});

test('a native SDK error event releases listeners and the wrapper retires that Sound', async () => {
  await mod.default.add(track('error-event'));
  const key = nextKey;
  players.delete(key);
  for (const subscription of [...subscriptions]) {
    if (subscription.event === 'ExponentAV.onError') {
      subscription.listener({ key, error: 'stream failed' });
    }
  }
  await flush();
  assert.equal(subscriptions.size, 0);
  assert.equal(await mod.default.getActiveTrack(), null);
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Error });
});

test('replacement waits for a dropped Sound cleanup and only loads the latest request', async () => {
  await mod.default.add(track('released'));
  const oldKey = nextKey;
  const gate = deferred();
  unloadGates.set(oldKey, gate.promise);
  players.delete(oldKey);
  assert.equal(await mod.default.verifyActiveTrack(), false);
  const first = mod.default.add(track('superseded'));
  await flush();
  const latest = mod.default.add(track('latest'));
  await flush();
  try {
    assert.equal(calls.filter((call) => call.startsWith('load:')).length, 1);
    assert.equal(subscriptions.size, 3);
    emitNativeStatus(oldKey, { isLoaded: false, error: 'late old error' });
    assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Loading });
  } finally {
    gate.resolve();
    await Promise.all([first, latest]);
  }
  assert.equal(calls.filter((call) => call.startsWith('load:')).length, 2);
  assert.equal(subscriptions.size, 3, 'only the new sound remains subscribed');
  assert.deepEqual(await mod.default.getActiveTrack(), track('latest'));
});

test('late outgoing native statuses cannot overwrite replacement loading or playback', async () => {
  await mod.default.add(track('old'));
  const oldKey = nextKey;
  const oldCallbacks = [...subscriptions];
  const gate = deferred();
  unloadGates.set(oldKey, gate.promise);
  const replacement = mod.default.add(track('new'));
  await flush();
  try {
    emitNativeStatus(oldKey, { isLoaded: false, error: 'late old error' });
    assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Loading });
    assert.equal(calls.filter((call) => call.startsWith('load:')).length, 1);
  } finally {
    gate.resolve();
    await replacement;
  }
  emitNativeStatus(nextKey, { isLoaded: true, isPlaying: true, positionMillis: 1000 });
  for (const subscription of oldCallbacks) {
    if (subscription.event === 'didUpdatePlaybackStatus') {
      subscription.listener({ key: oldKey, status: { isLoaded: false, error: 'stale event' } });
    }
  }
  assert.deepEqual(await mod.default.getPlaybackState(), { state: mod.State.Playing });
  assert.deepEqual(await mod.default.getActiveTrack(), track('new'));
});
