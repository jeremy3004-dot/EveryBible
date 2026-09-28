import React, { useLayoutEffect } from 'react';
import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { act } from 'react-test-renderer';
import type { Audio } from 'expo-av';
import type { ChapterFeedbackReviewItem } from '../../../services/feedback';
import { mockModule, mockPackage, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';

// Keep the installed Sound callback/setter implementation; fake only its native boundary.
const harness = installRenderHarness(mock, { os: 'android' });
const sdkRoot = dirname(createRequire(import.meta.url).resolve('expo-av/package.json'));
interface NativeSubscription {
  event: string;
  listener: (payload: unknown) => void;
}
const subscriptions = new Set<NativeSubscription>();
class NativeEmitter {
  addListener(event: string, listener: (payload: unknown) => void) {
    const entry = { event, listener };
    subscriptions.add(entry);
    return { remove: () => subscriptions.delete(entry) };
  }
}
let nextKey = 0;
const players = new Map<number, Record<string, unknown>>();
const calls: string[] = [];
const listened: string[] = [];
let releaseAtLoadReturn = false;
let nextLoadGate: Promise<void> | null = null;
const missing = () =>
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
      positionMillis: 0,
      durationMillis: 20_000,
    };
    players.set(key, full);
    calls.push(`load:${key}`);
    const gate = nextLoadGate;
    nextLoadGate = null;
    await gate;
    return [key, full];
  },
  getStatusForSound: async (key: number) => {
    calls.push(`get:${key}`);
    if (!players.has(key)) throw missing();
    return players.get(key);
  },
  setStatusForSound: async (key: number, status: Record<string, unknown>) => {
    calls.push(`set:${key}:${status.shouldPlay}`);
    if (!players.has(key)) throw missing();
    const full = {
      ...players.get(key),
      ...status,
      isPlaying: status.shouldPlay ?? players.get(key)?.isPlaying,
    };
    players.set(key, full);
    return full;
  },
  unloadForSound: async (key: number) => {
    calls.push(`unload:${key}`);
    if (!players.has(key)) throw missing();
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
mockModule(mock, join(sdkRoot, 'src/Audio.ts'), {
  PitchCorrectionQuality: { Low: 0, Medium: 1, High: 2 },
});
mockModule(mock, sourcePath('stores/translatorReviewStore.ts'), {
  useTranslatorReviewStore: {
    getState: () => ({ markListened: (id: string) => listened.push(id) }),
  },
});
mockModule(mock, sourcePath('services/feedback/index.ts'), {
  refreshFeedbackAudioUrl: async () => ({
    success: true,
    playbackUrl: 'https://example.invalid/reviewer.m4a',
  }),
});
let Sound: typeof Audio.Sound;
let useVoice: typeof import('./useFeedbackVoiceNote').useFeedbackVoiceNote;
let api: ReturnType<typeof useVoice> | undefined;
const note: ChapterFeedbackReviewItem = {
  contributorCategory: 'scripture_council',
  id: 'voice-1',
  createdAt: '2026-09-01T12:00:00Z',
  translationId: 'bsb',
  translationLanguage: 'en',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: null,
  participantName: 'Ruth',
  participantRole: null,
  participantIdNumber: null,
  sourceScreen: 'reader',
  resolution: null,
  resolvedAt: null,
  resolutionNote: null,
  audioResponse: null,
};
before(async () => {
  Sound = (await import(pathToFileURL(join(sdkRoot, 'src/Audio/Sound.ts')).href)).Sound;
  mockPackage(mock, 'expo-av', {
    Audio: {
      setAudioModeAsync: async () => {},
      Sound: {
        createAsync: async (...args: Parameters<typeof Sound.createAsync>) => {
          const result = await Sound.createAsync(...args);
          // Node/tsx materializes declaration-only SDK fields as undefined. Restore
          // the actual public mixin implementations, not substitutes for playback.
          for (const method of [
            'playAsync',
            'pauseAsync',
            'stopAsync',
            'setVolumeAsync',
            'setPositionAsync',
          ] as const) {
            Object.defineProperty(result.sound, method, { value: Sound.prototype[method] });
          }
          // Android's native error listener can remove a loaded remote stream
          // before its JS consumer runs, without notifying the SDK Sound object.
          if (releaseAtLoadReturn) players.delete(nextKey);
          return result;
        },
      },
    },
  });
  ({ useFeedbackVoiceNote: useVoice } = await import('./useFeedbackVoiceNote'));
});
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });
};
function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
function emit(key: number, status: Record<string, unknown>) {
  for (const subscription of [...subscriptions]) {
    if (subscription.event === 'didUpdatePlaybackStatus') {
      subscription.listener({ key, status: { ...players.get(key), ...status } });
    }
  }
}
function Harness() {
  const voice = useVoice(() => ({
    apiVersion: 2,
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    passcode: '123456',
    category: 'all',
    status: 'pending',
    positiveOnly: false,
  }));
  useLayoutEffect(() => {
    api = voice;
  });
  const { Pressable, Text } = harness.rn;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Listen"
        onPress={() => {
          void voice.play(note);
        }}
      >
        <Text>{voice.playing ?? 'idle'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop"
        onPress={() => voice.stop()}
      />
    </>
  );
}
afterEach(async () => {
  api?.stop();
  await flush();
  const { resetNarrationOwnership } = await import('../../../services/audio/narrationOwnership');
  resetNarrationOwnership();
  releaseAtLoadReturn = false;
  nextLoadGate = null;
  players.clear();
  subscriptions.clear();
  calls.length = 0;
  listened.length = 0;
  api = undefined;
});

test('released remote reviewer preview reports its transport error without a hidden SDK status rejection', async () => {
  releaseAtLoadReturn = true;
  const unhandled: unknown[] = [];
  const capture = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', capture);
  try {
    const view = await harness.render(<Harness />);
    await view.press(view.getByRole('button', { name: 'Listen' }));
    await flush();
    assert.deepEqual(unhandled, []);
    assert.equal(
      calls.some((call) => call.startsWith('get:')),
      false
    );
    assert.equal(api?.playing, null);
    assert.equal(
      harness.rn.__recorded.alerts.length,
      1,
      'the current explicit Play failure remains visible'
    );
  } finally {
    process.off('unhandledRejection', capture);
  }
});

test('healthy installed reviewer preview toggles pause and resume without redundant status queries', async () => {
  const view = await harness.render(<Harness />);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  await flush();
  const key = nextKey;
  assert.equal(api?.playing, note.id);
  assert.equal(players.get(key)?.isPlaying, true);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  assert.equal(api?.playing, null);
  assert.equal(players.get(key)?.isPlaying, false);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  await flush();
  assert.equal(api?.playing, note.id);
  assert.equal(
    calls.some((call) => call.startsWith('get:')),
    false
  );
});

test('installed reviewer status retains listened threshold and EOF release', async () => {
  const view = await harness.render(<Harness />);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  await flush();
  const key = nextKey;
  await act(async () => emit(key, { positionMillis: 11_999 }));
  assert.deepEqual(listened, []);
  await act(async () => emit(key, { positionMillis: 12_000 }));
  assert.deepEqual(listened, [note.id]);
  await act(async () => emit(key, { positionMillis: 20_000, didJustFinish: true }));
  await flush();
  assert.equal(api?.playing, null);
  assert.equal(players.size, 0);
  assert.equal(subscriptions.size, 0);
  assert.deepEqual(listened, [note.id, note.id]);
});

test('Stop during installed native load discards the sound and all obsolete status callbacks', async () => {
  const gate = deferred();
  nextLoadGate = gate.promise;
  const view = await harness.render(<Harness />);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  await flush();
  const key = nextKey;
  await view.press(view.getByRole('button', { name: 'Stop' }));
  gate.resolve();
  await flush();
  assert.equal(calls.includes(`set:${key}:true`), false);
  assert.equal(players.size, 0);
  assert.equal(api?.playing, null);
  assert.deepEqual(listened, []);
});

test('a captured installed callback cannot mark listened or stop a replacement reviewer preview', async () => {
  const view = await harness.render(<Harness />);
  await view.press(view.getByRole('button', { name: 'Listen' }));
  await flush();
  const oldKey = nextKey;
  const oldCallback = [...subscriptions].find(
    (subscription) => subscription.event === 'didUpdatePlaybackStatus'
  )?.listener;
  assert.ok(oldCallback);
  await act(async () => {
    await api?.play({ ...note, id: 'voice-2' });
  });
  const newKey = nextKey;
  await act(async () =>
    oldCallback({ key: oldKey, status: { isLoaded: true, didJustFinish: true } })
  );
  assert.equal(api?.playing, 'voice-2');
  assert.equal(players.get(newKey)?.isPlaying, true);
  assert.deepEqual(listened, []);
});
