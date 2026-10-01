import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import type { MockTimers } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockMmkvStorage, mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import type { AudioChapterMap } from '../services/bible/contentAvailability';
import { createInstance } from 'i18next';
import { zh } from '../i18n/locales/zh';
import { shallow } from 'zustand/shallow';
import { assertDefined } from '../utils/assertDefined';
import type { BackgroundMusicChoice, PlaybackRate } from '../types';

// ---------------------------------------------------------------------------
// A deterministic hook harness.
//
// No React renderer is installed, so `react` itself is replaced with the shared
// runtime from `src/testing/reactHookRuntime.ts`: per-instance slots for
// useState / useRef / useMemo / useCallback, dependency comparison with
// Object.is, and effects that only run when a test commits them (cleanups
// first, then effects, as React commits them). Re-renders are explicit:
// nothing re-runs until a test asks for it.
// ---------------------------------------------------------------------------

const runtime = createReactHookRuntime();
const rn = mockReactNative(mock);

// One integration regression drives the real shim and audioPlayer facade, while
// the rest of this harness keeps using its recording transport double.
let nativeStatusListener: ((status: NativeIntegrationStatus) => void) | undefined;
let integrationSeekGate: Promise<void> | null = null;
let integrationNativeReleased = false;
let integrationInitialPlayFailure: { error: Error; response?: Promise<void> } | null = null;
let integrationNativeCreates = 0;
let integrationStatusGate: Promise<void> | null = null;
let integrationStatusCalls = 0;
const integrationNativeStatus = {
  isLoaded: true as const,
  positionMillis: 0,
  durationMillis: 600_000,
  isPlaying: false,
  isBuffering: false,
  didJustFinish: false,
};
// Ambient integration uses the real service with native intent applied before
// any delayed JS response, as Expo's Android status command does.
class AmbientNativeSound {
  playing = false;
  loaded = true;
  volume = 0;
  stopGate: Promise<void> | null = null;
  stopCalls = 0;
  unloadCalls = 0;
  async playAsync() {
    this.playing = true;
  }
  async pauseAsync() {
    this.playing = false;
  }
  async stopAsync() {
    this.stopCalls += 1;
    this.playing = false;
    if (this.stopGate) await this.stopGate;
  }
  async unloadAsync() {
    this.unloadCalls += 1;
    this.loaded = false;
    this.playing = false;
  }
  async setVolumeAsync(volume: number) {
    this.volume = volume;
  }
  async setPositionAsync() {}
  setOnPlaybackStatusUpdate() {}
}
const ambientNativeSounds: AmbientNativeSound[] = [];
for (const name of ['ambient', 'piano', 'soft-guitar', 'harp', 'flute', 'sitar', 'ocean-waves']) {
  mockModule(mock, sourcePath(`../assets/audio/background/${name}.m4a`), { default: 1 });
}
mockModule(mock, sourcePath('services/audio/backgroundSoundCache.ts'), {
  backgroundSoundCache: {
    refresh: async () => {},
    getAvailability: () => 'bundled',
    getCachedUri: async () => null,
    ensureCached: async () => null,
    discard: async () => {},
  },
});

mockModule(mock, 'expo-av', {
  Audio: {
    setAudioModeAsync: async () => {},
    Sound: {
      createAsync: async (
        _source: unknown,
        _initial: unknown,
        listener: (status: NativeIntegrationStatus) => void
      ) => {
        if (typeof _source === 'number') {
          const sound = new AmbientNativeSound();
          ambientNativeSounds.push(sound);
          return { sound };
        }
        nativeStatusListener = listener;
        integrationNativeCreates += 1;
        // Android keeps shouldPlay armed at EOF, even though isPlaying is false.
        let shouldPlay = false;
        let releasedAfterInitialPlay = false;
        const seek = async (positionMillis: number, playIntent = shouldPlay) => {
          const gate = integrationSeekGate;
          if (gate) await gate;
          shouldPlay = playIntent;
          const status = { ...integrationNativeStatus, positionMillis, isPlaying: shouldPlay };
          nativeStatusListener?.(status);
          return status;
        };
        return {
          sound: {
            playAsync: async () => {
              const failure = integrationInitialPlayFailure;
              if (failure) {
                integrationInitialPlayFailure = null;
                // Expo's error callback marks this sound unloaded before a
                // pending transport rejection reaches the JS caller.
                releasedAfterInitialPlay = true;
                listener({ isLoaded: false, error: failure.error.message });
                await failure.response;
                throw failure.error;
              }
              shouldPlay = true;
              return { ...integrationNativeStatus, isPlaying: true };
            },
            pauseAsync: async () => {
              shouldPlay = false;
              nativeStatusListener?.({ ...integrationNativeStatus, isPlaying: false });
            },
            setRateAsync: async () => {},
            setVolumeAsync: async () => {},
            getStatusAsync: async () => {
              integrationStatusCalls += 1;
              const released = integrationNativeReleased || releasedAfterInitialPlay;
              const status = { ...integrationNativeStatus, isPlaying: shouldPlay };
              const gate = integrationStatusGate;
              if (gate) await gate;
              if (released) throw new Error('Player does not exist.');
              return status;
            },
            setPositionAsync: (positionMillis: number) => seek(positionMillis),
            setStatusAsync: (status: { positionMillis: number; shouldPlay: boolean }) =>
              seek(status.positionMillis, status.shouldPlay),
            stopAsync: async () => integrationNativeStatus,
            unloadAsync: async () => integrationNativeStatus,
            setOnPlaybackStatusUpdate: () => {
              nativeStatusListener = undefined;
            },
          },
        };
      },
    },
  },
  InterruptionModeIOS: { DoNotMix: 1 },
  InterruptionModeAndroid: { DoNotMix: 1 },
});

// ---------------------------------------------------------------------------
// Recording doubles for every native-backed collaborator
// ---------------------------------------------------------------------------

interface ProgressSnapshot {
  isLoaded: true;
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
}

type NativeIntegrationStatus = ProgressSnapshot | { isLoaded: false; error?: string };

interface AudioAsset {
  url: string;
  duration: number;
}

interface PlayerCall {
  method: string;
  args: unknown[];
}

const recorded = {
  player: [] as PlayerCall[],
  nowPlaying: [] as Record<string, unknown>[],
  nowPlayingCleared: 0,
  backgroundMusic: [] as { method: 'sync' | 'stop'; choice?: string; shouldPlay?: boolean }[],
  backgroundMusicLevels: [] as number[],
  narrationVolumes: [] as number[],
  analytics: [] as { name: string; properties: Record<string, unknown> }[],
  history: [] as { bookId: string; chapter: number; progress: number }[],
  listened: [] as { bookId: string; chapter: number }[],
  listeningMs: [] as number[],
  prefetch: [] as { translationId: string; bookId: string; chapter: number; count: number }[],
  deletedFiles: [] as string[],
  audioLookups: [] as { translationId: string; bookId: string; chapter: number }[],
  remoteLookups: [] as { translationId: string; bookId: string; chapter: number }[],
  remoteUnsubscribes: 0,
  coverageLookups: [] as (string | undefined)[],
  reports: [] as { source: string; message: string; reportTimeouts: boolean }[],
};

const DEFAULT_DURATION_MS = 600_000;

/**
 * One scripted outcome of a chapter load: the native player reporting an error (through
 * onError, then the rejected load, as the wrapper does), a load that never settles, or
 * a load that succeeds.
 */
type LoadStep = { nativeError: string } | 'stall' | 'ok';
const IOS_TIMED_OUT =
  'The request timed out. - The AVPlayerItem instance has failed with the error code -1001 and domain "NSURLErrorDomain".';
const playerGates = new Map<string, Promise<void>>();

const defaultChapterAudio = async (
  translationId: string,
  bookId: string,
  chapter: number
): Promise<AudioAsset | null> => ({
  url: `https://cdn.example/${translationId}/${bookId}/${chapter}.mp3`,
  duration: DEFAULT_DURATION_MS,
});

const scenario = {
  availableTranslations: new Set<string>(['bsb', 'web']),
  chapterAudio: defaultChapterAudio as (
    translationId: string,
    bookId: string,
    chapter: number
  ) => Promise<AudioAsset | null>,
  remoteFallback: (async () => null) as (
    translationId: string,
    bookId: string,
    chapter: number
  ) => Promise<AudioAsset | null>,
  failLoadUrls: new Set<string>(),
  contentSummary: undefined as { audioChapters?: AudioChapterMap } | undefined,
  /**
   * Per-translation chapter coverage as the coverage service knows it right now,
   * independent of what the reader last rendered.
   */
  liveCoverage: new Map<string, AudioChapterMap>(),
  /** Holds every coverage lookup until released. */
  coverageGate: null as Promise<void> | null,
  /** The native side released the loaded sound without telling JS (Android). */
  nativeSoundReleased: false,
  /** Per URL, the outcome of each successive load; unscripted loads succeed. */
  loadScript: new Map<string, LoadStep[]>(),
};

interface AudioPlayerCallbacks {
  onStatusUpdate?: (snapshot: ProgressSnapshot) => void;
  onPlaybackFinished?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

interface AudioPlayerDouble {
  loaded: boolean;
  callbacks: AudioPlayerCallbacks;
  setCallbacks(callbacks: AudioPlayerCallbacks): void;
  loadAndPlay(url: string, rate: PlaybackRate, startPositionMs?: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  verifyLoaded(): Promise<void>;
  isLoaded(): boolean;
}

const audioPlayerDouble: AudioPlayerDouble = {
  loaded: false,
  callbacks: {},
  setCallbacks(callbacks: AudioPlayerCallbacks) {
    audioPlayerDouble.callbacks = callbacks;
    recorded.player.push({ method: 'setCallbacks', args: [] });
  },
  async loadAndPlay(url: string, rate: PlaybackRate, startPositionMs?: number) {
    recorded.player.push({
      method: 'loadAndPlay',
      // A load from the top (offset 0) is recorded as [url, rate].
      args: startPositionMs ? [url, rate, startPositionMs] : [url, rate],
    });
    if (scenario.failLoadUrls.has(url)) {
      throw new Error(`decode failed: ${url}`);
    }
    const step = scenario.loadScript.get(url)?.shift() ?? 'ok';
    if (step === 'stall') {
      await new Promise<never>(() => {});
    }
    if (typeof step === 'object') {
      audioPlayerDouble.callbacks.onError?.(step.nativeError);
      throw new Error(step.nativeError);
    }
    const gate = playerGates.get(`load:${url}`);
    if (gate) await gate;
    audioPlayerDouble.loaded = true;
  },
  async pause() {
    recorded.player.push({ method: 'pause', args: [] });
    const gate = playerGates.get('pause');
    if (gate) await gate;
  },
  async resume() {
    recorded.player.push({ method: 'resume', args: [] });
    const gate = playerGates.get('resume');
    if (gate) await gate;
  },
  async stop() {
    recorded.player.push({ method: 'stop', args: [] });
    audioPlayerDouble.loaded = false;
    const gate = playerGates.get('stop');
    if (gate) await gate;
  },
  async seekTo(positionMs: number) {
    recorded.player.push({ method: 'seekTo', args: [positionMs] });
    const gate = playerGates.get('seek');
    if (gate) await gate;
  },
  async setRate(rate: number) {
    recorded.player.push({ method: 'setRate', args: [rate] });
    const gate = playerGates.get(`rate:${rate}`);
    if (gate) await gate;
  },
  async setVolume(volume: number) {
    recorded.narrationVolumes.push(volume);
    const gate = playerGates.get(`volume:${volume}`);
    if (gate) await gate;
  },
  async verifyLoaded() {
    recorded.player.push({ method: 'verifyLoaded', args: [] });
    if (scenario.nativeSoundReleased && audioPlayerDouble.loaded) {
      audioPlayerDouble.loaded = false;
      audioPlayerDouble.callbacks.onError?.('Player does not exist.');
    }
  },
  isLoaded() {
    return audioPlayerDouble.loaded;
  },
};

let liveAmbientPlayer:
  | (typeof import('../services/audio/backgroundMusicPlayer'))['backgroundMusicPlayer']
  | null = null;
const backgroundMusicDouble = {
  async sync(choice: string, shouldPlay: boolean) {
    recorded.backgroundMusic.push({ method: 'sync', choice, shouldPlay });
    if (liveAmbientPlayer)
      await liveAmbientPlayer.sync(choice as BackgroundMusicChoice, shouldPlay);
  },
  setLevel(level: number) {
    recorded.backgroundMusicLevels.push(level);
    liveAmbientPlayer?.setLevel(level);
  },
  getShuffleCandidates: () =>
    liveAmbientPlayer?.getShuffleCandidates() ?? ['piano', 'harp', 'ocean-waves'],
  async stop() {
    recorded.backgroundMusic.push({ method: 'stop' });
    if (liveAmbientPlayer) await liveAmbientPlayer.stop();
  },
};

type RemoteCommand = { command: string; positionSeconds?: number };
type RemoteCommandHandler = (command: RemoteCommand) => void | Promise<void>;
// Every live subscription receives each command, as the native emitter delivers
// it, so a player that failed to hand over its subscription would act twice.
const remoteCommandListeners = new Set<RemoteCommandHandler>();
let remoteCommandListener: RemoteCommandHandler | null = null;
const dispatchRemoteCommand: RemoteCommandHandler = async (command) => {
  for (const listener of Array.from(remoteCommandListeners)) {
    await listener(command);
  }
};

const bibleState = {
  translations: [{ id: 'bsb', name: 'Berean Standard Bible' }] as { id: string; name: string }[],
  // The saved reading position (the Bible tab resume), as the reading slice keeps it.
  currentBook: 'GEN',
  currentChapter: 1,
  hasReaderHistory: false,
  setReadingPosition: (position: { bookId: string; chapter: number }) =>
    bibleState.applySyncedReadingPosition(position),
  applySyncedReadingPosition: ({ bookId, chapter }: { bookId: string; chapter: number }) => {
    bibleState.currentBook = bookId;
    bibleState.currentChapter = chapter;
    bibleState.hasReaderHistory = true;
  },
};

const mmkv = mockMmkvStorage(mock);

// Keys by default; a test can swap in a real locale to prove translated text is stored.
let activeTranslate: (key: string) => string = (key) => key;
const translate = (key: string) => activeTranslate(key);

// tsx compiles this repo's TypeScript to CommonJS, so a package whose
// "exports" map splits import/require (react-i18next, zustand) resolves to a
// different file for the module under test than for a bare specifier. Mock
// both keys so the CJS consumer gets the double too.
const localRequire = createRequire(sourcePath('hooks/useAudioPlayer.test.ts'));
const mockPackage = (specifier: string, exports: Record<string, unknown>) => {
  mockModule(mock, specifier, exports);
  try {
    mockModule(mock, localRequire.resolve(specifier), exports);
  } catch (error) {
    // A package with a single entry point resolves to the file the bare
    // specifier already mocked; Node rejects the duplicate registration.
    if ((error as { code?: string }).code !== 'ERR_INVALID_STATE') {
      throw error;
    }
  }
};

mockPackage('react', runtime.react);
mockPackage('react-i18next', { useTranslation: () => ({ t: translate }) });
// Identity wrapper that remembers the selector, so a test can check what the
// transport subscription re-renders on (zustand compares it with `shallow`).
type StoreSelector = (state: object) => Record<string, unknown>;
const shallowSelectors: StoreSelector[] = [];
mockPackage('zustand/react/shallow', {
  useShallow: (selector: StoreSelector) => {
    shallowSelectors.push(selector);
    return selector;
  },
});

mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: Object.assign(
    (selector: (state: typeof bibleState) => unknown) => selector(bibleState),
    { getState: () => bibleState }
  ),
});
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: {
    getState: () => ({
      recordHistory: (bookId: string, chapter: number, progress: number) => {
        recorded.history.push({ bookId, chapter, progress });
      },
    }),
  },
});
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: {
    getState: () => ({
      markChapterListened: (bookId: string, chapter: number) => {
        recorded.listened.push({ bookId, chapter });
      },
      recordListeningTime: (durationMs: number) => {
        recorded.listeningMs.push(durationMs);
      },
    }),
  },
});
mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: audioPlayerDouble,
  backgroundMusicPlayer: backgroundMusicDouble,
  clearBibleNowPlaying: async () => {
    recorded.nowPlayingCleared += 1;
  },
  syncBibleNowPlaying: async (input: Record<string, unknown>) => {
    recorded.nowPlaying.push(input);
  },
  getChapterAudioUrl: async (translationId: string, bookId: string, chapter: number) => {
    recorded.audioLookups.push({ translationId, bookId, chapter });
    return scenario.chapterAudio(translationId, bookId, chapter);
  },
  isAudioAvailable: (translationId: string) => scenario.availableTranslations.has(translationId),
  prefetchChapterAudio: async (
    translationId: string,
    bookId: string,
    chapter: number,
    count: number
  ) => {
    recorded.prefetch.push({ translationId, bookId, chapter, count });
  },
  subscribeBibleNowPlayingRemoteCommands: (
    listener: (command: RemoteCommand) => void | Promise<void>
  ) => {
    remoteCommandListeners.add(listener);
    remoteCommandListener = dispatchRemoteCommand;
    return () => {
      // A subscription left over from an earlier test was already dropped in beforeEach.
      if (!remoteCommandListeners.delete(listener)) return;
      recorded.remoteUnsubscribes += 1;
      if (remoteCommandListeners.size === 0) remoteCommandListener = null;
    };
  },
});
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: {
    deleteFile: async (fileUri: string) => {
      recorded.deletedFiles.push(fileUri);
    },
  },
});
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  fetchRemoteChapterAudio: async (translationId: string, bookId: string, chapter: number) => {
    recorded.remoteLookups.push({ translationId, bookId, chapter });
    return scenario.remoteFallback(translationId, bookId, chapter);
  },
});
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (
    source: string,
    error: unknown,
    options: { reportTimeouts?: boolean } = {}
  ) => {
    recorded.reports.push({
      source,
      message: error instanceof Error ? error.message : String(error),
      reportTimeouts: options.reportTimeouts === true,
    });
  },
});
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  trackAnonymousUsageEvent: (name: string, properties: Record<string, unknown>) => {
    recorded.analytics.push({ name, properties });
  },
});
mockModule(mock, sourcePath('hooks/useTranslationContentSummary.ts'), {
  useTranslationContentSummary: () => scenario.contentSummary,
});
mockModule(mock, sourcePath('services/audio/audioChapterCoverage.ts'), {
  peekAudioChapterMap: (translation: { id: string } | undefined) =>
    translation ? scenario.liveCoverage.get(translation.id) : undefined,
  resolveAudioChapterMap: async (translation: { id: string } | undefined) => {
    recorded.coverageLookups.push(translation?.id);
    if (scenario.coverageGate) await scenario.coverageGate;
    return translation ? scenario.liveCoverage.get(translation.id) : undefined;
  },
});

// tsx compiles this file to CJS, so the modules under test load in `before`.
type PlayerApi = ReturnType<(typeof import('./useAudioPlayer'))['useAudioPlayer']>;
let useAudioPlayer: (typeof import('./useAudioPlayer'))['useAudioPlayer'];
let useAudioStore: (typeof import('../stores/audioStore'))['useAudioStore'];

before(async () => {
  ({ useAudioPlayer } = await import('./useAudioPlayer'));
  ({ useAudioStore } = await import('../stores/audioStore'));
});

interface MountedPlayer {
  readonly api: PlayerApi;
  rerender: () => PlayerApi;
  flushEffects: () => void;
  unmount: () => void;
}

// Every mounted hook is tracked so `afterEach` can run its effect cleanups.
// The hook owns three `setInterval`s (position interpolation, listening
// telemetry, sleep timer) that only stop when React unmounts the effects; a
// test that leaves one running keeps the whole runner process alive.
const mountPlayer = (translationId = 'bsb'): MountedPlayer => {
  const view = runtime.mount(useAudioPlayer, translationId);
  view.flushEffects();
  return {
    get api() {
      return view.result;
    },
    rerender: () => {
      view.rerender();
      view.flushEffects();
      return view.result;
    },
    flushEffects: view.flushEffects,
    unmount: view.unmount,
  };
};

const store = () => useAudioStore.getState();

/** Where the most recent chapter load was asked to start (0 = the top). */
const loadedStartOffset = () =>
  (playerCalls('loadAndPlay').at(-1)?.args[2] as number | undefined) ?? 0;

const playerCalls = (method: string) => recorded.player.filter((call) => call.method === method);

const snapshotOf = (overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  isLoaded: true,
  positionMillis: 0,
  durationMillis: 0,
  isPlaying: false,
  isBuffering: false,
  didJustFinish: false,
  ...overrides,
});

const emitStatus = (overrides: Partial<ProgressSnapshot> = {}) => {
  audioPlayerDouble.callbacks.onStatusUpdate?.(snapshotOf(overrides));
};

const finishPlayback = async () => {
  await audioPlayerDouble.callbacks.onPlaybackFinished?.();
};

const BASE_TIME = 1_700_000_000_000;

// A leak guard with teeth. The hook's intervals are real timers unless a test
// enables `mock.timers`, and a leaked one keeps the runner process alive
// forever instead of failing. Recording live handles turns that hang into an
// ordinary assertion failure naming the test that leaked.
const intervalLeakGuard = runtime.installIntervalLeakGuard();

after(() => {
  intervalLeakGuard.restore();
});

beforeEach(() => {
  rn.AppState.emit('active');
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  useAudioStore.persist.clearStorage();
  mmkv.store.clear();

  recorded.player.length = 0;
  recorded.nowPlaying.length = 0;
  recorded.nowPlayingCleared = 0;
  recorded.backgroundMusic.length = 0;
  recorded.analytics.length = 0;
  recorded.history.length = 0;
  recorded.listened.length = 0;
  recorded.listeningMs.length = 0;
  recorded.prefetch.length = 0;
  recorded.deletedFiles.length = 0;
  recorded.audioLookups.length = 0;
  recorded.remoteLookups.length = 0;
  recorded.remoteUnsubscribes = 0;
  recorded.coverageLookups.length = 0;
  recorded.reports.length = 0;

  playerGates.clear();
  scenario.availableTranslations = new Set(['bsb', 'web']);
  scenario.chapterAudio = defaultChapterAudio;
  scenario.remoteFallback = async () => null;
  scenario.failLoadUrls = new Set();
  scenario.contentSummary = undefined;
  scenario.liveCoverage = new Map();
  scenario.coverageGate = null;
  scenario.nativeSoundReleased = false;
  scenario.loadScript = new Map();
  activeTranslate = (key) => key;

  audioPlayerDouble.loaded = false;
  audioPlayerDouble.callbacks = {};
  remoteCommandListeners.clear();
  remoteCommandListener = null;
  bibleState.translations = [{ id: 'bsb', name: 'Berean Standard Bible' }];
  bibleState.currentBook = 'GEN';
  bibleState.currentChapter = 1;
  bibleState.hasReaderHistory = false;
});

afterEach(() => {
  // React unmounts the hook between screens; the harness has to do it by hand.
  runtime.unmountAll();
  intervalLeakGuard.assertNoLeaks();
});

// ---------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------

test('mounting registers the playback callbacks with the native player', () => {
  mountPlayer();

  assert.equal(playerCalls('setCallbacks').length, 1);
  assert.equal(typeof audioPlayerDouble.callbacks.onStatusUpdate, 'function');
  assert.equal(typeof audioPlayerDouble.callbacks.onPlaybackFinished, 'function');
});

test('mounting with nothing playing clears the lock screen entry', () => {
  mountPlayer();

  assert.equal(recorded.nowPlayingCleared, 1);
  assert.equal(recorded.nowPlaying.length, 0);
});

test('mounting subscribes to lock screen transport commands', () => {
  mountPlayer();

  assert.equal(typeof remoteCommandListener, 'function');
});

// The reader is pushed over the book browser, so going back unmounts the hook while
// the chapter keeps playing (AudioReturnTab exists for exactly that state). The lock
// screen, notification and headset controls must keep working until a new player
// mounts, the same way the native playback callbacks outlive the screen.
test('unmounting keeps the lock screen commands subscribed while audio plays on', () => {
  const player = mountPlayer();

  player.unmount();

  assert.equal(recorded.remoteUnsubscribes, 0);
  assert.equal(typeof remoteCommandListener, 'function');
});

test('a newly mounted player takes over the lock screen commands from the old one', async () => {
  const first = mountPlayer();
  await first.api.playChapter('GEN', 1);
  first.unmount();
  const second = mountPlayer();
  second.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'pause' });

  assert.equal(remoteCommandListeners.size, 1);
  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
});

test('audioAvailable reports whether the translation has any audio', () => {
  scenario.availableTranslations = new Set(['web']);

  assert.equal(mountPlayer('bsb').api.audioAvailable, false);
  assert.equal(mountPlayer('web').api.audioAvailable, true);
});

// ---------------------------------------------------------------------------
// playChapter — resolving a source and starting playback
// ---------------------------------------------------------------------------

test('playChapter loads the resolved chapter audio and reports it as playing', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(playerCalls('loadAndPlay'), [
    { method: 'loadAndPlay', args: ['https://cdn.example/bsb/GEN/1.mp3', 1] },
  ]);
  assert.equal(store().status, 'playing');
  assert.equal(store().currentTranslationId, 'bsb');
  assert.equal(store().currentBookId, 'GEN');
  assert.equal(store().currentChapter, 1);
  assert.equal(store().duration, DEFAULT_DURATION_MS);
});

test('playChapter makes the played chapter the whole queue', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    ['bsb:GEN:1']
  );
  assert.equal(store().queueIndex, 0);
});

test('playChapter opens the chapter in the listening history', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(recorded.history, [{ bookId: 'GEN', chapter: 1, progress: 0 }]);
});

test('playChapter checkpoints the outgoing chapter before switching', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(150_000);
  recorded.history.length = 0;

  await player.rerender().playChapter('GEN', 2);

  assert.deepEqual(recorded.history[0], { bookId: 'GEN', chapter: 1, progress: 0.25 });
});

test('playChapter publishes the chapter to the lock screen with skip availability', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(recorded.nowPlaying.at(-1), {
    translationId: 'bsb',
    translationName: 'Berean Standard Bible',
    bookId: 'GEN',
    // The lock-screen title uses the interface-language book name on both platforms;
    // the identity translator has no `bible.books.GEN`, so the English name stands in.
    bookName: 'Genesis',
    chapter: 1,
    positionMs: 0,
    durationMs: DEFAULT_DURATION_MS,
    isPlaying: true,
    playbackRate: 1,
    canSkipNext: true,
    canSkipPrevious: false,
    // What the iOS lock screen shows instead of the chapter in discreet mode.
    discreetTitle: 'audio.nowPlaying',
  });
});

test('on Android the lock-screen update carries interface-language notification strings', async (t) => {
  rn.Platform.OS = 'android';
  t.after(() => {
    rn.Platform.OS = 'ios';
  });
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(recorded.nowPlaying.at(-1)?.localized, {
    // The identity translator has no `bible.books.GEN`, so the English name stands in.
    bookName: 'Genesis',
    channelName: 'audio.nowPlaying',
    play: 'interface.playChapterAudio',
    pause: 'interface.pauseChapterAudio',
    previous: 'audio.previousChapter',
    next: 'audio.nextChapter',
    skipBackward: 'audio.skipBackward',
    skipForward: 'audio.skipForward',
  });
});

test('playChapter prefetches the chapters that follow', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(recorded.prefetch, [
    { translationId: 'bsb', bookId: 'GEN', chapter: 2, count: 2 },
  ]);
});

test('a downloaded chapter plays from its local file without reaching the network', async () => {
  scenario.chapterAudio = async () => ({ url: 'file:///audio/bsb/GEN/1.mp3', duration: 120_000 });
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(playerCalls('loadAndPlay'), [
    { method: 'loadAndPlay', args: ['file:///audio/bsb/GEN/1.mp3', 1] },
  ]);
  assert.deepEqual(recorded.remoteLookups, []);
  assert.equal(store().status, 'playing');
});

test('a negative resume offset starts the chapter from the beginning', async () => {
  const player = mountPlayer();

  await player.api.playChapterForTranslation('bsb', 'GEN', 1, undefined, {
    startPositionMs: -5_000,
  });

  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(store().currentPosition, 0);
});

test('playChapterForTranslation resumes from a stored position', async () => {
  const player = mountPlayer();

  await player.api.playChapterForTranslation('bsb', 'GEN', 1, undefined, {
    startPositionMs: 42_000,
  });

  assert.equal(loadedStartOffset(), 42_000);
  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(store().currentPosition, 42_000);
});

test('playChapterForTranslation can play a translation other than the hook default', async () => {
  const player = mountPlayer();

  await player.api.playChapterForTranslation('web', 'JHN', 3);

  assert.equal(store().currentTranslationId, 'web');
  assert.deepEqual(recorded.audioLookups, [{ translationId: 'web', bookId: 'JHN', chapter: 3 }]);
});

test('playing outside a pinned plan session releases the pin', async () => {
  const player = mountPlayer();
  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 3 },
    { bookId: 'GEN', chapter: 4 },
  ]);

  await player.rerender().playChapter('GEN', 1);

  assert.deepEqual(store().playbackSequence, []);
});

test('playing a chapter of a pinned plan session keeps the pin', async () => {
  const player = mountPlayer();
  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 3 },
    { bookId: 'GEN', chapter: 4 },
  ]);

  await player.rerender().playChapter('GEN', 3);

  assert.equal(store().playbackSequence.length, 2);
});

// ---------------------------------------------------------------------------
// playChapter — failure paths
// ---------------------------------------------------------------------------

test('playing a translation without audio reports it as unavailable', async () => {
  scenario.availableTranslations = new Set();
  const player = mountPlayer();
  recorded.nowPlayingCleared = 0;

  await player.api.playChapter('GEN', 1);

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioUnavailableTranslation');
  assert.equal(recorded.nowPlayingCleared, 1);
  assert.equal(playerCalls('loadAndPlay').length, 0);
});

test('a chapter with no audio source reports the chapter as unavailable', async () => {
  scenario.chapterAudio = async () => null;
  const player = mountPlayer();
  recorded.nowPlayingCleared = 0;

  await player.api.playChapter('GEN', 1);

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioUnavailableChapter');
  assert.equal(recorded.nowPlayingCleared, 1);
});

test('a failing audio lookup reports a generic playback failure', async () => {
  scenario.chapterAudio = async () => {
    throw new Error('content API unreachable');
  };
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
});

// The store keeps the message the listener reads, so it must hold the
// translated text rather than the key, whichever step failed.
for (const failure of ['unavailable', 'lookup', 'playback'] as const) {
  test(`a ${failure} failure stores its translated message and clears the lock screen once`, async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'zh', resources: { zh: { translation: zh } }, initImmediate: false });
    activeTranslate = (key) => i18n.t(key);
    if (failure === 'unavailable') scenario.chapterAudio = async () => null;
    if (failure === 'lookup') {
      scenario.chapterAudio = async () => {
        throw new Error('Server unavailable');
      };
    }
    if (failure === 'playback')
      scenario.failLoadUrls = new Set(['https://cdn.example/bsb/GEN/1.mp3']);
    const player = mountPlayer();
    recorded.nowPlayingCleared = 0;

    await player.api.playChapter('GEN', 1);

    assert.equal(store().status, 'error');
    assert.equal(
      store().error,
      failure === 'unavailable'
        ? zh.interface.audioUnavailableChapter
        : zh.interface.audioPlayFailed
    );
    assert.equal(recorded.nowPlayingCleared, 1);
    assert.equal(playerCalls('loadAndPlay').length, failure === 'playback' ? 1 : 0);
  });
}

test('the player reporting an error surfaces the playback failure message', () => {
  mountPlayer();

  audioPlayerDouble.callbacks.onError?.('native decoder gave up');

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
});

test('a native error callback during a resolved load is not overwritten by playing status', async () => {
  let release!: () => void;
  playerGates.set(
    'load:https://cdn.example/bsb/GEN/1.mp3',
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const player = mountPlayer();
  const pending = player.api.playChapter('GEN', 1);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  audioPlayerDouble.callbacks.onError?.('audio session busy');
  release();
  await pending;
  assert.equal(store().status, 'error');
  assert.equal(
    recorded.nowPlaying.some((entry) => entry.isPlaying === true),
    false
  );
});

test('a native error callback during resume does not publish playing status', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  await player.api.pause();
  recorded.nowPlaying.length = 0;
  let release!: () => void;
  playerGates.set(
    'resume',
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const pending = player.api.resume();
  audioPlayerDouble.callbacks.onError?.('audio session busy');
  release();
  await pending;
  assert.equal(store().status, 'error');
  assert.equal(
    recorded.nowPlaying.some((entry) => entry.isPlaying === true),
    false
  );
});

test('a delayed stop cannot stop background music belonging to a newer chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  let release!: () => void;
  playerGates.set(
    'stop',
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const stopping = player.api.stop();
  playerGates.delete('stop');
  await player.api.playChapter('GEN', 2);
  recorded.backgroundMusic.length = 0;
  release();
  await stopping;
  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
  assert.deepEqual(recorded.backgroundMusic, []);
});

test('a native error callback from a downloaded load still permits a healthy remote fallback', async () => {
  scenario.chapterAudio = async () => ({ url: 'file:///audio/GEN-1.m4a', duration: 100 });
  scenario.remoteFallback = async () => ({ url: 'https://cdn.example/GEN-1.mp3', duration: 900 });
  let release!: () => void;
  playerGates.set(
    'load:file:///audio/GEN-1.m4a',
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const player = mountPlayer();
  const pending = player.api.playChapter('GEN', 1);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  audioPlayerDouble.callbacks.onError?.('native decoder failed');
  release();
  await pending;
  assert.equal(store().status, 'playing');
  assert.equal(store().duration, 900);
  assert.equal(playerCalls('loadAndPlay').length, 2);
});

test('an undecodable download falls back to the streamed copy', async () => {
  scenario.chapterAudio = async () => ({ url: 'file:///audio/GEN-1.m4a', duration: 100 });
  scenario.failLoadUrls = new Set(['file:///audio/GEN-1.m4a']);
  scenario.remoteFallback = async () => ({ url: 'https://cdn.example/GEN-1.mp3', duration: 900 });
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[0]),
    ['file:///audio/GEN-1.m4a', 'https://cdn.example/GEN-1.mp3']
  );
  assert.equal(store().status, 'playing');
  assert.equal(store().duration, 900);
});

test('an undecodable download is deleted so it stops being preferred', async () => {
  scenario.chapterAudio = async () => ({ url: 'file:///audio/GEN-1.m4a', duration: 100 });
  scenario.failLoadUrls = new Set(['file:///audio/GEN-1.m4a']);
  scenario.remoteFallback = async () => ({ url: 'https://cdn.example/GEN-1.mp3', duration: 900 });
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.deepEqual(recorded.deletedFiles, ['file:///audio/GEN-1.m4a']);
});

for (const repairTiming of ['during local decode', 'during remote fallback'] as const) {
  test(`fallback cleanup preserves a replacement completed ${repairTiming}`, async (context) => {
    const local = 'file:///audio/bsb/GEN/1.mp3';
    const remote = 'https://cdn.example/bsb/GEN/1.mp3';
    const files = new Map([[local, 'old-corrupt-audio']]);
    const { expoAudioFileSystemAdapter } = await import('../services/audio/audioDownloadStorage');
    const { runAudioBookExclusively } = await import('../services/audio/download/activeDownloads');
    // This harness supplies the optional adapter delete method.
    context.mock.method(
      expoAudioFileSystemAdapter as typeof expoAudioFileSystemAdapter & {
        deleteFile: (uri: string) => Promise<void>;
      },
      'deleteFile',
      async (uri: string) => {
        recorded.deletedFiles.push(uri);
        files.delete(uri);
      }
    );
    scenario.chapterAudio = async () => ({ url: local, duration: 100 });
    scenario.failLoadUrls = new Set([local]);
    scenario.remoteFallback = async () => ({ url: remote, duration: 900 });
    const heldUrl = repairTiming === 'during local decode' ? local : remote;
    const gate = deferPlayerOperation();
    if (repairTiming === 'during local decode') {
      const load = audioPlayerDouble.loadAndPlay.bind(audioPlayerDouble);
      context.mock.method(
        audioPlayerDouble,
        'loadAndPlay',
        async (url: string, rate: PlaybackRate, start?: number) => {
          if (url !== local) return load(url, rate, start);
          recorded.player.push({ method: 'loadAndPlay', args: [url, rate] });
          await gate.promise;
          throw new Error(`decode failed: ${url}`);
        }
      );
    } else {
      playerGates.set(`load:${heldUrl}`, gate.promise);
    }
    const player = mountPlayer();
    const playing = player.api.playChapter('GEN', 1);
    await settleUntil(() => playerCalls('loadAndPlay').some((call) => call.args[0] === heldUrl));

    // The real download lease also covers direct native writes to the stable URI.
    await runAudioBookExclusively(
      'file:///audio/bsb/GEN/',
      new AbortController().signal,
      async () => {
        files.set(local, 'new-verified-audio');
      }
    );
    gate.resolve();
    await playing;

    assert.equal(store().status, 'playing');
    assert.equal(files.get(local), 'new-verified-audio');
    assert.deepEqual(recorded.deletedFiles, []);
  });
}

test('fallback cleanup does not delete a chapter while its book writer already owns the path', async () => {
  const local = 'file:///audio/bsb/GEN/1.mp3';
  const remote = 'https://cdn.example/bsb/GEN/1.mp3';
  const { runAudioBookExclusively } = await import('../services/audio/download/activeDownloads');
  const gate = deferPlayerOperation();
  let writerStarted = false;
  const writing = runAudioBookExclusively(
    'file:///audio/bsb/GEN/',
    new AbortController().signal,
    async () => {
      writerStarted = true;
      await gate.promise;
    }
  );
  await settleUntil(() => writerStarted);
  scenario.chapterAudio = async () => ({ url: local, duration: 100 });
  scenario.failLoadUrls = new Set([local]);
  scenario.remoteFallback = async () => ({ url: remote, duration: 900 });
  const player = mountPlayer();
  try {
    await player.api.playChapter('GEN', 1);
    assert.equal(store().status, 'playing');
    assert.deepEqual(recorded.deletedFiles, []);
  } finally {
    gate.resolve();
    await writing;
  }
});

test('an undecodable download with no streamed copy reports the playback failure', async () => {
  scenario.chapterAudio = async () => ({ url: 'file:///audio/GEN-1.m4a', duration: 100 });
  scenario.failLoadUrls = new Set(['file:///audio/GEN-1.m4a']);
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.equal(recorded.deletedFiles.length, 0);
});

test('a failing stream is not retried against the network again', async () => {
  scenario.failLoadUrls = new Set(['https://cdn.example/bsb/GEN/1.mp3']);
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(recorded.remoteLookups.length, 0);
  assert.equal(store().error, 'interface.audioPlayFailed');
});

test('a superseded play request never overwrites the chapter that replaced it', async () => {
  let releaseFirstLookup: (asset: AudioAsset) => void = () => {};
  scenario.chapterAudio = async (translationId, bookId, chapter) => {
    if (chapter === 1) {
      return new Promise<AudioAsset>((resolve) => {
        releaseFirstLookup = resolve;
      });
    }
    return { url: `https://cdn.example/${translationId}/${bookId}/${chapter}.mp3`, duration: 500 };
  };
  const player = mountPlayer();

  const stalled = player.api.playChapter('GEN', 1);
  await player.api.playChapter('GEN', 2);
  releaseFirstLookup({ url: 'https://cdn.example/bsb/GEN/1.mp3', duration: 111 });
  await stalled;

  assert.equal(store().currentChapter, 2);
  assert.equal(store().duration, 500);
  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[0]),
    ['https://cdn.example/bsb/GEN/2.mp3']
  );
});

// ---------------------------------------------------------------------------
// First play of a cold chapter
//
// A chapter nobody has streamed lately can take 4-11 s to first byte on the media
// CDN, long enough for the first request to time out while the edge fetches it; the
// second is served warm. One automatic retry covers that; a second failure is shown.
// ---------------------------------------------------------------------------

const GEN_1 = 'https://cdn.example/bsb/GEN/1.mp3';

/** Lets pending promise chains run until `ready` holds (real macrotask turns). */
const settleUntil = async (ready: () => boolean) => {
  for (let turn = 0; turn < 50 && !ready(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(ready(), 'the awaited load never started');
};

/** Every status and error the store takes on from now on. */
const recordStoreChanges = () => {
  const changes: { status: string; error: string | null }[] = [];
  const unsubscribe = useAudioStore.subscribe((state, previous) => {
    if (state.status !== previous.status || state.error !== previous.error) {
      changes.push({ status: state.status, error: state.error });
    }
  });
  return { changes, unsubscribe };
};

test('a first load that times out is retried once and then plays', async () => {
  scenario.loadScript.set(GEN_1, [{ nativeError: IOS_TIMED_OUT }, 'ok']);
  const player = mountPlayer();
  const { changes, unsubscribe } = recordStoreChanges();

  await player.api.playChapter('GEN', 1);
  unsubscribe();

  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args),
    [
      [GEN_1, 1],
      [GEN_1, 1],
    ]
  );
  assert.equal(store().status, 'playing');
  assert.equal(store().error, null);
  // The listener sees one continuous load, not a failure and a restart.
  assert.deepEqual(
    changes.map((change) => change.status),
    ['loading', 'playing']
  );
  assert.deepEqual(recorded.reports, []);
});

test('the retry of a resumed chapter starts at the same resume point', async () => {
  scenario.loadScript.set(GEN_1, [{ nativeError: IOS_TIMED_OUT }, 'ok']);
  const player = mountPlayer();

  await player.api.playChapterForTranslation('bsb', 'GEN', 1, undefined, {
    startPositionMs: 42_000,
  });

  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[2]),
    [42_000, 42_000]
  );
  assert.equal(store().status, 'playing');
  assert.equal(store().currentPosition, 42_000);
});

test('a load that never settles is abandoned at its deadline and retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  scenario.loadScript.set(GEN_1, ['stall', 'ok']);
  const player = mountPlayer();

  const pending = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  t.mock.timers.tick(29_999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(playerCalls('loadAndPlay').length, 1, 'retried before the deadline');
  assert.equal(store().status, 'loading');
  t.mock.timers.tick(1);
  await pending;

  assert.equal(playerCalls('loadAndPlay').length, 2);
  assert.equal(store().status, 'playing');
  assert.deepEqual(recorded.reports, []);
});

test('two timeouts show the playback failure and report it once', async () => {
  scenario.loadScript.set(GEN_1, [{ nativeError: IOS_TIMED_OUT }, { nativeError: IOS_TIMED_OUT }]);
  const player = mountPlayer();
  const { changes, unsubscribe } = recordStoreChanges();
  recorded.nowPlayingCleared = 0;

  await player.api.playChapter('GEN', 1);
  unsubscribe();

  assert.equal(playerCalls('loadAndPlay').length, 2);
  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
  // The first attempt's native error did not flash the failure before the retry.
  assert.deepEqual(changes, [
    { status: 'loading', error: null },
    { status: 'error', error: 'interface.audioPlayFailed' },
  ]);
  assert.deepEqual(recorded.reports, [
    { source: 'audio.load', message: IOS_TIMED_OUT, reportTimeouts: true },
  ]);
  assert.equal(recorded.nowPlayingCleared, 1);
});

test('two stalled loads stop the abandoned one so it cannot start playing later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  scenario.loadScript.set(GEN_1, ['stall', 'stall']);
  const player = mountPlayer();

  const pending = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  t.mock.timers.tick(30_000);
  await settleUntil(() => playerCalls('loadAndPlay').length === 2);
  const stopsBeforeDeadline = playerCalls('stop').length;
  t.mock.timers.tick(30_000);
  await pending;

  assert.equal(playerCalls('loadAndPlay').length, 2);
  assert.equal(playerCalls('stop').length, stopsBeforeDeadline + 1);
  assert.equal(recorded.player.at(-1)?.method, 'stop');
  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.equal(recorded.reports.length, 1);
  assert.match(recorded.reports[0]?.message ?? '', /did not load within 30 s/);
});

test('a newer tap during the retry cancels it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  scenario.loadScript.set(GEN_1, [{ nativeError: IOS_TIMED_OUT }, 'stall']);
  const player = mountPlayer();

  const first = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 2);
  await player.api.playChapter('GEN', 2);
  recorded.player.length = 0;
  // The superseded retry reaches its deadline after the new chapter took over.
  t.mock.timers.tick(30_000);
  await first;

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
  assert.equal(store().error, null);
  assert.deepEqual(recorded.player, [], 'the old retry touched the new chapter');
  assert.deepEqual(recorded.reports, []);
});

test("a closed reader's stalled load cannot stop what a reopened reader plays", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  scenario.loadScript.set(GEN_1, ['stall', 'ok']);
  const closedReader = mountPlayer();
  const stalled = closedReader.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  closedReader.unmount();

  const reopenedReader = mountPlayer();
  await reopenedReader.api.playChapter('GEN', 2);
  recorded.player.length = 0;
  // The closed reader's load reaches its deadline after the new chapter took over.
  t.mock.timers.tick(30_000);
  await stalled;

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
  assert.equal(store().error, null);
  assert.deepEqual(recorded.player, [], 'the stale load touched the new chapter');
  assert.deepEqual(recorded.reports, []);
});

test('a chapter the server does not have is not retried', async () => {
  const notFound = 'Source error: Response code: 404';
  scenario.loadScript.set(GEN_1, [{ nativeError: notFound }, 'ok']);
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.deepEqual(recorded.reports, [
    { source: 'audio.load', message: notFound, reportTimeouts: true },
  ]);
});

test('a native error after the chapter started playing is shown at once', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  audioPlayerDouble.callbacks.onError?.(IOS_TIMED_OUT);

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------

test('pause freezes playback and tells the lock screen it stopped', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(120_000);

  await player.rerender().pause();

  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('pause').length, 1);
  assert.deepEqual(recorded.nowPlaying.at(-1)?.isPlaying, false);
});

test('pause checkpoints how far through the chapter the listener got', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(120_000);
  recorded.history.length = 0;

  await player.rerender().pause();

  assert.deepEqual(recorded.history, [{ bookId: 'GEN', chapter: 1, progress: 0.2 }]);
});

test('resume re-seeks the loaded player to the live position', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(90_000);
  const api = player.rerender();
  await api.pause();
  recorded.player.length = 0;

  await api.resume();

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [90_000] }]);
  assert.equal(playerCalls('resume').length, 1);
  assert.equal(store().status, 'playing');
});

test('resume after a cold restart falls back to the durable resume anchor', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setPosition(45_000);
  store().setPosition(0);
  useAudioStore.setState({ lastPosition: 45_000 });
  audioPlayerDouble.loaded = false;

  await player.rerender().resume();

  assert.equal(playerCalls('seekTo').length, 0);
  assert.equal(recorded.nowPlaying.at(-1)?.positionMs, 45_000);
});

// After a relaunch the chapter is loaded again from the saved offset. Selecting the
// track zeroed that offset before the load had even started, so a load that failed
// (offline, a stream error) or a second tap while it was slow began the chapter
// again from 0:00, and the saved place was gone for good.
const coldStartAt = (positionMs: number) => {
  useAudioStore.setState({
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'GEN',
    lastPlayedChapter: 1,
    lastPosition: positionMs,
  });
};

test('a resume that fails to load keeps the saved place for the next try', async () => {
  const player = mountPlayer();
  coldStartAt(180_000);
  scenario.failLoadUrls.add('https://cdn.example/bsb/GEN/1.mp3');

  await player.rerender().togglePlayPause();
  assert.equal(store().status, 'error');
  assert.equal(store().lastPosition, 180_000);

  scenario.failLoadUrls.clear();
  recorded.player.length = 0;
  await player.rerender().togglePlayPause();

  assert.equal(loadedStartOffset(), 180_000);
  assert.equal(store().status, 'playing');
});

test('Pause while a resume is still loading preserves its position for a fresh Play', async () => {
  let release!: () => void;
  playerGates.set(
    'load:https://cdn.example/bsb/GEN/1.mp3',
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const player = mountPlayer();
  coldStartAt(180_000);

  const first = player.rerender().togglePlayPause();
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  playerGates.clear();
  const second = player.rerender().togglePlayPause();
  release();
  await Promise.all([first, second]);

  assert.equal(loadedStartOffset(), 180_000);
  assert.equal(store().currentPosition, 180_000);
  assert.equal(store().status, 'paused');

  await player.rerender().togglePlayPause();
  assert.equal(store().status, 'playing');
  assert.equal(store().currentPosition, 180_000);
});

test('stop tears playback down and silences the background bed', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAudioReturnTarget({
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    preferredMode: 'listen',
  });
  recorded.backgroundMusic.length = 0;
  recorded.nowPlayingCleared = 0;

  await player.rerender().stop();

  assert.equal(store().status, 'idle');
  assert.equal(store().currentBookId, null);
  assert.equal(store().audioReturnTarget, null);
  assert.deepEqual(recorded.backgroundMusic.at(-1), { method: 'stop' });
  assert.equal(recorded.nowPlayingCleared, 1);
});

test('togglePlayPause pauses a chapter that is playing', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  await player.rerender().togglePlayPause();

  assert.equal(store().status, 'paused');
});

test('togglePlayPause pauses a pending native load and its completion cannot restart playback', async () => {
  const gate = deferPlayerOperation();
  playerGates.set(`load:${GEN_1}`, gate.promise);
  const player = mountPlayer();
  const starting = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  assert.equal(store().status, 'loading');

  const pausing = player.rerender().togglePlayPause();
  const statusAfterTap = store().status;
  gate.resolve();
  await Promise.all([starting, pausing]);

  assert.equal(statusAfterTap, 'paused', 'the displayed Pause action cancels loading immediately');
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, 1, 'Pause must not start another load');
  assert.ok(playerCalls('pause').length > 0);
});

test('togglePlayPause resumes a loaded chapter that is part way through', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  const api = player.rerender();
  await api.pause();
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('resume').length, 1);
  assert.equal(playerCalls('loadAndPlay').length, 0);
});

test('togglePlayPause reloads the current chapter from its resume anchor when unloaded', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  useAudioStore.setState({ lastPosition: 60_000 });
  audioPlayerDouble.loaded = false;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(loadedStartOffset(), 60_000);
});

// A stream that fails mid-chapter makes expo-av release the sound. iOS says so at
// once; Android only rejects the next command. Either way Play has to load the
// chapter again where it stopped, not fail on the dead sound again and again.
test('Play after the stream failed mid-chapter reloads the chapter where it stopped', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 120_000, durationMillis: DEFAULT_DURATION_MS });
  audioPlayerDouble.loaded = false;
  audioPlayerDouble.callbacks.onError?.('The network connection was lost.');
  assert.equal(store().status, 'error');
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(loadedStartOffset(), 120_000);
  assert.equal(store().status, 'playing');
});

test('Play on a sound the native side released reloads the chapter in one tap', async (t) => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 120_000, durationMillis: DEFAULT_DURATION_MS });
  await player.rerender().pause();
  // Android: the pause went through, then the stream failed and the sound was
  // released without a word. The next command finds out.
  const seekTo = audioPlayerDouble.seekTo;
  t.mock.method(audioPlayerDouble, 'seekTo', async (positionMs: number) => {
    if (!audioPlayerDouble.loaded) return seekTo(positionMs);
    recorded.player.push({ method: 'seekTo', args: [positionMs] });
    audioPlayerDouble.loaded = false;
    audioPlayerDouble.callbacks.onError?.('Player does not exist.');
  });
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(loadedStartOffset(), 120_000);
  assert.equal(store().status, 'playing');
  assert.equal(store().error, null);
});

// On Android a stream that fails while buffering is released without any event, so
// the chapter sat on an endless spinner with the in-app controls disabled. While it
// buffers the player checks that the sound still exists and reports the failure.
test('a chapter stuck buffering on a released stream turns into an error Play can recover', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const native = await startNativeStreamHealthPlayer();
  try {
    native.buffering();
    native.player.rerender();
    assert.equal(store().status, 'loading');
    t.mock.timers.tick(5_000);
    await flushPlayerOperations();
    assert.equal(integrationStatusCalls, 1);
    assert.equal(store().status, 'loading');
    integrationNativeReleased = true;
    t.mock.timers.tick(5_000);
    await flushPlayerOperations();
    assert.equal(integrationStatusCalls, 2);
    assert.equal(store().status, 'error');
    recorded.player.length = 0;
    integrationNativeReleased = false;
    await native.player.rerender().togglePlayPause();
    assert.equal(playerCalls('loadAndPlay').length, 1);
    assert.equal(loadedStartOffset(), 90_000);
    assert.equal(store().error, null);
  } finally {
    await native.cleanup();
  }
});

test('the first load of a chapter is not checked as a stalled stream', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setStatus('loading');
  player.rerender();

  t.mock.timers.tick(15_000);

  assert.deepEqual(playerCalls('verifyLoaded'), []);
});

test('togglePlayPause starts the last played chapter when nothing is loaded', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('web', 'JHN', 3);
  store().resetPlayback();

  await player.rerender().togglePlayPause();

  assert.equal(store().currentTranslationId, 'web');
  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().currentChapter, 3);
});

test('togglePlayPause does nothing when there is no chapter to play', async () => {
  const player = mountPlayer();

  await player.api.togglePlayPause();

  assert.equal(playerCalls('loadAndPlay').length, 0);
  assert.equal(store().status, 'idle');
});

test('seekTo moves both the player and the visible position', async () => {
  const player = mountPlayer();

  await player.api.seekTo(75_000);

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [75_000] }]);
  assert.equal(store().currentPosition, 75_000);
});

test('skipForward jumps ten seconds ahead', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  recorded.player.length = 0;

  await player.rerender().skipForward();

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [40_000] }]);
  assert.equal(store().currentPosition, 40_000);
});

test('skipForward stops at the end of the chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(DEFAULT_DURATION_MS - 2_000);

  await player.rerender().skipForward();

  assert.equal(store().currentPosition, DEFAULT_DURATION_MS);
});

test('skipBackward stops at the start of the chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(4_000);

  await player.rerender().skipBackward();

  assert.equal(store().currentPosition, 0);
});

test('skipping does nothing when no chapter is loaded', async () => {
  const player = mountPlayer();

  await player.api.skipForward();

  assert.equal(playerCalls('seekTo').length, 0);
});

for (const superseded of [true, false]) {
  test(`a native seek rejection ${superseded ? 'cannot fail a newer successful seek' : 'still reports the current seek error'}`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('GEN', 1);
    const { audioPlayer: realPlayer } = await import('../services/audio/audioPlayer');
    const originalSeek = audioPlayerDouble.seekTo;
    realPlayer.setCallbacks({ ...audioPlayerDouble.callbacks });
    try {
      await realPlayer.loadAndPlay('https://audio.test/gen1.mp3');
      audioPlayerDouble.seekTo = (positionMs) => realPlayer.seekTo(positionMs);
      let rejectSeek!: (error: Error) => void;
      integrationSeekGate = new Promise((_resolve, reject) => {
        rejectSeek = reject;
      });
      const earlier = player.api.seekTo(20_000);
      integrationSeekGate = null;
      if (superseded) {
        await player.api.seekTo(45_000);
        assert.equal(store().currentPosition, 45_000);
      }
      rejectSeek(new Error('native seek rejected'));
      await earlier;
      assert.equal(store().status, superseded ? 'playing' : 'error');
      assert.equal(store().error, superseded ? null : 'interface.audioPlayFailed');
      if (superseded) assert.equal(store().currentPosition, 45_000);
    } finally {
      integrationSeekGate = null;
      audioPlayerDouble.seekTo = originalSeek;
      realPlayer.setCallbacks({});
      await realPlayer.stop();
    }
  });
}

test('changePlaybackRate applies the speed to the player and remembers it', async () => {
  const player = mountPlayer();

  await player.api.changePlaybackRate(1.5);

  assert.deepEqual(playerCalls('setRate'), [{ method: 'setRate', args: [1.5] }]);
  assert.equal(store().playbackRate, 1.5);
});

test('a chapter started after a rate change is loaded at that rate', async () => {
  const player = mountPlayer();
  await player.api.changePlaybackRate(1.25);

  await player.rerender().playChapter('GEN', 1);

  assert.equal(playerCalls('loadAndPlay').at(-1)?.args[1], 1.25);
});

test('a new chapter uses the speed selected while the old native rate change is pending', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('rate:1.5', gate.promise);
  const changing = player.api.changePlaybackRate(1.5);
  await player.api.playChapter('GEN', 2);
  gate.resolve();
  await changing;
  assert.equal(store().playbackRate, 1.5);
  assert.equal(playerCalls('loadAndPlay').at(-1)?.args[1], 1.5);
});

test('an older native rate completion cannot overwrite a newer speed selection', async () => {
  const player = mountPlayer();
  const gate = deferPlayerOperation();
  playerGates.set('rate:1.5', gate.promise);
  const earlier = player.api.changePlaybackRate(1.5);
  await player.api.changePlaybackRate(1.25);
  gate.resolve();
  await earlier;
  assert.equal(store().playbackRate, 1.25);
});

// Resolving a chapter can take a manifest lookup and the load itself a few seconds on
// a slow network. A speed picked in that window was dropped by the not-yet-loaded
// player, so the chapter played at the old speed while the control showed the new one.
test('a speed change while the chapter is still resolving is used for that chapter', async () => {
  let release!: () => void;
  const resolving = new Promise<void>((resolve) => {
    release = resolve;
  });
  scenario.chapterAudio = async (translationId, bookId, chapter) => {
    await resolving;
    return defaultChapterAudio(translationId, bookId, chapter);
  };
  const player = mountPlayer();

  const starting = player.api.playChapter('GEN', 1);
  await Promise.resolve();
  await player.rerender().changePlaybackRate(1.5);
  release();
  await starting;

  assert.equal(playerCalls('loadAndPlay').at(-1)?.args[1], 1.5);
  assert.equal(store().playbackRate, 1.5);
});

test('addToQueue queues a chapter of the hook translation', () => {
  const player = mountPlayer('web');

  player.api.addToQueue('PSA', 23);

  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    ['web:PSA:23']
  );
});

test('removeFromQueue drops the chapter from the queue', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const api = player.rerender();
  api.addToQueue('GEN', 2);

  player.rerender().removeFromQueue('bsb:GEN:2');

  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    ['bsb:GEN:1']
  );
});

test('clearQueue empties the queue', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  player.rerender().clearQueue();

  assert.deepEqual(store().queue, []);
});

test('togglePlayer flips the expanded player open and closed', () => {
  const player = mountPlayer();

  player.api.togglePlayer();
  assert.equal(store().showPlayer, true);

  player.rerender().togglePlayer();
  assert.equal(store().showPlayer, false);
});

test('cycleRepeatMode steps through the repeat modes', () => {
  const player = mountPlayer();

  player.api.cycleRepeatMode();

  assert.notEqual(store().repeatMode, 'off');
});

test('startSleepTimer stores the chosen length', () => {
  const player = mountPlayer();

  player.api.startSleepTimer(30);

  assert.equal(store().sleepTimerMinutes, 30);
});

// ---------------------------------------------------------------------------
// Transport subscription
// ---------------------------------------------------------------------------

const transportSelector = (): StoreSelector => {
  shallowSelectors.length = 0;
  mountPlayer();
  const selector = shallowSelectors.at(-1);
  assert.ok(selector, 'useAudioPlayer should subscribe through useShallow');
  return selector;
};

test('the transport subscription ignores 240 position ticks and twelve resume checkpoints', () => {
  const select = transportSelector();
  useAudioStore.setState({ status: 'playing', duration: 90_000 });
  let previous = select(useAudioStore.getState());
  let updates = 0;

  for (let position = 250; position <= 60_000; position += 250) {
    useAudioStore.setState(
      position % 5000 === 0
        ? { currentPosition: position, lastPosition: position }
        : { currentPosition: position }
    );
    const next = select(useAudioStore.getState());
    if (!shallow(previous, next)) updates += 1;
    previous = next;
  }

  assert.equal(updates, 0);
  assert.equal(store().currentPosition, 60_000);
  assert.equal(store().lastPosition, 60_000);
});

test('the hook exposes no live position or duration; useAudioPosition owns those', () => {
  const { api } = mountPlayer();

  assert.equal('currentPosition' in api, false);
  assert.equal('duration' in api, false);
});

// The hook does not re-render on position ticks, so every action that needs the position
// must read it from the store when it runs, not from the render that created it.
test('actions read the live position even through controls from an earlier render', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const controls = player.rerender();
  recorded.history.length = 0;
  recorded.player.length = 0;

  store().setPosition(30_000);
  await controls.skipForward();
  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [40_000] }]);

  store().setPosition(120_000);
  await controls.pause();
  assert.deepEqual(recorded.history.at(-1), { bookId: 'GEN', chapter: 1, progress: 0.2 });

  // Status is part of the render, so toggle from a fresh one; the position still comes from
  // the store because the hook never subscribes to it.
  await player.rerender().togglePlayPause();
  assert.equal(playerCalls('resume').length, 1, 'a part-way chapter resumes rather than reloads');

  store().setPosition(150_000);
  await controls.playChapter('GEN', 2);
  assert.deepEqual(recorded.history.at(-2), { bookId: 'GEN', chapter: 1, progress: 0.25 });
});

test('stop checkpoints the live position even through controls from an earlier render', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const controls = player.rerender();
  recorded.history.length = 0;

  store().setPosition(300_000);
  await controls.stop();

  assert.deepEqual(recorded.history, [{ bookId: 'GEN', chapter: 1, progress: 0.5 }]);
});

test('the transport subscription still sees status, track and playback settings changes', () => {
  const select = transportSelector();
  const changes = {
    status: 'paused',
    currentBookId: 'JHN',
    currentChapter: 4,
    currentTranslationId: 'web',
    playbackRate: 1.5,
    repeatMode: 'chapter',
    backgroundMusicChoice: 'piano',
    sleepTimerEndTime: 60_000,
  } as const;

  for (const [key, value] of Object.entries(changes)) {
    const before = select(useAudioStore.getState());
    useAudioStore.setState({ [key]: value });
    assert.equal(shallow(before, select(useAudioStore.getState())), false, key);
  }
});

// ---------------------------------------------------------------------------
// Chapter navigation
// ---------------------------------------------------------------------------

test('nextChapter follows the queue without a pinned session', async () => {
  const player = mountPlayer();
  store().addToQueue('bsb', 'GEN', 1);
  store().addToQueue('web', 'PSA', 23);
  store().setQueueIndex(0);

  const result = await player.rerender().nextChapter();

  assert.deepEqual(result, { bookId: 'PSA', chapter: 23 });
  assert.equal(store().currentTranslationId, 'web');
  assert.equal(store().queueIndex, 1);
});

test('nextChapter crosses into the following book at the end of one', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 50);

  const result = await player.rerender().nextChapter();

  assert.deepEqual(result, { bookId: 'EXO', chapter: 1 });
  assert.equal(store().currentBookId, 'EXO');
  assert.equal(store().currentChapter, 1);
});

test('nextChapter stops at the end of the Bible', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'REV', 22);

  const result = await player.rerender().nextChapter();

  assert.equal(result, null);
  assert.equal(store().currentChapter, 22);
});

test('nextChapter walks a pinned plan session in order', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'PSA', chapter: 23 },
  ]);

  const result = await player.rerender().nextChapter();

  assert.deepEqual(result, { bookId: 'PSA', chapter: 23 });
});

test('nextChapter refuses to walk out of a pinned plan session', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setPlaybackSequence([{ bookId: 'GEN', chapter: 1 }]);

  const result = await player.rerender().nextChapter();

  assert.equal(result, null);
  assert.equal(store().currentChapter, 1);
});

test('previousChapter steps back through the queue', async () => {
  const player = mountPlayer();
  store().addToQueue('bsb', 'GEN', 1);
  store().addToQueue('bsb', 'GEN', 2);
  store().setQueueIndex(1);

  const result = await player.rerender().previousChapter();

  assert.deepEqual(result, { bookId: 'GEN', chapter: 1 });
  assert.equal(store().queueIndex, 0);
});

test('previousChapter crosses back into the previous book', async () => {
  const player = mountPlayer();
  await player.api.playChapter('EXO', 1);

  const result = await player.rerender().previousChapter();

  assert.deepEqual(result, { bookId: 'GEN', chapter: 50 });
});

test('previousChapter stops at the start of the Bible', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);

  const result = await player.rerender().previousChapter();

  assert.equal(result, null);
});

test('previousChapter walks a pinned plan session backwards', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'PSA', 23);
  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'PSA', chapter: 23 },
  ]);

  const result = await player.rerender().previousChapter();

  assert.deepEqual(result, { bookId: 'GEN', chapter: 1 });
});

test('previousChapter refuses to walk out of a pinned plan session', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setPlaybackSequence([{ bookId: 'GEN', chapter: 1 }]);

  const result = await player.rerender().previousChapter();

  assert.equal(result, null);
});

for (const status of ['playing', 'paused'] as const) {
  for (const direction of ['nextChapter', 'previousChapter'] as const) {
    for (const boundary of [false, true]) {
      test(`${status} ${direction} ${boundary ? 'holds the pinned boundary' : 'follows the pinned session'} over a retained queue`, async () => {
        const player = mountPlayer();
        const first = { bookId: 'GEN', chapter: 1 };
        const last = { bookId: 'PSA', chapter: 23 };
        const sequence = [first, last];
        const forwards = direction === 'nextChapter';
        const current = forwards === boundary ? last : first;
        const target = forwards ? last : first;
        store().addToQueue('web', 'REV', 22);
        store().addToQueue('bsb', current.bookId, current.chapter);
        store().addToQueue('web', 'REV', 1);
        store().setPlaybackSequence(sequence);
        await player.rerender().playChapter(current.bookId, current.chapter);
        if (status === 'paused') await player.rerender().pause();
        const queue = [...store().queue];
        const queueIndex = store().queueIndex;
        recorded.player.length = 0;

        const result = await player.rerender()[direction]();

        assert.deepEqual(result, boundary ? null : target);
        assert.equal(store().currentBookId, boundary ? current.bookId : target.bookId);
        assert.equal(store().currentChapter, boundary ? current.chapter : target.chapter);
        assert.equal(store().currentTranslationId, 'bsb');
        assert.equal(store().status, status);
        assert.deepEqual(store().playbackSequence, sequence);
        if (boundary) {
          assert.deepEqual(store().queue, queue);
          assert.equal(store().queueIndex, queueIndex);
          assert.equal(recorded.player.length, 0, 'a pinned boundary issues no transport command');
        } else {
          assert.equal(playerCalls('loadAndPlay').length, status === 'playing' ? 1 : 0);
          // Selecting a track outside the queue retains the existing store
          // contract: replace the queue with that target and reset its index.
          assert.deepEqual(
            store().queue.map(({ translationId, bookId, chapter }) => ({
              translationId,
              bookId,
              chapter,
            })),
            [{ translationId: 'bsb', ...target }]
          );
          assert.equal(store().queueIndex, 0);
        }
      });
    }
  }
}

for (const direction of ['nextChapter', 'previousChapter'] as const) {
  test(`${direction} preserves queue entries when the pinned target is already queued`, async () => {
    const player = mountPlayer();
    const first = { bookId: 'GEN', chapter: 1 };
    const last = { bookId: 'PSA', chapter: 23 };
    const current = direction === 'nextChapter' ? first : last;
    const target = direction === 'nextChapter' ? last : first;
    store().addToQueue('bsb', target.bookId, target.chapter);
    store().addToQueue('web', 'REV', 22);
    store().addToQueue('bsb', current.bookId, current.chapter);
    store().addToQueue('web', 'REV', 1);
    store().setPlaybackSequence([first, last]);
    await player.rerender().playChapter(current.bookId, current.chapter);
    const queue = [...store().queue];
    assert.equal(store().queueIndex, 2);

    assert.deepEqual(await player.rerender()[direction](), target);
    assert.deepEqual(store().queue, queue);
    assert.equal(store().queueIndex, 0, 'queue sync selects the actual pinned target');
    assert.deepEqual(store().playbackSequence, [first, last]);
  });
}

test('navigating away from a paused chapter selects it without sounding', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setStatus('paused');
  recorded.player.length = 0;

  await player.rerender().nextChapter();

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, 0);
  assert.equal(playerCalls('stop').length, 1);
});

test('switching the translation of a paused chapter re-targets it without sounding', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  await player.rerender().pause();
  recorded.player.length = 0;
  recorded.nowPlayingCleared = 0;
  recorded.nowPlaying.length = 0;

  await player.rerender().navigateChapterForTranslation('web', 'GEN', 1);

  assert.equal(playerCalls('loadAndPlay').length, 0);
  assert.equal(playerCalls('resume').length, 0);
  assert.equal(store().status, 'paused');
  assert.equal(store().currentTranslationId, 'web');
  assert.equal(store().currentChapter, 1);
  assert.equal(recorded.nowPlayingCleared, 0);
  assert.equal(recorded.nowPlaying.at(-1)?.translationId, 'web');
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);

  // The next Play is the new translation, not the old one.
  await player.rerender().togglePlayPause();
  assert.deepEqual(playerCalls('loadAndPlay'), [
    { method: 'loadAndPlay', args: ['https://cdn.example/web/GEN/1.mp3', 1] },
  ]);
});

test('switching the translation of a playing chapter plays the new translation', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  recorded.player.length = 0;

  await player.rerender().navigateChapterForTranslation('web', 'GEN', 1);

  assert.deepEqual(playerCalls('loadAndPlay'), [
    { method: 'loadAndPlay', args: ['https://cdn.example/web/GEN/1.mp3', 1] },
  ]);
  assert.equal(store().status, 'playing');
  assert.equal(store().currentTranslationId, 'web');
});

test('navigating away from an idle chapter leaves the player idle', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  const controls = player.rerender();
  recorded.nowPlayingCleared = 0;
  recorded.nowPlaying.length = 0;

  await controls.nextChapter();

  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 2);
  assert.equal(recorded.nowPlayingCleared, 1);
  assert.deepEqual(recorded.nowPlaying, []);
});

for (const command of ['next', 'previous'] as const) {
  test(`Android paused remote ${command} preserves controls and publishes the new chapter after reader unmount`, async (t) => {
    rn.Platform.OS = 'android';
    t.after(() => {
      rn.Platform.OS = 'ios';
    });
    const player = mountPlayer();
    await player.api.playChapter('JHN', 3);
    await player.rerender().pause();
    player.unmount();
    rn.AppState.emit('background');
    recorded.nowPlayingCleared = 0;
    recorded.nowPlaying.length = 0;
    const loadsBefore = playerCalls('loadAndPlay').length;

    await remoteCommandListener?.({ command });

    const chapter = command === 'next' ? 4 : 2;
    assert.equal(store().status, 'paused');
    assert.equal(store().currentChapter, chapter);
    assert.equal(playerCalls('loadAndPlay').length, loadsBefore, 'navigation stays silent');
    assert.equal(recorded.nowPlayingCleared, 0, 'the paused native transport stays active');
    assert.equal(recorded.nowPlaying.at(-1)?.bookId, 'JHN');
    assert.equal(recorded.nowPlaying.at(-1)?.chapter, chapter);
    assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);
    assert.equal(recorded.nowPlaying.at(-1)?.positionMs, 0);
    assert.equal(recorded.nowPlaying.at(-1)?.durationMs, 0);
  });
}

test('a superseded paused chapter navigation cannot replace newer playing metadata', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);
  await player.rerender().pause();
  let release!: () => void;
  playerGates.set(
    'stop',
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const navigation = player.api.navigateChapterForTranslation('bsb', 'JHN', 4);
  playerGates.delete('stop');
  await player.api.playChapter('JHN', 5);
  const publishedBeforeRelease = recorded.nowPlaying.length;

  release();
  await navigation;

  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'playing');
  assert.equal(recorded.nowPlaying.length, publishedBeforeRelease);
  assert.equal(recorded.nowPlaying.at(-1)?.chapter, 5);
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, true);
});

test('navigating away from a playing chapter starts the new one immediately', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  await player.rerender().nextChapter();

  assert.equal(store().status, 'playing');
  assert.equal(store().currentChapter, 2);
});

test('a delayed next-chapter lookup cannot replace a chapter the listener picked meanwhile', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const navigation = player.rerender().nextChapter();

  await player.api.playChapter('JHN', 3);
  const loadsBeforeRelease = playerCalls('loadAndPlay').length;
  gate.resolve();
  const result = await navigation;

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().currentChapter, 3);
  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('loadAndPlay').length, loadsBeforeRelease);
  assert.equal(result, null);
});

for (const command of ['pause', 'stop'] as const) {
  test(`a delayed chapter lookup leaves a newer ${command} in control`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('GEN', 1);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    const navigation = player.rerender().nextChapter();

    await player.api[command]();
    const trackAfterCommand = {
      bookId: store().currentBookId,
      chapter: store().currentChapter,
      status: store().status,
    };
    const loadsBeforeRelease = playerCalls('loadAndPlay').length;
    gate.resolve();

    assert.equal(await navigation, null);
    assert.deepEqual(
      { bookId: store().currentBookId, chapter: store().currentChapter, status: store().status },
      trackAfterCommand
    );
    assert.equal(playerCalls('loadAndPlay').length, loadsBeforeRelease);
  });
}

for (const olderResolvesFirst of [true, false]) {
  test(`the latest chapter step wins when the ${olderResolvesFirst ? 'older' : 'newer'} lookup resolves first`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('JHN', 3);
    const nextGate = deferPlayerOperation();
    scenario.coverageGate = nextGate.promise;
    const next = player.rerender().nextChapter();
    const previousGate = deferPlayerOperation();
    scenario.coverageGate = previousGate.promise;
    const previous = player.api.previousChapter();

    if (olderResolvesFirst) {
      nextGate.resolve();
      assert.equal(await next, null);
      assert.equal(store().currentChapter, 3);
      previousGate.resolve();
    } else {
      previousGate.resolve();
      await previous;
      nextGate.resolve();
      assert.equal(await next, null);
    }

    assert.deepEqual(await previous, { bookId: 'JHN', chapter: 2 });
    assert.equal(store().currentChapter, 2);
    assert.equal(store().status, 'playing');
  });
}

test('a step with no covered neighbor does not cancel the chapter currently loading', async () => {
  scenario.contentSummary = { audioChapters: { GEN: [1] } };
  const gate = deferPlayerOperation();
  playerGates.set(`load:${GEN_1}`, gate.promise);
  const player = mountPlayer();
  const loading = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);

  const result = await player.rerender().nextChapter();
  gate.resolve();
  await loading;

  assert.equal(result, null);
  assert.equal(store().currentChapter, 1);
  assert.equal(store().status, 'playing');
});

for (const mode of ['linear', 'queue', 'sequence'] as const) {
  test(`a ${mode} step superseded during native stop returns no stale reader target`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('JHN', 3);
    await player.rerender().pause();
    if (mode === 'queue') {
      store().clearQueue();
      store().addToQueue('bsb', 'JHN', 3);
      store().addToQueue('bsb', 'JHN', 4);
      store().syncQueueToTrack('bsb', 'JHN', 3);
    }
    if (mode === 'sequence') {
      store().setPlaybackSequence([3, 4].map((chapter) => ({ bookId: 'JHN', chapter })));
    }
    const gate = deferPlayerOperation();
    playerGates.set('stop', gate.promise);
    const stopsBeforeNavigation = playerCalls('stop').length;
    const navigation = player.rerender().nextChapter();
    await settleUntil(() => playerCalls('stop').length > stopsBeforeNavigation);

    playerGates.delete('stop');
    await player.api.playChapter('JHN', 5);
    gate.resolve();
    const result = await navigation;

    assert.equal(store().currentChapter, 5);
    assert.equal(store().status, 'playing');
    assert.equal(result, null);
  });
}

test('a step superseded while loading returns no stale reader target', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);
  const gate = deferPlayerOperation();
  playerGates.set('load:https://cdn.example/bsb/JHN/4.mp3', gate.promise);
  const navigation = player.rerender().nextChapter();
  await settleUntil(() => store().currentChapter === 4 && playerCalls('loadAndPlay').length === 2);

  await player.api.playChapter('JHN', 5);
  gate.resolve();

  assert.equal(await navigation, null);
  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'playing');
});

test('navigation skips chapters a sparse audio set does not cover', async () => {
  scenario.contentSummary = { audioChapters: { GEN: [1, 5], PSA: [117] } };
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);

  const result = await player.rerender().nextChapter();

  assert.deepEqual(result, { bookId: 'GEN', chapter: 5 });
});

test('navigation crosses to the next covered book of a sparse audio set', async () => {
  scenario.contentSummary = { audioChapters: { GEN: [1, 5], PSA: [117] } };
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 5);

  const result = await player.rerender().nextChapter();

  assert.deepEqual(result, { bookId: 'PSA', chapter: 117 });
});

test('navigation stops at the last chapter a sparse audio set covers', async () => {
  scenario.contentSummary = { audioChapters: { GEN: [1, 5], PSA: [117] } };
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'PSA', 117);

  assert.equal(await player.rerender().nextChapter(), null);
});

test('navigating away from a chapter outside the plan session releases the pin', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setPlaybackSequence([
    { bookId: 'PSA', chapter: 1 },
    { bookId: 'PSA', chapter: 2 },
  ]);

  await player.rerender().nextChapter();

  assert.deepEqual(store().playbackSequence, []);
});

const transportSnapshot = () => ({
  currentChapter: store().currentChapter,
  status: store().status,
  currentPosition: store().currentPosition,
  lastPosition: store().lastPosition,
  duration: store().duration,
});

// Play, pause, then navigate: the target is selected unloaded and only sounds
// once the listener presses play, whichever route (linear, queue, plan
// session) the navigation takes.
for (const direction of ['nextChapter', 'previousChapter'] as const) {
  for (const mode of ['linear', 'queue', 'sequence'] as const) {
    test(`${direction} from a paused chapter selects the ${mode} target silently until play`, async () => {
      const player = mountPlayer();
      await player.api.playChapter('JHN', 3);
      await player.rerender().pause();
      if (mode === 'queue') {
        store().clearQueue();
        store().addToQueue('bsb', 'JHN', 2);
        store().addToQueue('bsb', 'JHN', 3);
        store().addToQueue('bsb', 'JHN', 4);
        store().syncQueueToTrack('bsb', 'JHN', 3);
      }
      if (mode === 'sequence') {
        store().setPlaybackSequence([2, 3, 4].map((chapter) => ({ bookId: 'JHN', chapter })));
      }
      const targetChapter = direction === 'nextChapter' ? 4 : 2;
      const lookupsBefore = recorded.audioLookups.length;
      const loadsBefore = playerCalls('loadAndPlay').length;

      const target = await player.rerender()[direction]();

      assert.equal(target?.chapter, targetChapter);
      assert.deepEqual(transportSnapshot(), {
        currentChapter: targetChapter,
        status: 'paused',
        currentPosition: 0,
        lastPosition: 0,
        duration: 0,
      });
      assert.equal(recorded.audioLookups.length, lookupsBefore);
      assert.equal(playerCalls('loadAndPlay').length, loadsBefore);

      await player.rerender().togglePlayPause();

      assert.equal(store().status, 'playing');
      assert.equal(store().currentChapter, targetChapter);
      assert.equal(playerCalls('loadAndPlay').length, loadsBefore + 1);
    });
  }
}

test('previousChapter from a playing chapter starts the new one immediately', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);

  await player.rerender().previousChapter();

  assert.equal(store().status, 'playing');
  assert.equal(store().currentChapter, 2);
  assert.equal(playerCalls('loadAndPlay').length, 2);
});

test('pause, next, next, play starts only the last selected chapter from zero', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);
  store().setPosition(30_000);
  await player.rerender().pause();

  await player.rerender().nextChapter();
  await player.rerender().nextChapter();

  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'paused');
  assert.equal(store().lastPosition, 0);
  assert.equal(recorded.audioLookups.length, 1);
  assert.equal(playerCalls('loadAndPlay').length, 1);

  await player.rerender().togglePlayPause();

  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'playing');
  assert.equal(store().currentPosition, 0);
  assert.deepEqual(playerCalls('seekTo'), []);
  assert.deepEqual(recorded.audioLookups.at(-1), {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 5,
  });
  assert.equal(recorded.audioLookups.length, 2);
  assert.equal(playerCalls('loadAndPlay').length, 2);
});

test('manual navigation observes a pause made after the controls last rendered', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);
  const controls = player.rerender();

  await controls.pause();
  await controls.nextChapter();

  assert.equal(store().currentChapter, 4);
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

test('paused navigation does not escape a pinned plan session boundary', async () => {
  const player = mountPlayer();
  await player.api.playChapter('JHN', 3);
  await player.rerender().pause();
  store().setPlaybackSequence([{ bookId: 'JHN', chapter: 3 }]);

  assert.equal(await player.rerender().nextChapter(), null);

  assert.equal(store().currentChapter, 3);
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

// ---------------------------------------------------------------------------
// Playback completion
// ---------------------------------------------------------------------------

test('finishing a chapter advances to the next one', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();

  await finishPlayback();

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
});

const savedReadingPosition = () => ({
  bookId: bibleState.currentBook,
  chapter: bibleState.currentChapter,
});

test('finishing a chapter carries the saved reading position of a listener following along', async () => {
  bibleState.applySyncedReadingPosition({ bookId: 'GEN', chapter: 5 });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 5);
  player.rerender();

  await finishPlayback();
  await finishPlayback();

  assert.equal(store().currentChapter, 7);
  assert.deepEqual(savedReadingPosition(), { bookId: 'GEN', chapter: 7 });
});

test('chapters the listener picks do not move the saved reading position', async () => {
  bibleState.applySyncedReadingPosition({ bookId: 'GEN', chapter: 5 });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 5);

  await player.rerender().playChapter('GEN', 10);
  await player.rerender().nextChapter();
  await player.rerender().previousChapter();
  await player.rerender().previousChapter();

  assert.equal(store().currentChapter, 9);
  assert.deepEqual(savedReadingPosition(), { bookId: 'GEN', chapter: 5 });
});

test('finishing a chapter with auto-advance off stops playback', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  recorded.nowPlayingCleared = 0;

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.equal(recorded.nowPlayingCleared, 1);
});

// The native player reports the end of a chapter as a last playing progress tick,
// a stopped state, then the finish. The decoded length can fall a little short of the
// catalog duration, so the last position need not equal the stored duration.
const reachChapterEnd = async (positionMillis: number) => {
  emitStatus({ positionMillis, durationMillis: positionMillis, isPlaying: true });
  emitStatus({ positionMillis, durationMillis: positionMillis, isPlaying: false });
  await finishPlayback();
};

test('play after the final chapter finished starts it again from the beginning', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await reachChapterEnd(DEFAULT_DURATION_MS - 200);
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('resume').length, 0);
  assert.deepEqual(playerCalls('loadAndPlay'), [
    { method: 'loadAndPlay', args: ['https://cdn.example/bsb/GEN/1.mp3', 1] },
  ]);
  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(store().status, 'playing');
});

test('play after a finished chapter never seeks to its end', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await reachChapterEnd(DEFAULT_DURATION_MS);
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

test('the remote play command after the final chapter finished starts it from the beginning', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await reachChapterEnd(DEFAULT_DURATION_MS - 200);
  player.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'play' });

  assert.equal(playerCalls('resume').length, 0);
  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

test('a finished chapter leaves no resume point for the next launch', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await reachChapterEnd(DEFAULT_DURATION_MS);

  assert.equal(store().lastPosition, 0);

  // Relaunch: nothing is loaded and only the persisted anchor survives.
  audioPlayerDouble.loaded = false;
  store().resetPlayback();
  recorded.player.length = 0;
  await player.rerender().togglePlayPause();

  assert.deepEqual(playerCalls('seekTo'), []);
  assert.equal(store().currentBookId, 'GEN');
  assert.equal(store().currentChapter, 1);
});

test('post-finish native statuses cannot revive playback or restore the completed resume offset', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  const { audioPlayer: realPlayer } = await import('../services/audio/audioPlayer');
  let finished: Promise<void> | undefined;
  realPlayer.setCallbacks({
    ...audioPlayerDouble.callbacks,
    onPlaybackFinished: () => {
      finished = finishPlayback();
    },
  });
  try {
    await realPlayer.loadAndPlay('https://cdn.example/bsb/GEN/1.mp3');
    nativeStatusListener?.({
      ...integrationNativeStatus,
      positionMillis: DEFAULT_DURATION_MS,
      didJustFinish: true,
    });
    await finished;
    assert.equal(store().status, 'idle');
    assert.equal(store().lastPosition, 0);
    const completedCount = recorded.listened.length;
    nativeStatusListener?.({ ...integrationNativeStatus, positionMillis: DEFAULT_DURATION_MS });
    assert.equal(store().status, 'idle');
    assert.equal(store().lastPosition, 0);
    nativeStatusListener?.({
      ...integrationNativeStatus,
      positionMillis: DEFAULT_DURATION_MS,
      didJustFinish: true,
    });
    assert.equal(store().status, 'idle');
    assert.equal(store().lastPosition, 0);
    assert.equal(recorded.listened.length, completedCount);

    audioPlayerDouble.loaded = false;
    store().resetPlayback();
    recorded.player.length = 0;
    await player.rerender().togglePlayPause();
    assert.equal(loadedStartOffset(), 0);
  } finally {
    realPlayer.setCallbacks({});
    await realPlayer.stop();
  }
});

for (const command of ['seek', 'skip'] as const) {
  test(`completed chapter ${command} stays paused through interruption end until explicit Play`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('GEN', 1);
    store().setAutoAdvanceChapter(false);
    const { audioPlayer: realPlayer } = await import('../services/audio/audioPlayer');
    let finished: Promise<void> | undefined;
    realPlayer.setCallbacks({
      ...audioPlayerDouble.callbacks,
      onPlaybackFinished: () => {
        finished = finishPlayback();
      },
    });
    const originalSeek = audioPlayerDouble.seekTo;
    audioPlayerDouble.seekTo = (positionMs) => realPlayer.seekTo(positionMs);
    try {
      await realPlayer.loadAndPlay('https://cdn.example/bsb/GEN/1.mp3');
      nativeStatusListener?.({
        ...integrationNativeStatus,
        positionMillis: DEFAULT_DURATION_MS,
        didJustFinish: true,
      });
      await finished;
      assert.equal(store().status, 'idle');
      const positionMs = command === 'seek' ? 31_000 : DEFAULT_DURATION_MS - 10_000;
      if (command === 'seek') await player.api.seekTo(positionMs);
      else {
        player.unmount();
        await remoteCommandListener?.({ command: 'seek-backward' });
      }
      assert.equal(store().status, 'paused');
      assert.equal(store().currentPosition, positionMs);
      assert.equal(store().lastPosition, positionMs);
      nativeStatusListener?.({ ...integrationNativeStatus, positionMillis: positionMs });
      recorded.player.length = 0;
      await remoteCommandListener?.({ command: 'interruption-ended' });
      assert.equal(store().status, 'paused');
      assert.equal(playerCalls('resume').length, 0);

      await remoteCommandListener?.({ command: 'play' });
      assert.equal(store().status, 'playing');
      assert.equal(playerCalls('resume').length, 1);
      // Explicit Play clears terminal intent: a later genuine OS pause may resume.
      emitStatus({
        isPlaying: false,
        positionMillis: positionMs,
        durationMillis: DEFAULT_DURATION_MS,
      });
      recorded.player.length = 0;
      await remoteCommandListener?.({ command: 'interruption-ended' });
      assert.equal(store().status, 'playing');
      assert.equal(playerCalls('resume').length, 1);
    } finally {
      audioPlayerDouble.seekTo = originalSeek;
      realPlayer.setCallbacks({});
      await realPlayer.stop();
    }
  });
}

test('finishing a chapter in chapter-repeat mode replays it', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setRepeatMode('chapter');
  player.rerender();
  recorded.player.length = 0;

  await finishPlayback();

  assert.equal(store().currentChapter, 1);
  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[0]),
    ['https://cdn.example/bsb/GEN/1.mp3']
  );
});

test('finishing the last chapter in book-repeat mode wraps to chapter one', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 50);
  store().setRepeatMode('book');
  player.rerender();

  await finishPlayback();

  assert.equal(store().currentBookId, 'GEN');
  assert.equal(store().currentChapter, 1);
});

test('finishing plays the next queued chapter before any adjacent one', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().addToQueue('web', 'PSA', 23);
  player.rerender();

  await finishPlayback();

  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.equal(store().currentTranslationId, 'web');
});

test('finishing inside a plan session plays the next session chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'PSA', chapter: 23 },
  ]);
  player.rerender();

  await finishPlayback();

  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
});

test('finishing the last chapter of a plan session ends playback', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPlaybackSequence([{ bookId: 'GEN', chapter: 1 }]);
  store().setAudioReturnTarget({
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    preferredMode: 'read',
  });
  player.rerender();
  recorded.nowPlayingCleared = 0;

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.equal(store().audioReturnTarget, null);
  assert.equal(recorded.nowPlayingCleared, 1);
});

test('finishing at the end of the Bible stops playback', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'REV', 22);
  store().setDuration(1_000);
  player.rerender();

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.equal(playerCalls('loadAndPlay').length, 0);
});

test('finishing an unknown book stops playback', async () => {
  const player = mountPlayer();
  useAudioStore.setState({
    currentTranslationId: 'bsb',
    currentBookId: 'NOT-A-BOOK',
    currentChapter: 1,
    duration: 1_000,
  });
  player.rerender();

  await finishPlayback();

  assert.equal(store().status, 'idle');
});

test('finishing records the completed listen for the reading ledger', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.history.length = 0;

  await finishPlayback();

  assert.deepEqual(recorded.history[0], { bookId: 'GEN', chapter: 1, progress: 1 });
  assert.deepEqual(recorded.listened, [{ bookId: 'GEN', chapter: 1 }]);
});

test('finishing the last chapter of a book continues into the next book', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 50);
  player.rerender();

  await finishPlayback();

  assert.equal(store().currentBookId, 'EXO');
  assert.equal(store().currentChapter, 1);
  assert.equal(store().status, 'playing');
});

test('finishing the final chapter still records the completed listen', async () => {
  const player = mountPlayer();
  await player.api.playChapter('REV', 22);
  player.rerender();
  recorded.history.length = 0;

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.deepEqual(recorded.history, [{ bookId: 'REV', chapter: 22, progress: 1 }]);
});

test('finishing reports the completed chapter to analytics', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.analytics.length = 0;

  await finishPlayback();

  assert.deepEqual(recorded.analytics.at(0), {
    name: 'audio_completed',
    properties: {
      duration_ms: DEFAULT_DURATION_MS,
      book: 'GEN',
      chapter: 1,
      translation_id: 'bsb',
    },
  });
});

test('finishing with no chapter loaded simply stops', async () => {
  mountPlayer();

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.equal(recorded.listened.length, 0);
});

// A daily proverb or rhythm pins a playback session. Global repeat and queued
// audio must never carry playback past the session's last chapter.
for (const repeatMode of ['off', 'chapter', 'book'] as const) {
  for (const queued of [false, true]) {
    test(`a one-chapter session ends after its chapter with repeat ${repeatMode}${queued ? ' and a queued chapter' : ''}`, async () => {
      const player = mountPlayer();
      await player.api.playChapter('PRO', 7);
      store().setPlaybackSequence([{ bookId: 'PRO', chapter: 7 }]);
      store().setRepeatMode(repeatMode);
      if (queued) store().addToQueue('bsb', 'PRO', 8);
      player.rerender();
      recorded.player.length = 0;

      await finishPlayback();

      assert.equal(store().status, 'idle');
      assert.equal(store().currentChapter, 7);
      assert.deepEqual(playerCalls('loadAndPlay'), []);
    });
  }
}

test('a multi-chapter session plays its own next chapter ahead of repeat and queued audio', async () => {
  const player = mountPlayer();
  await player.api.playChapter('PRO', 7);
  store().setPlaybackSequence([
    { bookId: 'PRO', chapter: 7 },
    { bookId: 'PRO', chapter: 9 },
  ]);
  store().setRepeatMode('book');
  store().addToQueue('bsb', 'PRO', 8);
  player.rerender();
  recorded.player.length = 0;

  await finishPlayback();

  assert.equal(store().currentChapter, 9);
  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[0]),
    ['https://cdn.example/bsb/PRO/9.mp3']
  );
});

// ---------------------------------------------------------------------------
// Auto-advance through sparse audio sets
//
// The finish handler runs from a native callback, usually long after the reader
// closed. It must read each translation's chapter coverage when it advances, not
// the coverage the reader last rendered (which may not have loaded yet, or may
// belong to another translation than the queue entry that just played).
// ---------------------------------------------------------------------------

const SPARSE_EL = 'el-bhj';

const addSparseTranslation = (coverage: AudioChapterMap) => {
  bibleState.translations = [...bibleState.translations, { id: SPARSE_EL, name: 'Bhujel audio' }];
  scenario.availableTranslations.add(SPARSE_EL);
  scenario.liveCoverage.set(SPARSE_EL, coverage);
};

const loadedUrls = () => playerCalls('loadAndPlay').map((call) => call.args[0]);

test('auto-advance with the reader closed uses coverage that resolved after it closed', async () => {
  const player = mountPlayer(SPARSE_EL);
  addSparseTranslation({});
  await player.api.playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  // The manifest only resolves now; the closed reader never rendered it.
  scenario.liveCoverage.set(SPARSE_EL, { GEN: [1, 5], PSA: [117] });
  recorded.player.length = 0;

  await finishPlayback();

  assert.equal(store().currentBookId, 'GEN');
  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'playing');
  assert.deepEqual(loadedUrls(), [`https://cdn.example/${SPARSE_EL}/GEN/5.mp3`]);
  assert.deepEqual(recorded.coverageLookups.at(-1), SPARSE_EL);
});

test('auto-advance after a queued chapter follows the coverage of that chapter translation', async () => {
  addSparseTranslation({ PSA: [117], MAT: [5] });
  // The reader shows (and rendered coverage for) the default translation.
  scenario.contentSummary = { audioChapters: { GEN: [1, 2], PSA: [117, 118] } };
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().addToQueue(SPARSE_EL, 'PSA', 117);
  player.rerender();
  player.unmount();
  await finishPlayback();
  assert.equal(store().currentTranslationId, SPARSE_EL);
  recorded.player.length = 0;

  await finishPlayback();

  assert.equal(store().currentTranslationId, SPARSE_EL);
  assert.equal(store().currentBookId, 'MAT');
  assert.equal(store().currentChapter, 5);
  assert.deepEqual(loadedUrls(), [`https://cdn.example/${SPARSE_EL}/MAT/5.mp3`]);
});

for (const nextStartsFirst of [false, true]) {
  test(`manual Next owns EOF book repeat when it starts ${nextStartsFirst ? 'before' : 'after'} completion`, async () => {
    addSparseTranslation({ GEN: [1, 50], EXO: [1] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 50);
    store().setRepeatMode('book');
    player.rerender();
    const { audioPlayer: realPlayer } = await import('../services/audio/audioPlayer');
    let finished: Promise<void> | undefined;
    realPlayer.setCallbacks({
      ...audioPlayerDouble.callbacks,
      onPlaybackFinished: () => {
        finished = finishPlayback();
      },
    });
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    try {
      await realPlayer.loadAndPlay('https://cdn.example/el/GEN/50.mp3');
      const next = nextStartsFirst ? player.api.nextChapter() : undefined;
      if (nextStartsFirst) scenario.coverageGate = null;
      nativeStatusListener?.({
        ...integrationNativeStatus,
        positionMillis: DEFAULT_DURATION_MS,
        didJustFinish: true,
      });
      const laterNext = nextStartsFirst ? next : player.api.nextChapter();
      gate.resolve();
      await Promise.all([finished, laterNext]);
      assert.equal(store().currentBookId, 'EXO');
      assert.equal(store().currentChapter, 1);
      assert.equal(store().status, 'playing');
      assert.equal(
        recorded.listened.filter(({ bookId, chapter }) => bookId === 'GEN' && chapter === 50)
          .length,
        1
      );
    } finally {
      gate.resolve();
      realPlayer.setCallbacks({});
      await realPlayer.stop();
    }
  });
}

test('end-of-chapter sleep timer cancels a manual Next still waiting for coverage at EOF', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setSleepTimer('end-of-chapter');
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const next = player.api.nextChapter();
  await finishPlayback();
  const loadsAtFinish = playerCalls('loadAndPlay').length;
  gate.resolve();
  assert.equal(await next, null);
  assert.equal(store().status, 'idle');
  assert.equal(store().currentBookId, 'GEN');
  assert.equal(store().currentChapter, 50);
  assert.equal(store().sleepTimerMinutes, null);
  assert.equal(playerCalls('loadAndPlay').length, loadsAtFinish);
  assert.equal(recorded.listened.length, 1);
  await player.api.playChapter('EXO', 1);
  assert.equal(store().status, 'playing');
  assert.equal(store().currentBookId, 'EXO');
  assert.equal(store().sleepTimerMinutes, null);
});

test('a manual Next claimed before EOF keeps the end-of-chapter timer for its target', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setSleepTimer('end-of-chapter');
  assert.deepEqual(await player.api.nextChapter(), { bookId: 'EXO', chapter: 1 });
  assert.equal(store().status, 'playing');
  assert.equal(store().sleepTimerMinutes, 'end-of-chapter');
  await finishPlayback();
  assert.equal(store().currentBookId, 'EXO');
  assert.equal(store().status, 'idle');
  assert.equal(store().sleepTimerMinutes, null);
});

test('a native interruption pauses a manual Next waiting for coverage', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const next = player.api.nextChapter();
  emitStatus({ isPlaying: false, positionMillis: 30_000, durationMillis: DEFAULT_DURATION_MS });
  assert.equal(store().status, 'paused');
  const loadsAtInterruption = playerCalls('loadAndPlay').length;
  gate.resolve();
  assert.deepEqual(await next, { bookId: 'EXO', chapter: 1 });
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, loadsAtInterruption);
  assert.equal(recorded.nowPlaying.at(-1)?.bookId, 'EXO');
  assert.equal(recorded.nowPlaying.at(-1)?.chapter, 1);
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);
  await remoteCommandListener?.({ command: 'play' });
  assert.equal(store().status, 'playing');
  assert.equal(store().currentBookId, 'EXO');
});

test('manual Next with no target settles EOF without allowing the older book repeat', async () => {
  addSparseTranslation({ GEN: [1, 50] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setRepeatMode('book');
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const finishing = finishPlayback();
  const next = player.api.nextChapter();
  gate.resolve();
  await finishing;
  assert.equal(await next, null);
  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 50);
  assert.equal(store().lastPosition, 0);
  assert.equal(recorded.listened.length, 1);
});

test('unresolved coverage retains canonical manual Next instead of old book repeat', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setRepeatMode('book');
  scenario.liveCoverage.delete(SPARSE_EL);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const finishing = finishPlayback();
  const next = player.api.nextChapter();
  gate.resolve();
  await Promise.all([finishing, next]);
  assert.equal(store().currentBookId, 'EXO');
  assert.equal(store().status, 'playing');
});

for (const command of ['pause', 'stop', 'play'] as const) {
  test(`a newer explicit ${command} owns pending completion and manual Next`, async () => {
    addSparseTranslation({ GEN: [1, 50], EXO: [1] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 50);
    store().setRepeatMode('book');
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    const finishing = finishPlayback();
    const next = player.api.nextChapter();
    if (command === 'play') await player.api.playChapter('JHN', 3);
    else await player.api[command]();
    const expected = {
      status: store().status,
      bookId: store().currentBookId,
      chapter: store().currentChapter,
    };
    const loadsBeforeRelease = playerCalls('loadAndPlay').length;
    gate.resolve();
    await finishing;
    assert.equal(await next, null);
    assert.deepEqual(
      { status: store().status, bookId: store().currentBookId, chapter: store().currentChapter },
      expected
    );
    assert.equal(playerCalls('loadAndPlay').length, loadsBeforeRelease);
  });
}

test('an older step cleanup cannot clear a newer manual intent before EOF', async () => {
  addSparseTranslation({ GEN: [1, 49, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setRepeatMode('book');
  const olderGate = deferPlayerOperation();
  scenario.coverageGate = olderGate.promise;
  const next = player.api.nextChapter();
  const newerGate = deferPlayerOperation();
  scenario.coverageGate = newerGate.promise;
  const previous = player.api.previousChapter();
  olderGate.resolve();
  assert.equal(await next, null);
  scenario.coverageGate = null;
  await finishPlayback();
  newerGate.resolve();
  assert.deepEqual(await previous, { bookId: 'GEN', chapter: 49 });
  assert.equal(store().currentChapter, 49);
  assert.equal(store().status, 'playing');
});

test('a rejected pending manual lookup clears its ticket and leaves completed playback idle', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  store().setRepeatMode('book');
  let rejectCoverage!: (error: Error) => void;
  scenario.coverageGate = new Promise((_resolve, reject) => {
    rejectCoverage = reject;
  });
  const next = player.api.nextChapter();
  const rejected = assert.rejects(next, /coverage lookup rejected/);
  scenario.coverageGate = null;
  await finishPlayback();
  rejectCoverage(new Error('coverage lookup rejected'));
  await rejected;
  const { navigationIntent } = await import('./audioPlayer/sharedPlaybackState');
  assert.equal(navigationIntent.pendingId, null);
  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 50);
  assert.equal(recorded.listened.length, 1);
});

test('auto-advance stops cleanly when a sparse set has no further audio', async () => {
  addSparseTranslation({ GEN: [1], PSA: [117] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('PSA', 117);
  player.rerender();
  player.unmount();
  recorded.player.length = 0;
  recorded.nowPlayingCleared = 0;

  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 117);
  assert.equal(store().error, null);
  assert.deepEqual(loadedUrls(), []);
  assert.equal(recorded.nowPlayingCleared, 1);
});

test('a queued chapter its translation has no audio for is skipped', async () => {
  addSparseTranslation({ PSA: [117] });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().addToQueue(SPARSE_EL, 'PSA', 1);
  store().addToQueue(SPARSE_EL, 'PSA', 117);
  player.rerender();
  player.unmount();
  recorded.player.length = 0;

  await finishPlayback();

  assert.equal(store().queueIndex, 2);
  assert.equal(store().currentChapter, 117);
  assert.deepEqual(loadedUrls(), [`https://cdn.example/${SPARSE_EL}/PSA/117.mp3`]);
  assert.equal(
    recorded.audioLookups.some((lookup) => lookup.chapter === 1 && lookup.bookId === 'PSA'),
    false
  );
});

test('a pause while coverage is still resolving keeps the next chapter from starting', async () => {
  addSparseTranslation({ GEN: [1, 5] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  let releaseCoverage: () => void = () => {};
  scenario.coverageGate = new Promise((resolve) => {
    releaseCoverage = resolve;
  });
  recorded.player.length = 0;

  const finishing = finishPlayback();
  await remoteCommandListener?.({ command: 'pause' });
  releaseCoverage();
  await finishing;

  assert.equal(store().status, 'paused');
  assert.equal(store().currentChapter, 1);
  assert.deepEqual(loadedUrls(), []);
});

test('a paused report from the finished sound does not cancel the advance', async () => {
  addSparseTranslation({ GEN: [1, 5] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  let releaseCoverage: () => void = () => {};
  scenario.coverageGate = new Promise((resolve) => {
    releaseCoverage = resolve;
  });

  const finishing = finishPlayback();
  // The native player can still describe the ended sound as stopped.
  emitStatus({ isPlaying: false, positionMillis: DEFAULT_DURATION_MS });
  releaseCoverage();
  await finishing;

  assert.equal(store().currentChapter, 5);
  assert.equal(store().status, 'playing');
  await remoteCommandListener?.({ command: 'pause' });
});

test('lock screen next with the reader closed follows the live coverage of the playing translation', async () => {
  const player = mountPlayer();
  addSparseTranslation({ GEN: [1, 5] });
  await player.api.playChapterForTranslation(SPARSE_EL, 'GEN', 1);
  player.rerender();
  player.unmount();

  await remoteCommandListener?.({ command: 'next' });

  assert.equal(store().currentChapter, 5);
  await remoteCommandListener?.({ command: 'pause' });
});

test('the lock screen skip buttons follow the live coverage of the playing translation', async () => {
  const player = mountPlayer();
  addSparseTranslation({ PSA: [117] });

  await player.api.playChapterForTranslation(SPARSE_EL, 'PSA', 117);

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, false);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, false);
});

// ---------------------------------------------------------------------------
// Progress snapshots from the native player
// ---------------------------------------------------------------------------

test('a playing snapshot is authoritative and corrects an overshooting position', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(5_000);

  emitStatus({ isPlaying: true, positionMillis: 3_000, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(store().currentPosition, 3_000);
  assert.equal(store().status, 'playing');
});

test('a stopped snapshot never drags the progress bar backwards', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(5_000);

  emitStatus({ isPlaying: false, positionMillis: 0, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(store().currentPosition, 5_000);
  assert.equal(store().status, 'paused');
});

test('a buffering snapshot shows the chapter as loading', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 5_000 });

  assert.equal(store().status, 'loading');
});

test('a snapshot with a shorter duration does not shrink the known duration', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: 1_000 });

  assert.equal(store().duration, DEFAULT_DURATION_MS);
});

test('an unchanged snapshot is not published to the lock screen twice', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  recorded.nowPlaying.length = 0;

  emitStatus({ isPlaying: true, positionMillis: 4_000, durationMillis: DEFAULT_DURATION_MS });
  emitStatus({ isPlaying: true, positionMillis: 4_000, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(recorded.nowPlaying.length, 1);
});

test('the position is interpolated between native progress polls', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });

  t.mock.timers.tick(250);

  assert.equal(store().currentPosition, 1_250);
});

test('interpolation never runs past the known chapter length', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({
    isPlaying: true,
    positionMillis: DEFAULT_DURATION_MS - 100,
    durationMillis: DEFAULT_DURATION_MS,
  });

  t.mock.timers.tick(250);
  t.mock.timers.tick(250);

  assert.equal(store().currentPosition, DEFAULT_DURATION_MS);
});

test('interpolation stops as soon as the player reports it is not playing', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);

  emitStatus({ isPlaying: false, positionMillis: 1_250, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(1_000);

  assert.equal(store().currentPosition, 1_250);
});

test('skipping backward is not undone by the next interpolation tick', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const api = player.rerender();
  emitStatus({ isPlaying: true, positionMillis: 60_000, durationMillis: DEFAULT_DURATION_MS });

  await api.skipBackward();
  t.mock.timers.tick(250);

  assert.equal(store().currentPosition, 50_250);
});

test('unmounting stops interpolating the position', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);

  player.unmount();
  t.mock.timers.tick(1_000);

  assert.equal(store().currentPosition, 1_250);
});

// ---------------------------------------------------------------------------
// Listening telemetry
// ---------------------------------------------------------------------------

test('listening progress is reported on the telemetry interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  recorded.analytics.length = 0;

  t.mock.timers.tick(30_000);

  const progress = recorded.analytics.filter((event) => event.name === 'audio_playback_progress');
  assert.equal(progress.length, 1);
  assert.equal(progress[0]?.properties.reason, 'tick');
  assert.equal(progress[0]?.properties.listened_ms, 30_000);
});

test('pausing flushes the listening segment that was in flight', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(5_000);
  recorded.analytics.length = 0;

  await player.rerender().pause();

  const progress = recorded.analytics.filter((event) => event.name === 'audio_playback_progress');
  assert.equal(progress.length, 1);
  assert.equal(progress[0]?.properties.reason, 'pause');
});

test('the last stretch of a finished chapter is reported as a finish', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(5_000);
  recorded.analytics.length = 0;

  // The native player reports the stopped state first, then ends the queue.
  emitStatus({
    isPlaying: false,
    didJustFinish: true,
    positionMillis: DEFAULT_DURATION_MS,
    durationMillis: DEFAULT_DURATION_MS,
  });
  await finishPlayback();

  const progress = recorded.analytics.filter((event) => event.name === 'audio_playback_progress');
  assert.deepEqual(
    progress.map((event) => ({
      reason: event.properties.reason,
      listened: event.properties.listened_ms,
    })),
    [{ reason: 'finish', listened: 5_000 }]
  );
});

// Reading activity counts listening from this device's own record, so a guest
// (no cloud summary) and an offline listener still see their minutes.
const totalListenedMs = () => recorded.listeningMs.reduce((sum, ms) => sum + ms, 0);

test('ten minutes into a long chapter, the ten minutes are banked on this device', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  scenario.chapterAudio = async () => ({
    url: 'https://cdn.example/bsb/PSA/119.mp3',
    duration: 25 * 60_000,
  });
  const player = mountPlayer();
  await player.api.playChapter('PSA', 119);
  emitStatus({ isPlaying: true, positionMillis: 0, durationMillis: 25 * 60_000 });

  t.mock.timers.tick(10 * 60_000);
  assert.equal(totalListenedMs(), 10 * 60_000, 'banked while it plays, not only at the end');

  t.mock.timers.tick(10_000);
  await player.rerender().pause();

  assert.equal(totalListenedMs(), 10 * 60_000 + 10_000);
  assert.deepEqual(recorded.listened, [], 'an unfinished chapter is not marked as heard');
});

test('a finished chapter banks the time actually heard, once', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(5_000);

  emitStatus({
    isPlaying: false,
    didJustFinish: true,
    positionMillis: DEFAULT_DURATION_MS,
    durationMillis: DEFAULT_DURATION_MS,
  });
  await finishPlayback();

  assert.equal(totalListenedMs(), 5_000);
  assert.deepEqual(recorded.listened, [{ bookId: 'GEN', chapter: 1 }]);
});

test('no listening progress is reported while the chapter duration is unknown', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  scenario.chapterAudio = async () => ({ url: 'https://cdn.example/bsb/GEN/1.mp3', duration: 0 });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: 0 });
  recorded.analytics.length = 0;

  t.mock.timers.tick(30_000);

  assert.deepEqual(
    recorded.analytics.filter((event) => event.name === 'audio_playback_progress'),
    []
  );
});

test('stopping closes out the listening segment as a stop', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(5_000);
  recorded.analytics.length = 0;

  await player.rerender().stop();

  const progress = recorded.analytics.filter((event) => event.name === 'audio_playback_progress');
  assert.equal(progress.length, 1);
  assert.equal(progress[0]?.properties.reason, 'stop');
});

test('switching chapters closes out the previous chapter segment', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(5_000);
  recorded.analytics.length = 0;

  await player.rerender().playChapter('GEN', 2);

  assert.equal(recorded.analytics.at(0)?.properties.reason, 'chapter-change');
});

test('reopening the reader while a chapter plays keeps a single listening telemetry timer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const closed = mountPlayer();
  await closed.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  closed.unmount();
  // The closed reader's callbacks stay registered until another player mounts.
  emitStatus({ isPlaying: true, positionMillis: 2_000, durationMillis: DEFAULT_DURATION_MS });
  mountPlayer();
  emitStatus({ isPlaying: true, positionMillis: 3_000, durationMillis: DEFAULT_DURATION_MS });
  recorded.analytics.length = 0;

  t.mock.timers.tick(30_000);

  assert.deepEqual(
    recorded.analytics
      .filter((event) => event.name === 'audio_playback_progress')
      .map((event) => event.properties.reason),
    ['tick']
  );

  emitStatus({ isPlaying: false, positionMillis: 33_000, durationMillis: DEFAULT_DURATION_MS });
  recorded.analytics.length = 0;
  t.mock.timers.tick(60_000);

  assert.deepEqual(
    recorded.analytics.filter((event) => event.name === 'audio_playback_progress'),
    []
  );
});

// ---------------------------------------------------------------------------
// Lock screen metadata
// ---------------------------------------------------------------------------

test('the lock screen entry is cleared when playback is reset', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.nowPlayingCleared = 0;

  store().resetPlayback();
  player.rerender();

  assert.equal(recorded.nowPlayingCleared, 1);
});

test('the lock screen entry is cleared when playback errors', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.nowPlayingCleared = 0;

  store().setError('interface.audioPlayFailed');
  player.rerender();

  assert.equal(recorded.nowPlayingCleared, 1);
});

test('a chapter with neighbours on both sides offers both skip directions', async () => {
  const player = mountPlayer();

  await player.api.playChapter('GEN', 2);

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, true);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, true);
});

for (const status of ['playing', 'paused'] as const) {
  test(`pinned singleton metadata disables both directions despite retained queue while ${status}`, async () => {
    const player = mountPlayer();
    store().addToQueue('bsb', 'GEN', 1);
    store().addToQueue('bsb', 'HEB', 1);
    store().addToQueue('bsb', 'JHN', 3);
    store().setPlaybackSequence([{ bookId: 'HEB', chapter: 1 }]);

    await player.rerender().playChapter('HEB', 1);
    if (status === 'paused') await player.rerender().pause();

    assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, false);
    assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, false);
    assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, status === 'playing');
  });

  const sequence = [
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'PSA', chapter: 23 },
    { bookId: 'HEB', chapter: 1 },
  ];
  for (const [index, current] of sequence.entries()) {
    test(`pinned sequence metadata reflects entry ${index + 1} boundaries while ${status}`, async () => {
      const player = mountPlayer();
      store().addToQueue('bsb', 'GEN', 2);
      store().addToQueue('bsb', current.bookId, current.chapter);
      store().addToQueue('bsb', 'JHN', 3);
      store().setPlaybackSequence(sequence);

      await player.rerender().playChapter(current.bookId, current.chapter);
      if (status === 'paused') await player.rerender().pause();

      assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, index < sequence.length - 1);
      assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, index > 0);
      assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, status === 'playing');
    });
  }
}

test('a pinned sequence does not restrict metadata for a chapter outside it', async () => {
  const player = mountPlayer();
  store().setPlaybackSequence([{ bookId: 'HEB', chapter: 1 }]);

  await player.rerender().playChapter('GEN', 2);

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, true);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, true);
});

test('explicit skip metadata overrides retain priority over pinned sequence boundaries', async () => {
  const player = mountPlayer();
  store().setPlaybackSequence([{ bookId: 'HEB', chapter: 1 }]);
  await player.rerender().playChapter('HEB', 1);
  const { syncPlayerNowPlaying } = await import('./audioPlayer/nowPlayingSync');
  const { useAudioPlayerSession } = await import('./audioPlayer/playerSession');
  const session = runtime.mount(useAudioPlayerSession).result.current;
  const context = {
    session,
    t: activeTranslate,
    fallbackTranslationId: 'bsb',
    peekAudioCoverage: () => undefined,
  };

  syncPlayerNowPlaying(context, { canSkipNext: true, canSkipPrevious: true });
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, true);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, true);

  store().setPlaybackSequence([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'HEB', chapter: 1 },
    { bookId: 'JHN', chapter: 3 },
  ]);
  syncPlayerNowPlaying(context, { canSkipNext: false, canSkipPrevious: false });
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, false);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, false);
});

test('the last chapter of the Bible offers no next skip', async () => {
  const player = mountPlayer();

  await player.api.playChapter('REV', 22);

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, false);
});

test('a queued chapter offers a next skip even at the end of the Bible', async () => {
  const player = mountPlayer();
  await player.api.playChapter('REV', 22);
  player.rerender().addToQueue('GEN', 1);

  emitStatus({ isPlaying: true, positionMillis: 5_000, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, true);
});

test('a chapter of an unlisted translation publishes without a translation name', async () => {
  bibleState.translations = [];
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(recorded.nowPlaying.at(-1)?.translationName, undefined);
  assert.equal(recorded.nowPlaying.at(-1)?.translationId, 'bsb');
});

test('a sparse audio set decides the lock screen skip availability', async () => {
  scenario.contentSummary = { audioChapters: { PSA: [117] } };
  const player = mountPlayer();

  await player.api.playChapter('PSA', 117);

  assert.equal(recorded.nowPlaying.at(-1)?.canSkipNext, false);
  assert.equal(recorded.nowPlaying.at(-1)?.canSkipPrevious, false);
});

// ---------------------------------------------------------------------------
// Background music coordination
// ---------------------------------------------------------------------------

test('background music is stopped once while the setting is off', () => {
  const player = mountPlayer();

  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [{ method: 'stop' }]);
});

test('choosing a background bed while idle keeps it silent', () => {
  mountPlayer();
  recorded.backgroundMusic.length = 0;

  store().setBackgroundMusicChoice('piano');

  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: false },
  ]);
});

test('the chosen background bed plays alongside the chapter', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  recorded.backgroundMusic.length = 0;

  await player.rerender().playChapter('GEN', 1);

  assert.equal(store().status, 'playing');
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: true,
  });
});

test('the background bed keeps playing while the next chapter loads', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  recorded.backgroundMusic.length = 0;

  store().setStatus('loading');
  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: true },
  ]);
});

// The bed plays through the gap between chapters, but not past a next chapter that
// fails to load. This used to keep the bed going on the error. On a locked phone that
// is music with no narration and no visible reason, indefinitely (all night, when
// auto-advance fails after the listener fell asleep), so a failed narration load now
// stops the bed with the narration, as a pause or the end of playback does.
test('a chapter transition that fails pauses the background bed', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  player.rerender();
  scenario.chapterAudio = async () => null;
  recorded.backgroundMusic.length = 0;

  await player.api.playChapter('GEN', 2);
  player.rerender();

  assert.equal(store().status, 'error');
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: false,
  });
});

test('a next chapter that fails to load after the reader closed pauses the background bed', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  scenario.failLoadUrls = new Set(['https://cdn.example/bsb/GEN/2.mp3']);
  recorded.backgroundMusic.length = 0;

  await finishPlayback();

  assert.equal(store().status, 'error');
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: false,
  });
});

test('the background bed comes back when Play recovers from a failed chapter', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  scenario.failLoadUrls = new Set(['https://cdn.example/bsb/GEN/2.mp3']);
  await finishPlayback();
  scenario.failLoadUrls = new Set();

  await remoteCommandListener?.({ command: 'play' });

  assert.equal(store().status, 'playing');
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: true,
  });
  await remoteCommandListener?.({ command: 'pause' });
});

test('turning the background bed off stops it again', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  player.rerender();
  recorded.backgroundMusic.length = 0;

  store().setBackgroundMusicChoice('off');
  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [{ method: 'stop' }]);
});

// The reader is the only screen that mounts the player, but lock-screen pause, the
// sleep timer and the end of playback all reach the narration after it has closed.
// The music bed has to stop with the narration, or it plays on under a paused chapter
// (all night, for a sleep timer) with no control left on screen to silence it.
const pausedBed = { method: 'sync', choice: 'piano', shouldPlay: false };
const lastBedCall = () => recorded.backgroundMusic.at(-1);

const playWithBedThenCloseReader = async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  player.rerender();
  player.unmount();
  recorded.backgroundMusic.length = 0;
};

test('a lock screen pause after the reader closed pauses the background bed too', async () => {
  await playWithBedThenCloseReader();

  await remoteCommandListener?.({ command: 'pause' });

  assert.deepEqual(lastBedCall(), pausedBed);
});

test('a lock screen play after the reader closed brings the background bed back', async () => {
  await playWithBedThenCloseReader();
  store().setPosition(30_000);
  await remoteCommandListener?.({ command: 'pause' });

  await remoteCommandListener?.({ command: 'play' });

  assert.deepEqual(lastBedCall(), { method: 'sync', choice: 'piano', shouldPlay: true });
  await remoteCommandListener?.({ command: 'pause' });
});

test('the sleep timer silences the background bed after the reader has closed', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  await playWithBedThenCloseReader();
  store().setSleepTimer(5);

  t.mock.timers.tick(5 * 60 * 1000);
  emitStatus({ isPlaying: true, positionMillis: 300_000, durationMillis: DEFAULT_DURATION_MS });
  await Promise.resolve();

  assert.equal(store().status, 'paused');
  assert.deepEqual(lastBedCall(), pausedBed);
  emitStatus({ isPlaying: false, positionMillis: 300_000 });
});

test('the end of playback after the reader closed silences the background bed', async () => {
  await playWithBedThenCloseReader();
  store().setAutoAdvanceChapter(false);

  emitStatus({ isPlaying: false, didJustFinish: true, positionMillis: DEFAULT_DURATION_MS });
  await finishPlayback();

  assert.equal(store().status, 'idle');
  assert.deepEqual(lastBedCall(), pausedBed);
});

test('the background bed plays straight through an auto-advance to the next chapter', async () => {
  await playWithBedThenCloseReader();

  // The native player reports the finished chapter as stopped before the finish
  // handler moves on; the bed must not dip for that instant.
  emitStatus({ isPlaying: false, didJustFinish: true, positionMillis: DEFAULT_DURATION_MS });
  await finishPlayback();

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
  assert.equal(
    recorded.backgroundMusic.some((call) => call.shouldPlay === false),
    false
  );
  await remoteCommandListener?.({ command: 'pause' });
});

// ---------------------------------------------------------------------------
// Sleep timer
// ---------------------------------------------------------------------------

// `mock.timers.tick(ms)` advances the fake clock by the whole span before it
// runs any due callback, so a single big tick would have all 300 one-second
// firings observe the post-expiry time. Stepping a second at a time is what
// the interval actually sees.
const tickSeconds = (timers: MockTimers, seconds: number) => {
  for (let second = 0; second < seconds; second += 1) {
    timers.tick(1_000);
  }
};

test('the sleep timer leaves playback alone until it expires', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  recorded.player.length = 0;

  tickSeconds(t.mock.timers, 4 * 60 + 59);

  assert.equal(playerCalls('pause').length, 0);
  assert.equal(store().sleepTimerMinutes, 5);
});

test('the sleep timer pauses playback when it expires', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  recorded.player.length = 0;

  tickSeconds(t.mock.timers, 5 * 60);

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().sleepTimerMinutes, null);
  assert.equal(store().sleepTimerEndTime, null);
});

test('an expired sleep timer stops checking once the hook re-renders', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  tickSeconds(t.mock.timers, 5 * 60);
  player.rerender();
  recorded.player.length = 0;

  tickSeconds(t.mock.timers, 60);

  assert.equal(playerCalls('pause').length, 0);
});

test('the sleep timer does not run while playback is paused', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().setStatus('paused');
  store().setSleepTimer(5);
  player.rerender();
  recorded.player.length = 0;

  t.mock.timers.tick(5 * 60 * 1000);

  assert.equal(playerCalls('pause').length, 0);
  assert.equal(store().sleepTimerMinutes, 5);
});

test('the sleep timer counts down in whole minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  assert.equal(player.rerender().sleepTimerRemaining, 5);

  t.mock.timers.tick(90_000);

  assert.equal(player.rerender().sleepTimerRemaining, 4);
});

test('pausing freezes the sleep timer countdown and resuming continues the remaining time', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  tickSeconds(t.mock.timers, 2 * 60);
  await player.api.pause();
  player.rerender();

  t.mock.timers.tick(30 * 60 * 1000);
  const shownWhilePaused = player.rerender().sleepTimerRemaining;
  await player.api.resume();
  player.rerender();
  recorded.player.length = 0;
  tickSeconds(t.mock.timers, 3 * 60 - 1);
  const pausesBeforeEnd = playerCalls('pause').length;
  tickSeconds(t.mock.timers, 1);

  assert.deepEqual(
    { shownWhilePaused, pausesBeforeEnd, pausesAtEnd: playerCalls('pause').length },
    { shownWhilePaused: 3, pausesBeforeEnd: 0, pausesAtEnd: 1 }
  );
  assert.equal(store().sleepTimerMinutes, null);
});

test('a native progress event after a long pause does not expire a frozen sleep timer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  emitStatus({ isPlaying: false, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(60 * 60 * 1000);
  recorded.player.length = 0;

  emitStatus({ isPlaying: true, positionMillis: 1_000, durationMillis: DEFAULT_DURATION_MS });
  await Promise.resolve();

  assert.equal(playerCalls('pause').length, 0);
  assert.equal(store().status, 'playing');
  assert.equal(store().sleepTimerEndTime, BASE_TIME + 60 * 60 * 1000 + 5 * 60 * 1000);
  emitStatus({ isPlaying: false, positionMillis: 1_000 });
});

test('no sleep timer means no remaining time to show', () => {
  assert.equal(mountPlayer().api.sleepTimerRemaining, null);
});

// ---------------------------------------------------------------------------
// Lock screen transport commands
// ---------------------------------------------------------------------------

test('the remote pause command pauses playback', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();

  await remoteCommandListener?.({ command: 'pause' });

  assert.equal(store().status, 'paused');
});

// The headset button (wired or Bluetooth) and CarPlay send a toggle, not play or
// pause. iOS delivered it as "play", which is ignored while playing, so the button
// could start the audio but never pause it.
test('the remote toggle command pauses a chapter that is playing', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();

  await remoteCommandListener?.({ command: 'toggle' });

  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('pause').length, 1);
});

test('the remote toggle command resumes a paused chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  await player.rerender().pause();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'toggle' });

  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('resume').length, 1);
});

test('the remote toggle command pauses a chapter that is still loading', async () => {
  let release!: () => void;
  playerGates.set(
    'load:https://cdn.example/bsb/GEN/1.mp3',
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const player = mountPlayer();
  const starting = player.api.playChapter('GEN', 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store().status, 'loading');

  await remoteCommandListener?.({ command: 'toggle' });
  release();
  await starting;

  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

// When a phone call or another app's audio ends, iOS tells the app it may resume.
// That is right for a chapter the call interrupted, but the native module also sent
// it for a chapter the listener had paused (or the sleep timer had stopped) before
// the call, which then started playing again by itself.
test('the end of an interruption resumes a chapter the interruption paused', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 30_000, durationMillis: DEFAULT_DURATION_MS });
  // The system paused it: a native snapshot, not the listener.
  emitStatus({ isPlaying: false, positionMillis: 30_000, durationMillis: DEFAULT_DURATION_MS });
  player.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'interruption-ended' });

  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('resume').length, 1);
});

test('a seek during an OS pause preserves automatic interruption resume', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 30_000, durationMillis: DEFAULT_DURATION_MS });
  emitStatus({ isPlaying: false, positionMillis: 30_000, durationMillis: DEFAULT_DURATION_MS });
  await player.api.seekTo(31_000);
  recorded.player.length = 0;
  await remoteCommandListener?.({ command: 'interruption-ended' });
  assert.equal(store().status, 'playing');
  assert.equal(store().currentPosition, 31_000);
  assert.equal(playerCalls('resume').length, 1);
});

test('the end of an interruption leaves a chapter the listener paused alone', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  await player.rerender().pause();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'interruption-ended' });

  assert.equal(store().status, 'paused');
  assert.deepEqual(recorded.player, []);
});

test('the end of an interruption leaves a chapter the sleep timer stopped alone', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  tickSeconds(t.mock.timers, 5 * 60);
  await Promise.resolve();
  assert.equal(store().status, 'paused');
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'interruption-ended' });

  assert.equal(store().status, 'paused');
  assert.deepEqual(recorded.player, []);
});

test('the end of an interruption does not restart a chapter that had finished', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await finishPlayback();
  assert.equal(store().status, 'idle');
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'interruption-ended' });

  assert.equal(store().status, 'idle');
  assert.deepEqual(recorded.player, []);
});

test('the remote play command resumes a loaded chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  const api = player.rerender();
  await api.pause();
  player.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'play' });

  assert.equal(playerCalls('resume').length, 1);
});

test('the remote play command is ignored while already playing', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'play' });

  assert.equal(recorded.player.length, 0);
});

test('the remote play command restarts the last played chapter after a cold start', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('web', 'JHN', 3);
  store().resetPlayback();
  player.rerender();

  await remoteCommandListener?.({ command: 'play' });

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().status, 'playing');
});

test('the remote stop command tears playback down', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();

  await remoteCommandListener?.({ command: 'stop' });

  assert.equal(store().status, 'idle');
  assert.equal(store().currentBookId, null);
});

test('the remote seek commands jump ten seconds either way', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  player.rerender();

  await remoteCommandListener?.({ command: 'seek-forward' });
  assert.equal(store().currentPosition, 40_000);

  await remoteCommandListener?.({ command: 'seek-backward' });
  assert.equal(store().currentPosition, 30_000);
});

test('the remote seek-position command works in seconds', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();

  await remoteCommandListener?.({ command: 'seek-position', positionSeconds: 42 });

  assert.equal(store().currentPosition, 42_000);
});

test('a remote seek past the end of the chapter stops at its length', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.rerender();
  recorded.player.length = 0;

  await remoteCommandListener?.({ command: 'seek-position', positionSeconds: 5_000 });

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [DEFAULT_DURATION_MS] }]);
  assert.equal(store().currentPosition, DEFAULT_DURATION_MS);
  // The durable resume point must not land beyond the chapter either.
  assert.ok(store().lastPosition <= DEFAULT_DURATION_MS);
});

test('a remote seek-position without a position is ignored', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(10_000);
  player.rerender();

  await remoteCommandListener?.({ command: 'seek-position' });

  assert.equal(store().currentPosition, 10_000);
});

test('the remote next and previous commands change chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 2);
  player.rerender();

  await remoteCommandListener?.({ command: 'next' });
  assert.equal(store().currentChapter, 3);

  player.rerender();
  await remoteCommandListener?.({ command: 'previous' });
  assert.equal(store().currentChapter, 2);
});

function deferPlayerOperation() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flushPlayerOperations = () => new Promise((resolve) => setImmediate(resolve));

for (const commands of ['seek then seek', 'seek then skip', 'skip then seek'] as const) {
  test(`the newest same-chapter position wins for ${commands}`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('JHN', 3);
    store().setPosition(60_000);
    const gate = deferPlayerOperation();
    playerGates.set('seek', gate.promise);
    const older = commands.startsWith('skip')
      ? player.api.skipForward()
      : player.api.seekTo(120_000);
    await flushPlayerOperations();
    playerGates.delete('seek');
    if (commands.endsWith('skip')) {
      await player.api.skipForward();
    } else {
      await player.api.seekTo(240_000);
    }
    const newerPosition = playerCalls('seekTo').at(-1)?.args[0];
    gate.resolve();
    await older;

    assert.equal(store().currentPosition, newerPosition);
    assert.equal(store().lastPosition, newerPosition);
  });
}

test('a seek during a pending chapter load does not cancel the load', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('load:https://cdn.example/bsb/JHN/3.mp3', gate.promise);
  const loading = player.api.playChapter('JHN', 3);
  await flushPlayerOperations();
  await player.api.seekTo(20_000);
  gate.resolve();
  await loading;

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().currentChapter, 3);
  assert.equal(store().status, 'playing');
});

test('a delayed seek cannot overwrite the position of a newly selected chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('seek', gate.promise);
  const seeking = player.api.seekTo(120_000);
  await flushPlayerOperations();

  playerGates.delete('seek');
  await player.api.playChapter('JHN', 3);
  gate.resolve();
  await seeking;

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().currentChapter, 3);
  assert.equal(store().currentPosition, 0);
  assert.equal(store().lastPosition, 0, 'the new chapter must retain its own resume point');
});

test('a delayed skip cannot overwrite the position of a newly selected chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 60_000, durationMillis: DEFAULT_DURATION_MS });
  const gate = deferPlayerOperation();
  playerGates.set('seek', gate.promise);
  const skipping = player.api.skipForward();
  await flushPlayerOperations();

  playerGates.delete('seek');
  await player.api.playChapter('JHN', 3);
  gate.resolve();
  await skipping;

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(store().currentChapter, 3);
  assert.equal(store().currentPosition, 0);
  assert.equal(store().lastPosition, 0, 'the new chapter must retain its own resume point');
});

test('a delayed seek cannot overwrite a fresh playback of the same chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('seek', gate.promise);
  const seeking = player.api.seekTo(120_000);
  await flushPlayerOperations();

  playerGates.delete('seek');
  await player.api.playChapter('GEN', 1);
  gate.resolve();
  await seeking;

  assert.equal(store().currentPosition, 0);
  assert.equal(store().lastPosition, 0);
});

test('pausing during the initial stop prevents the pending chapter from starting', async () => {
  const player = mountPlayer();
  const gate = deferPlayerOperation();
  playerGates.set('stop', gate.promise);
  const pending = player.api.playChapter('GEN', 1);
  await flushPlayerOperations();
  await player.api.pause();
  gate.resolve();
  await pending;

  assert.equal(store().status, 'paused');
  assert.deepEqual(recorded.audioLookups, []);
  assert.deepEqual(playerCalls('loadAndPlay'), []);
});

test('playChapter stops the current sound before it looks up the next chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  recorded.audioLookups.length = 0;
  const gate = deferPlayerOperation();
  playerGates.set('stop', gate.promise);

  const pending = player.rerender().playChapter('GEN', 2);
  await flushPlayerOperations();
  assert.deepEqual(recorded.audioLookups, [], 'nothing is resolved while the old sound plays');

  gate.resolve();
  await pending;
  assert.equal(recorded.audioLookups.length, 1);
  assert.equal(store().currentChapter, 2);
});

test('stopping during the initial stop prevents the pending chapter from starting', async () => {
  const player = mountPlayer();
  const gate = deferPlayerOperation();
  playerGates.set('stop', gate.promise);
  const pending = player.api.playChapter('GEN', 1);
  await flushPlayerOperations();
  const stopping = player.api.stop();
  gate.resolve();
  await Promise.all([pending, stopping]);

  assert.equal(store().status, 'idle');
  assert.deepEqual(recorded.audioLookups, []);
  assert.deepEqual(playerCalls('loadAndPlay'), []);
});

test('pause shows the paused state before the native pause settles', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('pause', gate.promise);

  const pausing = player.rerender().pause();
  await flushPlayerOperations();
  assert.equal(store().status, 'paused');

  gate.resolve();
  await pausing;
});

test('stop clears the playback state before native teardown settles', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('stop', gate.promise);

  const stopping = player.rerender().stop();
  await flushPlayerOperations();
  assert.equal(store().status, 'idle');
  assert.equal(store().currentBookId, null);

  gate.resolve();
  await stopping;
});

test('a stale completed load never stops the newer chapter', async () => {
  const player = mountPlayer();
  const gate = deferPlayerOperation();
  playerGates.set('load:https://cdn.example/bsb/GEN/1.mp3', gate.promise);
  const pending = player.api.playChapter('GEN', 1);
  await flushPlayerOperations();
  await player.api.playChapter('GEN', 2);
  const stops = playerCalls('stop').length;

  gate.resolve();
  await pending;

  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('stop').length, stops);
});

test('a remote fallback arriving after pause is never loaded', async () => {
  const player = mountPlayer();
  scenario.chapterAudio = async () => ({ url: 'file:///broken.mp3', duration: 120_000 });
  scenario.failLoadUrls.add('file:///broken.mp3');
  let deliver!: (value: AudioAsset) => void;
  scenario.remoteFallback = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  const pending = player.api.playChapter('GEN', 1);
  await flushPlayerOperations();
  await player.api.pause();

  deliver({ url: 'https://cdn.example/replacement.mp3', duration: 120_000 });
  await pending;

  assert.equal(store().status, 'paused');
  assert.deepEqual(
    playerCalls('loadAndPlay').map((call) => call.args[0]),
    ['file:///broken.mp3']
  );
  assert.deepEqual(recorded.deletedFiles, []);
});

test('a sleep timer expires once and updates paused state without waiting for native events', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  recorded.player.length = 0;

  tickSeconds(t.mock.timers, 6 * 60);

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);
});

test('a sleep timer also stops a chapter still buffering at expiry', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  store().setStatus('loading');
  player.rerender();
  recorded.player.length = 0;

  tickSeconds(t.mock.timers, 5 * 60);

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
  assert.equal(store().sleepTimerEndTime, null);
});

test('pause supersedes a resume still waiting to restore its position', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(10_000);
  await player.api.pause();
  const gate = deferPlayerOperation();
  playerGates.set('seek', gate.promise);
  const resuming = player.api.resume();
  await flushPlayerOperations();

  await player.api.pause();
  gate.resolve();
  await resuming;

  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('resume').length, 0);
});

test('a stale resume cannot publish its old position over a new chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(10_000);
  await player.api.pause();
  const gate = deferPlayerOperation();
  playerGates.set('resume', gate.promise);
  const resuming = player.api.resume();
  await flushPlayerOperations();
  await player.api.playChapter('GEN', 2);
  const published = recorded.nowPlaying.length;

  gate.resolve();
  await resuming;

  assert.equal(store().currentChapter, 2);
  assert.equal(recorded.nowPlaying.length, published);
  assert.equal(recorded.nowPlaying.at(-1)?.positionMs, 0);
});

test('background playback uses native positions without visual interpolation', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 1000, durationMillis: DEFAULT_DURATION_MS });
  rn.AppState.emit('inactive');
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 1000);
  rn.AppState.emit('background');
  emitStatus({ isPlaying: true, positionMillis: 6000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(1000);
  assert.equal(store().currentPosition, 6000);
  assert.equal(store().lastPosition, 6000);
  assert.equal(playerCalls('pause').length, 0);
  rn.AppState.emit('active');
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 6000);
  emitStatus({ isPlaying: true, positionMillis: 7000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 7250);
});

test('native callbacks after unmount preserve progress and next chapter without interpolation', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(true);
  player.unmount();
  assert.equal(rn.AppState.listenerCount(), 0);
  emitStatus({ isPlaying: true, positionMillis: 6000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 6000);
  await finishPlayback();
  assert.equal(store().currentChapter, 2);
  emitStatus({ isPlaying: true, positionMillis: 1000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 1000);
  // Stop the retained playback session's coarse telemetry before ending the test.
  emitStatus({ isPlaying: false, positionMillis: 1000 });
});

test('lock screen pause and play still work after the reader has closed', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setPosition(30_000);
  player.rerender();
  player.unmount();

  await remoteCommandListener?.({ command: 'pause' });
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('pause').length, 1);

  await remoteCommandListener?.({ command: 'play' });
  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('resume').length, 1);

  await remoteCommandListener?.({ command: 'pause' });
});

test('lock screen next after the reader closed follows the chapter playing now', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(true);
  player.rerender();
  player.unmount();
  await finishPlayback();
  assert.equal(store().currentChapter, 2);

  await remoteCommandListener?.({ command: 'next' });

  assert.equal(store().currentChapter, 3);
  assert.equal(store().status, 'playing');
  await remoteCommandListener?.({ command: 'pause' });
});

test('lock screen pause after the reader closed checkpoints the chapter playing now', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(true);
  player.rerender();
  player.unmount();
  await finishPlayback();
  store().setPosition(60_000);
  recorded.history.length = 0;

  await remoteCommandListener?.({ command: 'pause' });

  assert.deepEqual(recorded.history, [
    { bookId: 'GEN', chapter: 2, progress: 60_000 / DEFAULT_DURATION_MS },
  ]);
});

test('the sleep timer still pauses playback after the reader has closed', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  player.unmount();
  recorded.player.length = 0;

  t.mock.timers.tick(5 * 60 * 1000);
  // The native player keeps reporting progress about once a second while it plays.
  emitStatus({ isPlaying: true, positionMillis: 300_000, durationMillis: DEFAULT_DURATION_MS });
  await Promise.resolve();

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
  assert.equal(store().sleepTimerEndTime, null);
  emitStatus({ isPlaying: false, positionMillis: 300_000 });
});

test('a late buffering snapshot cannot restart a manually paused sleep countdown', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  await player.api.pause();
  player.unmount();
  recorded.player.length = 0;
  t.mock.timers.setTime(BASE_TIME + 6 * 60 * 1000);

  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 1000 });

  assert.equal(store().status, 'paused');
  assert.equal(store().sleepTimerEndTime, null);
  assert.equal(store().sleepTimerRemainingMs, 5 * 60 * 1000);
  assert.equal(playerCalls('pause').length, 0);

  await player.api.resume();
  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 1000 });
  assert.equal(store().status, 'loading');
  assert.equal(store().sleepTimerEndTime, BASE_TIME + 11 * 60 * 1000);
});

test('a buffering snapshot before the deadline keeps the sleep countdown running', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.unmount();
  recorded.player.length = 0;
  t.mock.timers.setTime(BASE_TIME + 4 * 60 * 1000);

  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 1000 });

  assert.equal(store().status, 'loading');
  assert.equal(store().sleepTimerEndTime, BASE_TIME + 5 * 60 * 1000);
  assert.equal(playerCalls('pause').length, 0);
});

test('a buffering snapshot after suspended JS expires the closed-reader sleep timer', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  player.unmount();
  recorded.player.length = 0;

  // Advance the wall clock without running JS timers, then deliver the first
  // native status after JS resumes while the stream is still buffering.
  t.mock.timers.setTime(BASE_TIME + 5 * 60 * 1000);
  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 1000 });
  await Promise.resolve();

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
  assert.equal(store().sleepTimerEndTime, null);
  emitStatus({ isPlaying: false, isBuffering: true, positionMillis: 1000 });
  assert.equal(store().status, 'paused');
  assert.equal(playerCalls('pause').length, 1);
});

// With the reader closed the sleep timer is only checked on native progress, which a
// new chapter reports once it is already sounding. A timer that has run out by the
// end of a chapter must not start the next one at all.
const playWithSleepTimerThenCloseReader = async (timers: MockTimers) => {
  timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.api.playChapter('GEN', 1);
  store().setSleepTimer(5);
  player.rerender();
  player.unmount();
  recorded.player.length = 0;
  recorded.audioLookups.length = 0;
};

test('a sleep timer that ran out as the chapter ended does not start the next chapter', async (t) => {
  await playWithSleepTimerThenCloseReader(t.mock.timers);

  t.mock.timers.tick(5 * 60 * 1000);
  await finishPlayback();

  assert.deepEqual(playerCalls('loadAndPlay'), []);
  assert.deepEqual(recorded.audioLookups, []);
  assert.equal(store().status, 'paused');
  assert.equal(store().sleepTimerEndTime, null);
  assert.equal(store().sleepTimerMinutes, null);
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: false,
  });
  // Play picks up with the chapter that would have come next, from its start.
  assert.equal(store().currentChapter, 2);
  assert.equal(store().lastPosition, 0);
  assert.equal(recorded.nowPlaying.at(-1)?.chapter, 2);
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);
});

test('a chapter the sleep timer held back stays paused when an interruption ends', async (t) => {
  await playWithSleepTimerThenCloseReader(t.mock.timers);
  t.mock.timers.tick(5 * 60 * 1000);
  await finishPlayback();

  await remoteCommandListener?.({ command: 'interruption-ended' });

  assert.equal(store().status, 'paused');
  assert.deepEqual(playerCalls('loadAndPlay'), []);
});

test('a sleep timer that runs out while the next chapter is looked up does not start it', async (t) => {
  await playWithSleepTimerThenCloseReader(t.mock.timers);
  t.mock.timers.tick(5 * 60 * 1000 - 500);
  let releaseLookup: () => void = () => {};
  const lookup = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  scenario.chapterAudio = async (translationId, bookId, chapter) => {
    await lookup;
    return defaultChapterAudio(translationId, bookId, chapter);
  };

  const finishing = finishPlayback();
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(1_000);
  releaseLookup();
  await finishing;

  assert.deepEqual(playerCalls('loadAndPlay'), []);
  assert.equal(store().status, 'paused');
  assert.equal(store().currentChapter, 2);
  assert.equal(store().sleepTimerEndTime, null);
});

test('a sleep timer that runs out while the next chapter loads pauses it at once', async (t) => {
  await playWithSleepTimerThenCloseReader(t.mock.timers);
  t.mock.timers.tick(5 * 60 * 1000 - 500);
  let releaseLoad: () => void = () => {};
  playerGates.set(
    'load:https://cdn.example/bsb/GEN/2.mp3',
    new Promise<void>((resolve) => {
      releaseLoad = resolve;
    })
  );

  const finishing = finishPlayback();
  while (playerCalls('loadAndPlay').length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.mock.timers.tick(1_000);
  releaseLoad();
  await finishing;

  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().status, 'paused');
  assert.equal(store().currentChapter, 2);
  assert.equal(store().sleepTimerEndTime, null);
});

test('a sleep timer with time left lets the next chapter start', async (t) => {
  await playWithSleepTimerThenCloseReader(t.mock.timers);
  t.mock.timers.tick(4 * 60 * 1000);

  await finishPlayback();

  assert.equal(store().status, 'playing');
  assert.equal(store().currentChapter, 2);
  assert.equal(store().sleepTimerMinutes, 5);
  await remoteCommandListener?.({ command: 'pause' });
});

test('a replacement hook interpolates and old cleanup does not disable it', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const old = mountPlayer();
  await old.api.playChapter('GEN', 1);
  mountPlayer();
  old.unmount();
  emitStatus({ isPlaying: true, positionMillis: 1000, durationMillis: DEFAULT_DURATION_MS });
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 1250);
  rn.AppState.emit('background');
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 1250);
});

test('background playback keeps next chapters, lock screen commands and sleep expiry', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(true);
  rn.AppState.emit('background');
  await finishPlayback();
  assert.equal(store().currentChapter, 2);
  player.rerender();
  await remoteCommandListener?.({ command: 'pause' });
  assert.equal(store().status, 'paused');
  player.rerender();
  await remoteCommandListener?.({ command: 'play' });
  assert.equal(store().status, 'playing');
  store().setSleepTimer(5);
  player.rerender();
  recorded.player.length = 0;
  tickSeconds(t.mock.timers, 5 * 60);
  assert.equal(playerCalls('pause').length, 1);
  assert.equal(store().sleepTimerEndTime, null);
});

// ---------------------------------------------------------------------------
// A chapter that fails mid-play
//
// When a stream dies after the chapter started, the wrapper drops the released sound:
// its Error state reaches the hook as a stopped snapshot, then the error itself. The
// chapter has to say it failed (not just turn back into Play), and Play reloads it
// where it stopped.
// ---------------------------------------------------------------------------

/** What the wrapper reports when the native side released the playing sound. */
const releasePlayingSound = (message: string) => {
  audioPlayerDouble.loaded = false;
  emitStatus({ isPlaying: false, isBuffering: false, positionMillis: 120_000 });
  audioPlayerDouble.callbacks.onError?.(message);
};

const startChapterAt = async (player: MountedPlayer, positionMillis: number) => {
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis, durationMillis: DEFAULT_DURATION_MS });
  player.rerender();
};

test('a stream that fails mid-play shows the failure for that chapter and reports it once', async () => {
  const player = mountPlayer();
  await startChapterAt(player, 120_000);

  releasePlayingSound('AVFoundation decode failure');

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.equal(store().currentChapter, 1);
  assert.deepEqual(recorded.reports, [
    { source: 'audio.load', message: 'AVFoundation decode failure', reportTimeouts: false },
  ]);
});

test('Play after a mid-play failure reloads the chapter where it stopped and clears the failure', async () => {
  const player = mountPlayer();
  await startChapterAt(player, 120_000);
  releasePlayingSound('AVFoundation decode failure');
  recorded.player.length = 0;

  await player.rerender().togglePlayPause();

  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(loadedStartOffset(), 120_000);
  assert.equal(store().status, 'playing');
  assert.equal(store().error, null);
  assert.equal(recorded.reports.length, 1);
});

test('a failure the native side reports more than once is reported once', async () => {
  const player = mountPlayer();
  await startChapterAt(player, 120_000);

  releasePlayingSound('Player error: Source error');
  audioPlayerDouble.callbacks.onError?.('Player does not exist.');

  assert.equal(store().status, 'error');
  assert.deepEqual(
    recorded.reports.map((report) => report.message),
    ['Player error: Source error']
  );
});

// A dropped connection is network weather: the queue's transient-network rules decide,
// and a mid-play timeout is not singled out for reporting the way a failed load is.
test('a mid-play network failure goes through the transient-network rules', async () => {
  const player = mountPlayer();
  await startChapterAt(player, 120_000);

  releasePlayingSound(IOS_TIMED_OUT);

  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.deepEqual(recorded.reports, [
    { source: 'audio.load', message: IOS_TIMED_OUT, reportTimeouts: false },
  ]);
});

test('a stream released while buffering mid-play shows the failure and reports it once', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const native = await startNativeStreamHealthPlayer();
  try {
    native.buffering();
    native.player.rerender();
    integrationNativeReleased = true;
    t.mock.timers.tick(5_000);
    await flushPlayerOperations();
    native.player.rerender();
    t.mock.timers.tick(10_000);
    assert.equal(store().status, 'error');
    assert.equal(store().error, 'interface.audioPlayFailed');
    assert.deepEqual(
      recorded.reports.map((report) => report.source),
      ['audio.load']
    );
    recorded.player.length = 0;
    integrationNativeReleased = false;
    await native.player.rerender().togglePlayPause();
    assert.equal(loadedStartOffset(), 90_000);
    assert.equal(store().status, 'playing');
    assert.equal(store().error, null);
  } finally {
    await native.cleanup();
  }
});

test('moving to another chapter after a mid-play failure clears it', async () => {
  const player = mountPlayer();
  await startChapterAt(player, 120_000);
  releasePlayingSound('AVFoundation decode failure');

  await player.rerender().nextChapter();

  assert.equal(store().currentChapter, 2);
  assert.equal(store().error, null);
  assert.notEqual(store().status, 'error');
});

test('a failure while the chapter is still loading is left to the load to report', async () => {
  scenario.loadScript.set('https://cdn.example/bsb/GEN/1.mp3', [
    { nativeError: 'AVFoundation decode failure' },
  ]);
  const player = mountPlayer();

  await player.api.playChapter('GEN', 1);

  assert.equal(store().error, 'interface.audioPlayFailed');
  assert.deepEqual(recorded.reports, [
    { source: 'audio.load', message: 'AVFoundation decode failure', reportTimeouts: true },
  ]);
});

test('pausing, stopping, finishing and the sleep timer show no failure', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await startChapterAt(player, 120_000);

  await player.api.pause();
  emitStatus({ isPlaying: false, positionMillis: 120_000, durationMillis: DEFAULT_DURATION_MS });
  assert.equal(store().status, 'paused');
  assert.equal(store().error, null);

  await player.rerender().togglePlayPause();
  store().setAutoAdvanceChapter(false);
  player.rerender();
  await reachChapterEnd(DEFAULT_DURATION_MS);
  assert.equal(store().status, 'idle');
  assert.equal(store().error, null);

  await startChapterAt(player, 60_000);
  store().setSleepTimer(5);
  player.rerender();
  tickSeconds(t.mock.timers, 5 * 60);
  emitStatus({ isPlaying: false, positionMillis: 360_000, durationMillis: DEFAULT_DURATION_MS });
  assert.equal(store().status, 'paused');
  assert.equal(store().error, null);

  await player.rerender().stop();
  assert.equal(store().status, 'idle');
  assert.equal(store().error, null);
  assert.deepEqual(recorded.reports, []);
});

// ---------------------------------------------------------------------------
// Passage repeat, through the player
//
// The passage engine (audioPlayer/passageRepeat.ts, tested on its own beside it)
// is reached from Play, native progress and the chapter end. These run it with the
// real bundled BSB timings: John 3:16 starts at 106.78 s and 3:19 at 134.2 s, each
// read 150 ms early.
// ---------------------------------------------------------------------------

const JOHN_3_16_MS = 106_780 - 150;
const JOHN_3_19_MS = 134_200 - 150;
const JOHN_3_16_TO_18 = {
  bookId: 'JHN',
  start: { chapter: 3, verse: 16 },
  end: { chapter: 3, verse: 18 },
};

async function passageSettled(): Promise<void> {
  const { passageRepeatSettled } = await import('./audioPlayer/passageRepeat');
  await passageRepeatSettled();
}

test('the first Play after setting a passage with nothing loaded starts at its start verse', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);
  store().resetPlayback();
  store().setRepeatPassage(JOHN_3_16_TO_18);
  await passageSettled();

  await player.rerender().togglePlayPause();

  assert.deepEqual(playerCalls('loadAndPlay').at(-1)?.args, [
    'https://cdn.example/bsb/JHN/3.mp3',
    1,
    JOHN_3_16_MS,
  ]);
});

test("the reader's Play on a chapter outside a passage just set starts the passage", async () => {
  const player = mountPlayer();
  store().setRepeatPassage(JOHN_3_16_TO_18);
  await passageSettled();

  await player.rerender().playChapter('GEN', 1);

  assert.equal(store().currentBookId, 'JHN');
  assert.equal(loadedStartOffset(), JOHN_3_16_MS);

  // Only the first Play: the listener's next pick plays as asked.
  await player.rerender().playChapter('GEN', 1);
  assert.equal(store().currentBookId, 'GEN');
  assert.equal(loadedStartOffset(), 0);
});

test('a passage repeating since an earlier session does not redirect Play', async () => {
  const player = mountPlayer();
  useAudioStore.setState({ repeatMode: 'passage', repeatPassage: JOHN_3_16_TO_18 });
  // As after a relaunch: the passage was persisted, nothing was set in this session.
  const { resetPassageRepeatState } = await import('./audioPlayer/passageRepeat');
  resetPassageRepeatState();

  await player.rerender().playChapter('GEN', 1);

  assert.equal(store().currentBookId, 'GEN');
  assert.equal(loadedStartOffset(), 0);
});

test('native progress past the end verse seeks back to the start verse', async () => {
  const player = mountPlayer();
  useAudioStore.setState({ repeatMode: 'passage', repeatPassage: JOHN_3_16_TO_18 });
  await player.rerender().playChapterForTranslation('bsb', 'JHN', 3, undefined, {
    startPositionMs: JOHN_3_16_MS,
  });
  recorded.player.length = 0;

  const playing = { isPlaying: true, durationMillis: DEFAULT_DURATION_MS };
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 4_000 }); // loads the timings
  await passageSettled();
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 3_000 });
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 2_000 });
  assert.deepEqual(playerCalls('seekTo'), []);
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS + 500 });
  await passageSettled();

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [JOHN_3_16_MS] }]);
  assert.equal(store().currentPosition, JOHN_3_16_MS);
  assert.equal(playerCalls('loadAndPlay').length, 0);
});

for (const takeover of ['chapter', 'stop', 'sleep timer then chapter', 'seek', 'skip'] as const) {
  test(`a pending passage loop seek cannot overwrite ${takeover}`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
    const player = mountPlayer();
    useAudioStore.setState({ repeatMode: 'passage', repeatPassage: JOHN_3_16_TO_18 });
    await player.api.playChapterForTranslation('bsb', 'JHN', 3, undefined, {
      startPositionMs: JOHN_3_16_MS,
    });
    const playing = { isPlaying: true, durationMillis: DEFAULT_DURATION_MS };
    emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 4_000 });
    await passageSettled();
    if (takeover === 'sleep timer then chapter') {
      store().setSleepTimer(5);
      player.rerender();
    }

    const gate = deferPlayerOperation();
    playerGates.set('seek', gate.promise);
    emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 3_000 });
    emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 2_000 });
    emitStatus({ ...playing, positionMillis: JOHN_3_19_MS + 500 });
    await flushPlayerOperations();
    assert.equal(playerCalls('seekTo').at(-1)?.args[0], JOHN_3_16_MS);

    if (takeover === 'sleep timer then chapter') {
      tickSeconds(t.mock.timers, 5 * 60);
      assert.equal(store().status, 'paused');
      assert.equal(store().sleepTimerEndTime, null);
    }
    playerGates.delete('seek');
    if (takeover === 'stop') {
      await player.api.stop();
    } else if (takeover === 'seek') {
      await player.api.seekTo(200_000);
    } else if (takeover === 'skip') {
      await player.api.skipForward();
    } else {
      await player.api.playChapterForTranslation('bsb', 'MRK', 2);
    }
    const positionAfterTakeover = store().currentPosition;
    gate.resolve();
    await passageSettled();

    assert.equal(
      store().currentPosition,
      positionAfterTakeover,
      'the newer command owns the position'
    );
    if (takeover === 'stop') {
      assert.equal(store().status, 'idle');
    } else if (takeover === 'seek' || takeover === 'skip') {
      assert.equal(store().currentBookId, 'JHN');
      assert.equal(store().currentChapter, 3);
      assert.equal(store().lastPosition, positionAfterTakeover);
    } else {
      assert.equal(store().currentBookId, 'MRK');
      assert.equal(store().currentChapter, 2);
      assert.equal(store().lastPosition, 0, 'the newer chapter owns its durable resume point');
    }
  });
}

test('a seek past the end verse plays on, and the chapter end returns to the start verse', async () => {
  const player = mountPlayer();
  useAudioStore.setState({ repeatMode: 'passage', repeatPassage: JOHN_3_16_TO_18 });
  await player.rerender().playChapterForTranslation('bsb', 'JHN', 3, undefined, {
    startPositionMs: JOHN_3_16_MS,
  });
  const playing = { isPlaying: true, durationMillis: DEFAULT_DURATION_MS };
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS - 5_000 });
  await passageSettled();

  await player.rerender().seekTo(JOHN_3_19_MS + 1_000);
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS + 1_000 });
  emitStatus({ ...playing, positionMillis: JOHN_3_19_MS + 2_000 });
  await passageSettled();
  assert.deepEqual(
    playerCalls('seekTo').map((call) => call.args[0]),
    [JOHN_3_19_MS + 1_000]
  );

  recorded.player.length = 0;
  await finishPlayback();
  assert.equal(store().currentChapter, 3);
  assert.equal(loadedStartOffset(), JOHN_3_16_MS);
});

// ---------------------------------------------------------------------------
// Selah: the narration held paused while the music bed plays on
// ---------------------------------------------------------------------------

/**
 * GEN 1 playing at 42 s with a background sound on, then Selah turned on and its fade
 * run out. Returns where the narration should pick up (BSB has verse timings).
 */
async function holdGenesisInSelah(t: { mock: { timers: MockTimers } }): Promise<number> {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 42_000, durationMillis: DEFAULT_DURATION_MS });
  const { toggleSelah } = await import('./audioPlayer/selah');
  const entering = toggleSelah();
  t.mock.timers.tick(750);
  await entering;
  const { loadChapterVerseTimings } = await import('./audioPlayer/passageRepeat');
  const { resolveSelahResumePositionMs } = await import('../stores/audioSelahModel');
  const timings = await loadChapterVerseTimings('bsb', 'GEN', 1);
  recorded.player.length = 0;
  recorded.backgroundMusic.length = 0;
  return resolveSelahResumePositionMs(42_000, timings);
}

test('Selah pauses the narration, keeps the bed playing and shows paused on the lock screen', async (t) => {
  await holdGenesisInSelah(t);

  assert.equal(store().selahActive, true);
  assert.equal(store().status, 'paused');
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, false);
  assert.equal(
    recorded.backgroundMusic.some((call) => call.method === 'stop' || call.shouldPlay === false),
    false
  );
  assert.equal(recorded.narrationVolumes.at(-1), 1, 'paused at the Voice level again');
});

test('a progress report still on its way from before the pause does not end Selah', async (t) => {
  await holdGenesisInSelah(t);

  // The native player reports "playing" once more before its pause takes effect (seen on
  // the iOS simulator): the reading is being held, so that report must not revive it.
  emitStatus({ isPlaying: true, positionMillis: 42_100, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(store().selahActive, true);
  assert.equal(store().status, 'paused');
});

test('a late "playing" report after a normal pause does not flip the player back', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 42_000, durationMillis: DEFAULT_DURATION_MS });

  await player.rerender().togglePlayPause();
  assert.equal(store().status, 'paused');
  emitStatus({ isPlaying: true, positionMillis: 42_100, durationMillis: DEFAULT_DURATION_MS });

  assert.equal(store().status, 'paused');
});

test('lock-screen Play with the reader closed resumes out of Selah a little earlier', async (t) => {
  const pickUpAt = await holdGenesisInSelah(t);
  runtime.unmountAll();

  await remoteCommandListener?.({ command: 'play' });
  t.mock.timers.tick(750);

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [pickUpAt] }]);
  assert.equal(pickUpAt < 42_000 && pickUpAt >= 42_000 - 6_000, true);
  assert.equal(playerCalls('resume').length, 1);
  assert.equal(store().status, 'playing');
  assert.equal(store().selahActive, false);
  assert.equal(recorded.narrationVolumes.at(-1), 1, 'faded back in to the Voice level');
  assert.equal(recorded.nowPlaying.at(-1)?.isPlaying, true);
});

test('Play in the reader resumes out of Selah the same way', async (t) => {
  const pickUpAt = await holdGenesisInSelah(t);

  await mountPlayer().api.togglePlayPause();
  t.mock.timers.tick(750);

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [pickUpAt] }]);
  assert.equal(store().selahActive, false);
});

test('a lock-screen Pause during Selah ends it and pauses the bed', async (t) => {
  await holdGenesisInSelah(t);

  await remoteCommandListener?.({ command: 'pause' });

  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'paused');
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: false,
  });
});

for (const takeover of ['chapter', 'stop'] as const) {
  test(`a pending Selah pick-up seek cannot write position after newer ${takeover}`, async (t) => {
    const resumeAt = await holdGenesisInSelah(t);
    const player = mountPlayer();
    const gate = deferPlayerOperation();
    playerGates.set('seek', gate.promise);
    const resuming = remoteCommandListener?.({ command: 'play' });
    await settleUntil(() => playerCalls('seekTo').length === 1);
    assert.equal(playerCalls('seekTo')[0]?.args[0], resumeAt);
    if (takeover === 'chapter') await player.api.playChapter('JHN', 3);
    else await player.api.stop();
    assert.equal(store().currentPosition, 0);
    const lastPositionAfterTakeover = store().lastPosition;
    gate.resolve();
    await resuming;
    assert.equal(store().currentPosition, 0);
    assert.equal(store().lastPosition, lastPositionAfterTakeover);
  });
}

for (const newer of ['seek', 'skip'] as const) {
  test(`a newer ${newer} owns position while a Selah resume seek is pending`, async (t) => {
    await holdGenesisInSelah(t);
    const player = mountPlayer();
    const gate = deferPlayerOperation();
    playerGates.set('seek', gate.promise);
    const resuming = remoteCommandListener?.({ command: 'play' });
    await settleUntil(() => playerCalls('seekTo').length === 1);
    playerGates.delete('seek');
    if (newer === 'seek') await player.api.seekTo(10_000);
    else await player.api.skipBackward();
    const chosenPosition = store().currentPosition;
    gate.resolve();
    await resuming;
    assert.equal(store().currentPosition, chosenPosition);
    assert.equal(recorded.nowPlaying.at(-1)?.positionMs, chosenPosition);
    assert.equal(store().status, 'playing');
    assert.equal(store().selahActive, false);
    t.mock.timers.tick(750);
    assert.equal(recorded.narrationVolumes.at(-1), 1);
  });
}

test('a normal resume publishes the newer scrub position instead of its old pick-up point', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  emitStatus({ isPlaying: true, positionMillis: 42_000, durationMillis: DEFAULT_DURATION_MS });
  await player.api.pause();
  const gate = deferPlayerOperation();
  playerGates.set('seek', gate.promise);
  const resuming = remoteCommandListener?.({ command: 'play' });
  await settleUntil(() => playerCalls('seekTo').length === 1);
  playerGates.delete('seek');
  await player.api.seekTo(10_000);
  gate.resolve();
  await resuming;
  assert.equal(store().currentPosition, 10_000);
  assert.equal(recorded.nowPlaying.at(-1)?.positionMs, 10_000);
  assert.equal(store().status, 'playing');
});

test('a scrub during Selah silencing is not followed by the older pick-up seek', async (t) => {
  await holdGenesisInSelah(t);
  const player = mountPlayer();
  const gate = deferPlayerOperation();
  playerGates.set('volume:0', gate.promise);
  const resuming = remoteCommandListener?.({ command: 'play' });
  await settleUntil(() => recorded.narrationVolumes.at(-1) === 0);
  await player.api.seekTo(10_000);
  gate.resolve();
  await resuming;
  assert.deepEqual(
    playerCalls('seekTo').map((call) => call.args[0]),
    [10_000]
  );
  assert.equal(store().currentPosition, 10_000);
  assert.equal(recorded.nowPlaying.at(-1)?.positionMs, 10_000);
  assert.equal(store().status, 'playing');
  t.mock.timers.tick(750);
  await flushPlayerOperations();
});

test('a Selah resume leaves the interpolation anchor of a still-pending newer scrub intact', async (t) => {
  await holdGenesisInSelah(t);
  const player = mountPlayer();
  const oldGate = deferPlayerOperation();
  playerGates.set('seek', oldGate.promise);
  const resuming = remoteCommandListener?.({ command: 'play' });
  await settleUntil(() => playerCalls('seekTo').length === 1);
  // A native playing report starts interpolation while resume's seek is still settling.
  emitStatus({ isPlaying: true, positionMillis: 42_000, durationMillis: DEFAULT_DURATION_MS });
  const newGate = deferPlayerOperation();
  playerGates.set('seek', newGate.promise);
  const seeking = player.api.seekTo(10_000);
  oldGate.resolve();
  await resuming;
  newGate.resolve();
  await seeking;
  t.mock.timers.tick(250);
  assert.equal(store().currentPosition, 10_250);
  assert.equal(store().status, 'playing');
  t.mock.timers.tick(500);
  await flushPlayerOperations();
});

test('a sleep timer running out during Selah, reader closed, ends everything', async (t) => {
  await holdGenesisInSelah(t);
  store().setSleepTimer(5);
  runtime.unmountAll();

  t.mock.timers.tick(5 * 60_000);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(store().selahActive, false);
  assert.equal(store().sleepTimerMinutes, null);
  assert.deepEqual(recorded.backgroundMusic.at(-1), {
    method: 'sync',
    choice: 'piano',
    shouldPlay: false,
  });
});

test('stopping during Selah ends it', async (t) => {
  await holdGenesisInSelah(t);

  await remoteCommandListener?.({ command: 'stop' });

  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'idle');
});

test('the sleep timer countdown keeps moving on screen during Selah', async (t) => {
  await holdGenesisInSelah(t);
  const player = mountPlayer();
  player.api.startSleepTimer(5);
  player.rerender();

  t.mock.timers.tick(2 * 60_000);

  assert.equal(player.rerender().sleepTimerRemaining, 3);
  await remoteCommandListener?.({ command: 'pause' });
});

test('the lock-screen play/pause button resumes out of Selah', async (t) => {
  const pickUpAt = await holdGenesisInSelah(t);

  await remoteCommandListener?.({ command: 'toggle' });

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [pickUpAt] }]);
  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'playing');
});

test('Gather handoff pauses the live Bible transport and waits for its native pause and ambient stop', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setBackgroundMusicChoice('piano');
  recorded.backgroundMusic.length = 0;
  const gate = deferPlayerOperation();
  playerGates.set('pause', gate.promise);
  const lesson = claimNarration('lesson', {}, async () => {});
  assert.equal(
    store().status,
    'paused',
    'registered high-level pause claims Bible intent immediately'
  );
  let ready = false;
  void lesson.ready.then(() => {
    ready = true;
  });
  await Promise.resolve();
  assert.equal(ready, false, 'lesson cannot start while the old native pause is pending');
  playerGates.delete('pause');
  gate.resolve();
  await lesson.ready;
  assert.equal(ready, true);
  assert.ok(playerCalls('pause').length >= 1);
  assert.deepEqual(recorded.backgroundMusic.at(-1), { method: 'stop' });
  assert.equal(store().backgroundMusicChoice, 'piano', 'handoff preserves the selected bed');
});

test('a new Bible Play releases a Gather sound before starting narration', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  let lessonPlaying = false;
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  await owner.play(async () => ({
    playAsync: async () => {
      lessonPlaying = true;
    },
    unloadAsync: async () => {
      lessonPlaying = false;
    },
  }));
  assert.equal(lessonPlaying, true);
  await player.api.playChapter('GEN', 1);
  assert.equal(lessonPlaying, false);
  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('loadAndPlay').length, 1);
});

test('remote Play takes Bible ownership back from Gather without leaving its sound playing', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  let lessonPlaying = false;
  await owner.play(async () => ({
    playAsync: async () => {
      lessonPlaying = true;
    },
    unloadAsync: async () => {
      lessonPlaying = false;
    },
  }));
  assert.equal(lessonPlaying, true);
  await remoteCommandListener?.({ command: 'play' });
  assert.equal(lessonPlaying, false);
  assert.equal(store().status, 'playing');
});

test('remote Play waits for a contributor voice note to release before resuming Bible narration', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  let finishRelease!: () => void;
  const release = new Promise<void>((resolve) => {
    finishRelease = resolve;
  });
  let feedbackActive = true;
  const feedback = claimNarration('feedback', {}, async () => {
    await release;
    feedbackActive = false;
  });
  await feedback.ready;
  assert.equal(store().status, 'paused');

  const resumed = remoteCommandListener?.({ command: 'play' });
  await Promise.resolve();
  assert.equal(feedbackActive, true);
  assert.equal(store().status, 'paused', 'Bible must wait for contributor native teardown');
  finishRelease();
  await resumed;
  assert.equal(feedbackActive, false);
  assert.equal(store().status, 'playing');
});

test('Pause during a pending Gather-to-Bible handoff cancels the waiting Bible start', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  const gate = deferPlayerOperation();
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  await owner.play(async () => ({ playAsync: async () => {}, unloadAsync: () => gate.promise }));
  const bible = player.api.playChapter('GEN', 1);
  await player.api.pause();
  gate.resolve();
  await bible;
  assert.equal(playerCalls('loadAndPlay').length, 0);
  assert.equal(store().status, 'paused');
});

test('Stop during a pending Gather-to-Bible handoff cancels the waiting Bible start', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  const gate = deferPlayerOperation();
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  await owner.play(async () => ({ playAsync: async () => {}, unloadAsync: () => gate.promise }));
  const bible = player.api.playChapter('GEN', 1);
  await player.api.stop();
  gate.resolve();
  await bible;
  assert.equal(playerCalls('loadAndPlay').length, 0);
  assert.equal(store().status, 'idle');
});

test('Bible waits for a Gather native Play already in flight before taking over', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  const gate = deferPlayerOperation();
  let audible = false;
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  const pendingLesson = owner.play(async () => ({
    playAsync: async () => {
      await gate.promise;
      audible = true;
    },
    unloadAsync: async () => {
      audible = false;
    },
  }));
  await Promise.resolve();
  const bible = player.api.playChapter('GEN', 1);
  await Promise.resolve();
  assert.equal(playerCalls('loadAndPlay').length, 0);
  gate.resolve();
  assert.equal(await pendingLesson, false);
  await bible;
  assert.equal(audible, false);
  assert.equal(store().status, 'playing');
});

test('failed Gather release blocks Bible Play and a later explicit Play retries it', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const { createLessonSoundOwner } = await import('../screens/learn/lessonSoundOwner');
  const player = mountPlayer();
  const owner = createLessonSoundOwner<{
    playAsync: () => Promise<void>;
    unloadAsync: () => Promise<void>;
  }>();
  let attempts = 0;
  const lesson = claimNarration('lesson', owner, () => owner.release());
  await lesson.ready;
  await owner.play(async () => ({
    playAsync: async () => {},
    unloadAsync: async () => {
      if (++attempts === 1) throw new Error('unload failed');
    },
  }));
  await player.api.playChapter('GEN', 1);
  assert.equal(playerCalls('loadAndPlay').length, 0, 'a failed outgoing release cannot overlap');
  await player.api.playChapter('GEN', 1);
  assert.equal(attempts, 2);
  assert.equal(playerCalls('loadAndPlay').length, 1);
  assert.equal(store().status, 'playing');
});

test('failed Bible suspension blocks Gather Play and its next claim retries pause', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  playerGates.set('pause', Promise.reject(new Error('native pause failed')));
  const lessonOwner = {};
  const first = claimNarration('lesson', lessonOwner, async () => {});
  await assert.rejects(first.ready, /native pause failed/);
  playerGates.delete('pause');
  const retry = claimNarration('lesson', lessonOwner, async () => {});
  await retry.ready;
  assert.equal(retry.isCurrent(), true);
  assert.equal(playerCalls('pause').length, 2);
});

test('Bible-lesson-Bible rapid alternation gives the last Bible Play the sound', async () => {
  const { claimNarration } = await import('../services/audio/narrationOwnership');
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  playerGates.set('pause', gate.promise);
  const lesson = claimNarration('lesson', {}, async () => {});
  const nextBible = player.api.playChapter('GEN', 2);
  assert.equal(lesson.isCurrent(), false);
  assert.equal(playerCalls('loadAndPlay').length, 1, 'new Bible waits for the old pause');
  playerGates.delete('pause');
  gate.resolve();
  await Promise.all([lesson.ready, nextBible]);
  assert.equal(store().status, 'playing');
  assert.equal(store().currentChapter, 2);
  assert.equal(playerCalls('loadAndPlay').length, 2);
});

const startLiveAmbient = async () => {
  const { backgroundMusicPlayer } = await import('../services/audio/backgroundMusicPlayer');
  liveAmbientPlayer = backgroundMusicPlayer;
  ambientNativeSounds.length = 0;
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setBackgroundMusicChoice('piano');
  await flushPlayerOperations();
  return player;
};

for (const detached of ['paused crossfade', 'Sound Off'] as const) {
  test(`feedback handoff waits for ambient cleanup already detached by ${detached}`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
    const { claimNarration } = await import('../services/audio/narrationOwnership');
    const player = await startLiveAmbient();
    const gate = deferPlayerOperation();
    try {
      t.mock.timers.tick(2500);
      const first = assertDefined(ambientNativeSounds[0], 'first ambient loop');
      first.stopGate = gate.promise;
      if (detached === 'paused crossfade') {
        store().setBackgroundMusicChoice('harp');
        await flushPlayerOperations();
        t.mock.timers.tick(100);
        store().setBackgroundMusicChoice('flute');
        await flushPlayerOperations();
        t.mock.timers.tick(100);
        assert.equal(assertDefined(ambientNativeSounds[1], 'second ambient loop').playing, true);
        assert.ok(assertDefined(ambientNativeSounds[1], 'second ambient loop').volume > 0);
      } else {
        store().setBackgroundMusicChoice('off');
      }
      const feedback = claimNarration('feedback', {}, async () => {});
      let ready = false;
      void feedback.ready.then(() => {
        ready = true;
      });
      await flushPlayerOperations();
      const readyBeforeCleanup = ready;
      assert.equal(
        first.playing,
        false,
        'first native stop applies before its delayed JS response'
      );
      gate.resolve();
      await feedback.ready;
      await flushPlayerOperations();
      assert.equal(
        readyBeforeCleanup,
        false,
        'a recorder must not start while old ambient cleanup is pending'
      );
      assert.ok(ambientNativeSounds.every((sound) => !sound.playing && !sound.loaded));
      assert.ok(ambientNativeSounds.every((sound) => sound.unloadCalls === 1));
      assert.equal(
        store().backgroundMusicChoice,
        detached === 'paused crossfade' ? 'flute' : 'off'
      );
    } finally {
      gate.resolve();
      await liveAmbientPlayer?.stop();
      liveAmbientPlayer = null;
      await player.api.stop();
    }
  });
}

for (const ending of ['pause', 'sleep expiry'] as const) {
  test(`ordinary ${ending} silences real ambient crossfades while preserving the selected preset`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
    const player = await startLiveAmbient();
    try {
      t.mock.timers.tick(2500);
      store().setBackgroundMusicChoice('harp');
      await flushPlayerOperations();
      t.mock.timers.tick(100);
      store().setBackgroundMusicChoice('flute');
      await flushPlayerOperations();
      t.mock.timers.tick(100);
      if (ending === 'pause') await player.api.pause();
      else {
        store().setSleepTimer('end-of-chapter');
        await finishPlayback();
      }
      await flushPlayerOperations();
      assert.equal(store().status, ending === 'pause' ? 'paused' : 'idle');
      assert.equal(store().backgroundMusicChoice, 'flute');
      assert.ok(ambientNativeSounds.every((sound) => !sound.playing));
    } finally {
      await liveAmbientPlayer?.stop();
      liveAmbientPlayer = null;
      await player.api.stop();
    }
  });
}

async function waitForCompletionCoverage(translationId: string): Promise<void> {
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes(translationId); i += 1) {
    await flushPlayerOperations();
  }
  assert.ok(
    recorded.coverageLookups.includes(translationId),
    `${translationId} coverage is pending`
  );
}

test('completion queue edit: an item appended while skipped queued coverage resolves is retained and played', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ PSA: [117] });
  store().setAutoAdvanceChapter(true);
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes(SPARSE_EL); i += 1)
    await flushPlayerOperations();
  assert.ok(
    recorded.coverageLookups.includes(SPARSE_EL),
    'queued sparse translation manifest is pending'
  );
  player.api.addToQueue('PSA', 23);
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.ok(store().queue.some((entry) => entry.id === 'bsb:PSA:23'));
});

test('completion queue control: queue entry appended before completion survives a skipped sparse chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ PSA: [117] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  player.api.addToQueue('PSA', 23);
  await finishPlayback();
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.ok(store().queue.some((entry) => entry.id === 'bsb:PSA:23'));
});
test('completion queue control: appending during valid next-entry coverage preserves the live queue', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ GEN: [2] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  const finishing = finishPlayback();
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes(SPARSE_EL); i += 1)
    await flushPlayerOperations();
  player.api.addToQueue('PSA', 23);
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().currentTranslationId, SPARSE_EL);
  assert.equal(store().currentChapter, 2);
  assert.ok(store().queue.some((entry) => entry.id === 'bsb:PSA:23'));
});

test('completion queue edit: append during linear coverage is played without replacing the queue', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  store().setAutoAdvanceChapter(true);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes('bsb'); i += 1)
    await flushPlayerOperations();
  assert.ok(recorded.coverageLookups.includes('bsb'));
  player.api.addToQueue('PSA', 23);
  const admittedQueue = store().queue.map((entry) => entry.id);
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    admittedQueue
  );
});

test('completion queue edit: removing the pending candidate cannot dispatch the removed chapter', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ GEN: [2] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  player.api.addToQueue('PSA', 23);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes(SPARSE_EL); i += 1)
    await flushPlayerOperations();
  assert.ok(recorded.coverageLookups.includes(SPARSE_EL));
  player.api.removeFromQueue(`${SPARSE_EL}:GEN:2`);
  const admittedQueue = store().queue.map((entry) => entry.id);
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    admittedQueue
  );
});

test('completion queue edit: removing finished anchor during coverage preserves edited queue and ends', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ GEN: [2] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  for (let i = 0; i < 30 && !recorded.coverageLookups.includes(SPARSE_EL); i += 1)
    await flushPlayerOperations();
  assert.ok(recorded.coverageLookups.includes(SPARSE_EL));
  player.api.removeFromQueue('bsb:GEN:1');
  const admittedQueue = store().queue.map((entry) => entry.id);
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 1);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    admittedQueue
  );
});

test('completion queue edit: live reorder selects its first available successor by ID', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ GEN: [2] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  player.api.addToQueue('PSA', 23);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  await waitForCompletionCoverage(SPARSE_EL);
  // No reorder UI exists yet; exercise the real store's queue replacement seam.
  const [finished, pending, appended] = store().queue;
  useAudioStore.setState({
    queue: [
      assertDefined(finished, 'finished entry'),
      assertDefined(appended, 'appended entry'),
      assertDefined(pending, 'pending entry'),
    ],
  });
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.equal(store().queueIndex, 1);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    ['bsb:GEN:1', 'bsb:PSA:23', `${SPARSE_EL}:GEN:2`]
  );
});

test('completion queue edit: successive coverage waits accept further additions without retrying resolved translations', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  addSparseTranslation({ PSA: [117] });
  bibleState.translations = [...bibleState.translations, { id: 'web', name: 'World English' }];
  scenario.liveCoverage.set('web', { PSA: [117] });
  store().addToQueue(SPARSE_EL, 'GEN', 2);
  const sparseGate = deferPlayerOperation();
  const webGate = deferPlayerOperation();
  scenario.coverageGate = sparseGate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  await waitForCompletionCoverage(SPARSE_EL);
  store().addToQueue('web', 'GEN', 3);
  scenario.coverageGate = webGate.promise;
  sparseGate.resolve();
  await waitForCompletionCoverage('web');
  player.api.addToQueue('PSA', 23);
  player.api.addToQueue('JHN', 3);
  const admittedQueue = store().queue.map((entry) => entry.id);
  scenario.coverageGate = null;
  webGate.resolve();
  await finishing;
  assert.equal(store().currentBookId, 'PSA');
  assert.equal(store().currentChapter, 23);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    admittedQueue
  );
  const persisted = JSON.parse(mmkv.store.get('audio-storage')!).state;
  assert.deepEqual(
    persisted.queue.map((entry: { id: string }) => entry.id),
    admittedQueue
  );
  assert.equal(recorded.coverageLookups.filter((id) => id === SPARSE_EL).length, 1);
  assert.equal(recorded.coverageLookups.filter((id) => id === 'web').length, 1);
});

for (const append of [false, true]) {
  test(`completion queue control: initially empty queue keeps ${append ? 'a new queued entry' : 'linear auto-advance'}`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('GEN', 1);
    player.api.clearQueue();
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage('bsb');
    if (append) player.api.addToQueue('PSA', 23);
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().status, 'playing');
    assert.equal(store().currentBookId, append ? 'PSA' : 'GEN');
    assert.equal(store().currentChapter, append ? 23 : 2);
  });
}

for (const command of ['pause', 'stop', 'play', 'nextChapter'] as const) {
  test(`completion queue control: ${command} owns playback despite additions during queued coverage`, async () => {
    const player = mountPlayer();
    await player.api.playChapter('GEN', 1);
    addSparseTranslation({ PSA: [117] });
    store().addToQueue(SPARSE_EL, 'GEN', 2);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    player.api.addToQueue('PSA', 23);
    const newer = command === 'play' ? player.api.playChapter('JHN', 3) : player.api[command]();
    scenario.coverageGate = null;
    gate.resolve();
    await Promise.all([finishing, newer]);
    if (command === 'play') {
      assert.equal(store().currentBookId, 'JHN');
      assert.equal(store().currentChapter, 3);
      assert.equal(store().status, 'playing');
    } else if (command === 'nextChapter') {
      assert.equal(store().currentBookId, 'GEN');
      assert.equal(store().currentChapter, 2);
      assert.equal(store().status, 'playing');
    } else {
      assert.equal(store().currentBookId, command === 'pause' ? 'GEN' : null);
      assert.equal(store().currentChapter, command === 'pause' ? 1 : null);
      assert.equal(store().status, command === 'pause' ? 'paused' : 'idle');
    }
  });
}

for (const paused of [false, true]) {
  for (const shiftedIndex of [false, true]) {
    test(`manual Next preserves a queued chapter added during coverage (${paused ? 'paused' : 'playing'}, ${shiftedIndex ? 'shifted index' : 'append'})`, async () => {
      addSparseTranslation({ GEN: [1, 5] });
      const player = mountPlayer(SPARSE_EL);
      await player.api.playChapter('GEN', 1);
      if (paused) await player.api.pause();
      if (shiftedIndex) {
        player.api.clearQueue();
        player.api.addToQueue('PSA', 23);
        player.api.addToQueue('GEN', 1);
        store().setQueueIndex(1);
      }
      const gate = deferPlayerOperation();
      scenario.coverageGate = gate.promise;
      recorded.coverageLookups.length = 0;
      const next = player.api.nextChapter();
      await waitForCompletionCoverage(SPARSE_EL);
      if (shiftedIndex) player.api.removeFromQueue(`${SPARSE_EL}:PSA:23`);
      store().addToQueue('web', 'REV', 22);
      const queueIds = store().queue.map((entry) => entry.id);
      gate.resolve();
      assert.deepEqual(await next, { bookId: 'REV', chapter: 22 });
      assert.equal(store().currentTranslationId, 'web');
      assert.equal(store().status, paused ? 'paused' : 'playing');
      assert.equal(store().queueIndex, 1);
      assert.deepEqual(
        store().queue.map((entry) => entry.id),
        queueIds
      );
      const persisted = JSON.parse(
        assertDefined(mmkv.store.get('audio-storage'), 'persisted audio queue')
      ) as {
        state: { queue: Array<{ id: string }>; queueIndex: number };
      };
      assert.deepEqual(
        persisted.state.queue.map((entry) => entry.id),
        queueIds
      );
      assert.equal(persisted.state.queueIndex, 1);
    });
  }
}

for (const direction of ['nextChapter', 'previousChapter'] as const) {
  test(`manual ${direction} uses ordinary sparse adjacency when an added queue entry was removed during coverage`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    const current = direction === 'nextChapter' ? 1 : 5;
    await player.api.playChapter('GEN', current);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const stepping = player.api[direction]();
    await waitForCompletionCoverage(SPARSE_EL);
    store().addToQueue('web', 'REV', 22);
    player.api.removeFromQueue('web:REV:22');
    gate.resolve();
    assert.deepEqual(await stepping, { bookId: 'GEN', chapter: current === 1 ? 5 : 1 });
    assert.equal(
      store().queue.some((entry) => entry.id === 'web:REV:22'),
      false
    );
  });

  test(`manual ${direction} respects a pinned session introduced while coverage resolves`, async () => {
    addSparseTranslation({ GEN: [1, 5, 50] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 5);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const stepping = player.api[direction]();
    await waitForCompletionCoverage(SPARSE_EL);
    store().addToQueue('web', 'REV', 22);
    const sequence = [
      { bookId: 'JHN', chapter: 3 },
      { bookId: 'GEN', chapter: 5 },
      { bookId: 'PSA', chapter: 23 },
    ];
    store().setPlaybackSequence(sequence);
    gate.resolve();
    assert.deepEqual(await stepping, direction === 'nextChapter' ? sequence[2] : sequence[0]);
    assert.deepEqual(store().playbackSequence, sequence);
    assert.equal(store().currentTranslationId, SPARSE_EL);
  });
}

test('manual Next retains a pinned boundary introduced while coverage resolves despite a new queued chapter', async () => {
  addSparseTranslation({ GEN: [1, 5] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const next = player.api.nextChapter();
  await waitForCompletionCoverage(SPARSE_EL);
  store().addToQueue('web', 'REV', 22);
  const sequence = [{ bookId: 'GEN', chapter: 1 }];
  store().setPlaybackSequence(sequence);
  const queueIds = store().queue.map((entry) => entry.id);
  const loadsBeforeResolve = playerCalls('loadAndPlay').length;
  gate.resolve();
  assert.equal(await next, null);
  assert.equal(store().currentChapter, 1);
  assert.deepEqual(store().playbackSequence, sequence);
  assert.deepEqual(
    store().queue.map((entry) => entry.id),
    queueIds
  );
  assert.equal(playerCalls('loadAndPlay').length, loadsBeforeResolve);
});

for (const command of ['nextChapter', 'previousChapter', 'play', 'pause'] as const) {
  test(`manual queued coverage control: newer ${command} keeps ownership after a queue append`, async () => {
    addSparseTranslation({ GEN: [1, 5, 50] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 5);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const olderNext = player.api.nextChapter();
    await waitForCompletionCoverage(SPARSE_EL);
    store().addToQueue('web', 'REV', 22);
    scenario.coverageGate = null;
    if (command === 'play') await player.api.playChapter('JHN', 3);
    else await player.api[command]();
    const current = {
      ...transportSnapshot(),
      queueIndex: store().queueIndex,
      queueIds: store().queue.map((entry) => entry.id),
    };
    const loadsBeforeResolve = playerCalls('loadAndPlay').length;
    gate.resolve();
    assert.equal(await olderNext, null);
    assert.deepEqual(
      {
        ...transportSnapshot(),
        queueIndex: store().queueIndex,
        queueIds: store().queue.map((entry) => entry.id),
      },
      current
    );
    assert.equal(playerCalls('loadAndPlay').length, loadsBeforeResolve);
  });
}

for (const path of [
  'linear',
  'replace minutes',
  'book repeat',
  'passage repeat',
  'queue',
] as const) {
  test(`a late End of chapter timer stops ${path} while finished coverage resolves`, async () => {
    addSparseTranslation({ GEN: [1, 5, 50] });
    const player = mountPlayer(SPARSE_EL);
    const current = path === 'book repeat' ? 50 : 1;
    await player.api.playChapter('GEN', current);
    if (path === 'replace minutes') player.api.startSleepTimer(30);
    if (path === 'book repeat') store().setRepeatMode('book');
    if (path === 'passage repeat') {
      store().setRepeatPassage({
        bookId: 'GEN',
        start: { chapter: 1, verse: 1 },
        end: { chapter: 1, verse: 2 },
      });
      await passageSettled();
    }
    if (path === 'queue') player.api.addToQueue('GEN', 5);
    emitStatus({ isPlaying: false, didJustFinish: true, positionMillis: DEFAULT_DURATION_MS });
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const loadsBefore = playerCalls('loadAndPlay').length;
    const heardBefore = recorded.listened.length;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    assert.equal(store().currentChapter, current);
    player.api.startSleepTimer('end-of-chapter');
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.deepEqual(
      {
        status: store().status,
        chapter: store().currentChapter,
        timer: store().sleepTimerMinutes,
        loads: playerCalls('loadAndPlay').length,
      },
      { status: 'idle', chapter: current, timer: null, loads: loadsBefore }
    );
    assert.equal(
      recorded.listened.length,
      heardBefore + 1,
      'the finished chapter still counts once'
    );
    await player.api.playChapter('GEN', 5);
    assert.equal(
      store().status,
      'playing',
      'explicit Play remains available after timer consumption'
    );
    assert.equal(store().sleepTimerMinutes, null);
  });
}

for (const replacement of [null, 15] as const) {
  test(`a late End of chapter choice replaced by ${replacement ?? 'Off'} permits normal advance`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    player.api.startSleepTimer('end-of-chapter');
    player.api.startSleepTimer(replacement);
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().currentChapter, 5);
    assert.equal(store().status, 'playing');
    assert.equal(store().sleepTimerMinutes, replacement);
  });
}

for (const command of ['nextChapter', 'play', 'pause'] as const) {
  test(`a newer ${command} retains its End of chapter choice after an old completion lookup`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    player.api.startSleepTimer('end-of-chapter');
    if (command === 'nextChapter') {
      store().addToQueue('web', 'REV', 22);
      await player.api.nextChapter();
    } else if (command === 'play') await player.api.playChapter('JHN', 3);
    else await player.api.pause();
    const latest = transportSnapshot();
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.deepEqual(transportSnapshot(), latest);
    assert.equal(
      store().sleepTimerMinutes,
      'end-of-chapter',
      'old EOF cannot consume replacement intent'
    );
    if (command !== 'pause') {
      await finishPlayback();
      assert.equal(store().status, 'idle');
      assert.equal(
        store().sleepTimerMinutes,
        null,
        'the replacement chapter consumes its own timer'
      );
    }
  });
}

test('a late End of chapter choice invalidates manual Next that has not claimed a target', async () => {
  addSparseTranslation({ GEN: [1, 5] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const finishing = finishPlayback();
  await waitForCompletionCoverage(SPARSE_EL);
  const next = player.api.nextChapter();
  player.api.startSleepTimer('end-of-chapter');
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(await next, null);
  assert.equal(store().currentChapter, 1);
  assert.equal(store().status, 'idle');
  assert.equal(store().sleepTimerMinutes, null);
});

test('replacing or canceling a countdown ignores its old deadline across background and foreground', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);
  player.api.startSleepTimer(5);
  player.rerender();
  tickSeconds(t.mock.timers, 4 * 60);
  player.api.startSleepTimer(15);
  rn.AppState.emit('background');
  tickSeconds(t.mock.timers, 60);
  emitStatus({ isPlaying: true, positionMillis: 300_000, durationMillis: DEFAULT_DURATION_MS });
  rn.AppState.emit('active');
  player.rerender();
  assert.equal(store().status, 'playing');
  assert.equal(store().sleepTimerMinutes, 15);
  assert.equal(playerCalls('pause').length, 0);
  player.api.clearSleepTimer();
  tickSeconds(t.mock.timers, 15 * 60);
  emitStatus({ isPlaying: true, positionMillis: 300_000, durationMillis: DEFAULT_DURATION_MS });
  assert.equal(store().status, 'playing');
  assert.equal(playerCalls('pause').length, 0);
});

for (const changed of [true, false]) {
  test(`completion repeat choice: book repeat ${changed ? 'turned Off' : 'unchanged'} during manifest wait`, async () => {
    addSparseTranslation({ GEN: [1, 50], EXO: [1] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 50);
    player.api.setRepeatMode('book');
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    if (changed) player.api.setRepeatMode('off');
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().repeatMode, changed ? 'off' : 'book');
    assert.deepEqual(
      { book: store().currentBookId, chapter: store().currentChapter, status: store().status },
      { book: changed ? 'EXO' : 'GEN', chapter: 1, status: 'playing' }
    );
  });
}

for (const changed of [true, false]) {
  test(`completion repeat choice: chapter repeat ${changed ? 'selected' : 'not selected'} during adjacency wait`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    if (changed) player.api.setRepeatMode('chapter');
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().repeatMode, changed ? 'chapter' : 'off');
    assert.equal(store().currentChapter, changed ? 1 : 5);
    assert.equal(store().status, 'playing');
  });
}

for (const changed of [true, false]) {
  test(`completion repeat choice: passage repeat ${changed ? 'turned Off' : 'unchanged'} during passage wait`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    store().setRepeatPassage({
      bookId: 'GEN',
      start: { chapter: 1, verse: 1 },
      end: { chapter: 1, verse: 2 },
    });
    await passageSettled();
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    if (changed) player.api.setRepeatMode('off');
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().repeatMode, changed ? 'off' : 'passage');
    assert.equal(store().currentChapter, changed ? 5 : 1);
    assert.equal(store().status, 'playing');
  });
}

for (const changed of [true, false]) {
  test(`completion repeat choice: passage range ${changed ? 'changed' : 'unchanged'} while passage manifest resolves`, async () => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    store().setRepeatPassage({
      bookId: 'GEN',
      start: { chapter: 1, verse: 1 },
      end: { chapter: 5, verse: 2 },
    });
    await passageSettled();
    const gate = deferPlayerOperation();
    scenario.coverageGate = gate.promise;
    recorded.coverageLookups.length = 0;
    const finishing = finishPlayback();
    await waitForCompletionCoverage(SPARSE_EL);
    if (changed)
      store().setRepeatPassage({
        bookId: 'GEN',
        start: { chapter: 1, verse: 1 },
        end: { chapter: 1, verse: 2 },
      });
    await passageSettled();
    assert.equal(
      store().currentChapter,
      1,
      'changing an in-chapter passage does not itself load a different chapter'
    );
    scenario.coverageGate = null;
    gate.resolve();
    await finishing;
    assert.equal(store().repeatMode, 'passage');
    assert.equal(store().currentChapter, changed ? 1 : 5);
    assert.equal(store().status, 'playing');
  });
}

test('completion repeat choice: rapid chip edits commit only the last mode', async () => {
  addSparseTranslation({ GEN: [1, 50], EXO: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 50);
  player.api.setRepeatMode('book');
  const gate = deferPlayerOperation();
  scenario.coverageGate = gate.promise;
  recorded.coverageLookups.length = 0;
  const heardBefore = recorded.listened.length;
  const finishing = finishPlayback();
  await waitForCompletionCoverage(SPARSE_EL);
  player.api.setRepeatMode('off');
  player.api.setRepeatMode('book');
  player.api.setRepeatMode('chapter');
  scenario.coverageGate = null;
  gate.resolve();
  await finishing;
  assert.equal(store().repeatMode, 'chapter');
  assert.equal(store().currentChapter, 50);
  assert.equal(store().status, 'playing');
  assert.equal(recorded.listened.length, heardBefore + 1);
  assert.equal(
    recorded.coverageLookups.filter((id) => id === SPARSE_EL).length,
    2,
    'completion resolves coverage once; the explicit load also checks coverage'
  );
});

test('completion repeat choice: edits across queue and book lookups keep the latest mode', async () => {
  addSparseTranslation({ GEN: [1, 5] });
  bibleState.translations.push({ id: 'web', name: 'World English Bible' });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  store().addToQueue('web', 'REV', 22);
  const queueGate = deferPlayerOperation();
  const bookGate = deferPlayerOperation();
  scenario.coverageGate = queueGate.promise;
  recorded.coverageLookups.length = 0;
  const loadsBefore = playerCalls('loadAndPlay').length;
  const heardBefore = recorded.listened.length;
  const finishing = finishPlayback();
  try {
    await waitForCompletionCoverage('web');
    player.api.setRepeatMode('book');
    scenario.coverageGate = bookGate.promise;
    queueGate.resolve();
    await waitForCompletionCoverage(SPARSE_EL);
    player.api.setRepeatMode('chapter');
    player.api.setRepeatMode('off');
    player.api.setRepeatMode('chapter');
    scenario.coverageGate = null;
    bookGate.resolve();
    await finishing;
    assert.deepEqual(
      {
        translation: store().currentTranslationId,
        book: store().currentBookId,
        chapter: store().currentChapter,
      },
      { translation: SPARSE_EL, book: 'GEN', chapter: 1 }
    );
    assert.equal(store().status, 'playing');
    assert.equal(playerCalls('loadAndPlay').length, loadsBefore + 1);
    assert.equal(recorded.listened.length, heardBefore + 1);
  } finally {
    scenario.coverageGate = null;
    queueGate.resolve();
    bookGate.resolve();
    await finishing;
  }
});

test('completion repeat choice: a settled empty passage falls through to the queued chapter once', async () => {
  addSparseTranslation({ GEN: [1] });
  const player = mountPlayer(SPARSE_EL);
  await player.api.playChapter('GEN', 1);
  store().setRepeatPassage({
    bookId: 'GEN',
    start: { chapter: 2, verse: 1 },
    end: { chapter: 2, verse: 2 },
  });
  await passageSettled();
  store().addToQueue('web', 'REV', 22);
  recorded.coverageLookups.length = 0;
  await finishPlayback();
  assert.deepEqual(
    {
      translation: store().currentTranslationId,
      book: store().currentBookId,
      chapter: store().currentChapter,
    },
    { translation: 'web', book: 'REV', chapter: 22 }
  );
  assert.equal(store().status, 'playing');
  assert.equal(recorded.coverageLookups.filter((id) => id === SPARSE_EL).length, 1);
});

test('completion repeat choice: undefined book coverage is cached and retains ordinary book repeat', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 50);
  player.api.setRepeatMode('book');
  recorded.coverageLookups.length = 0;
  await finishPlayback();
  assert.equal(store().currentChapter, 1);
  assert.equal(store().status, 'playing');
  assert.equal(recorded.coverageLookups.filter((id) => id === 'bsb').length, 2);
});

for (const changed of [true, false]) {
  test(`completion repeat choice: passage ${changed ? 'turned Off' : 'unchanged'} while verse timings resolve`, async (t) => {
    addSparseTranslation({ GEN: [1, 5] });
    const player = mountPlayer(SPARSE_EL);
    await player.api.playChapter('GEN', 1);
    store().setRepeatPassage({
      bookId: 'GEN',
      start: { chapter: 1, verse: 1 },
      end: { chapter: 1, verse: 2 },
    });
    await passageSettled();
    const { resetPassageRepeatState } = await import('./audioPlayer/passageRepeat');
    const timingService = await import('../services/bible/verseTimestamps');
    resetPassageRepeatState();
    timingService.setVerseTimestampMetadataResolver((id) => ({
      id,
      hasTiming: true,
      timing: {
        strategy: 'stream-template',
        baseUrl: 'https://cdn.example/timings',
        chapterPathTemplate: '{bookId}/{chapter}.json',
      },
    }));
    const gate = deferPlayerOperation();
    const fetchTimings = t.mock.method(globalThis, 'fetch', async () => {
      await gate.promise;
      return new Response(JSON.stringify({ 1: 0, 2: 3, 3: 6 }), { status: 200 });
    });
    const finishing = finishPlayback();
    try {
      for (let i = 0; i < 30 && fetchTimings.mock.callCount() === 0; i += 1) {
        await flushPlayerOperations();
      }
      assert.equal(fetchTimings.mock.callCount(), 1, 'the real timing service awaits its response');
      if (changed) player.api.setRepeatMode('off');
      gate.resolve();
      await finishing;
      assert.equal(store().currentChapter, changed ? 5 : 1);
      assert.equal(store().status, 'playing');
      assert.equal(store().repeatMode, changed ? 'off' : 'passage');
    } finally {
      gate.resolve();
      await finishing;
      fetchTimings.mock.restore();
      timingService.setVerseTimestampMetadataResolver(null);
      resetPassageRepeatState();
    }
  });
}

/** Real hook, facade and Expo-backed shim; only the native Sound is scripted. */
async function startNativeStreamHealthPlayer() {
  const player = mountPlayer();
  const { audioPlayer: realPlayer } = await import('../services/audio/audioPlayer');
  const originals = {
    loadAndPlay: audioPlayerDouble.loadAndPlay,
    pause: audioPlayerDouble.pause,
    resume: audioPlayerDouble.resume,
    stop: audioPlayerDouble.stop,
    verifyLoaded: audioPlayerDouble.verifyLoaded,
    isLoaded: audioPlayerDouble.isLoaded,
  };
  const nativeBefore = { ...integrationNativeStatus };
  integrationNativeReleased = false;
  integrationInitialPlayFailure = null;
  integrationStatusGate = null;
  integrationStatusCalls = 0;
  Object.assign(integrationNativeStatus, {
    positionMillis: 0,
    isPlaying: false,
    isBuffering: false,
    didJustFinish: false,
  });
  realPlayer.setCallbacks({ ...audioPlayerDouble.callbacks });
  audioPlayerDouble.loadAndPlay = async (url, rate, positionMs) => {
    recorded.player.push({ method: 'loadAndPlay', args: [url, rate, positionMs] });
    await realPlayer.loadAndPlay(url, rate, positionMs);
  };
  audioPlayerDouble.pause = () => realPlayer.pause();
  audioPlayerDouble.resume = () => realPlayer.resume();
  audioPlayerDouble.stop = () => realPlayer.stop();
  audioPlayerDouble.verifyLoaded = () => realPlayer.verifyLoaded();
  audioPlayerDouble.isLoaded = () => realPlayer.isLoaded();
  await player.api.playChapter('GEN', 1);
  Object.assign(integrationNativeStatus, { positionMillis: 90_000, isPlaying: true });
  nativeStatusListener?.({ ...integrationNativeStatus });
  player.rerender();
  const buffering = () => {
    Object.assign(integrationNativeStatus, { isPlaying: false, isBuffering: true });
    nativeStatusListener?.({ ...integrationNativeStatus });
  };
  const cleanup = async () => {
    integrationNativeReleased = false;
    integrationInitialPlayFailure = null;
    integrationStatusGate = null;
    // Stop through the hook as a closed reader's remote Stop would, draining
    // its shared listening telemetry as well as the native facade timer.
    await player.api.stop();
    await flushPlayerOperations();
    realPlayer.setCallbacks({});
    Object.assign(audioPlayerDouble, originals);
    Object.assign(integrationNativeStatus, nativeBefore);
  };
  return { player, realPlayer, buffering, cleanup };
}

for (const positionMs of [180_000, 0]) {
  test(`initial native Play failure: Retry recreates the released sound at ${positionMs}ms`, async () => {
    const native = await startNativeStreamHealthPlayer();
    try {
      await native.player.api.stop();
      coldStartAt(positionMs);
      integrationInitialPlayFailure = { error: new Error('Player does not exist.') };
      await native.player.rerender().togglePlayPause();
      assert.equal(store().status, 'error');
      assert.equal(store().currentPosition, positionMs);
      const createsBeforeRetry = integrationNativeCreates;

      await native.player.rerender().togglePlayPause();
      assert.equal(
        integrationNativeCreates,
        createsBeforeRetry + 1,
        'Retry must load the native sound dropped during initial Play'
      );
      assert.equal(store().status, 'playing');
      assert.equal(store().currentPosition, positionMs);
      assert.equal(native.realPlayer.isLoaded(), true);
    } finally {
      await native.cleanup();
    }
  });
}

test('initial native Play failure: a late rejection cannot poison a newer loaded chapter', async () => {
  const native = await startNativeStreamHealthPlayer();
  const gate = deferPlayerOperation();
  let loading: Promise<void> | undefined;
  try {
    await native.player.api.stop();
    coldStartAt(180_000);
    integrationInitialPlayFailure = {
      error: new Error('Player does not exist.'),
      response: gate.promise,
    };
    loading = native.player.rerender().togglePlayPause();
    await settleUntil(() => integrationInitialPlayFailure === null);
    await native.player.api.playChapter('GEN', 2);
    gate.resolve();
    await loading;
    assert.equal(store().currentChapter, 2);
    assert.equal(store().status, 'playing');
    assert.equal(store().error, null);
    assert.equal(native.realPlayer.isLoaded(), true);
  } finally {
    gate.resolve();
    await loading;
    await native.cleanup();
  }
});

for (const closedAt of ['before buffering', 'while buffering', 'never'] as const) {
  test(`stream health: real player detects native release with reader closed ${closedAt}`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
    const native = await startNativeStreamHealthPlayer();
    try {
      if (closedAt === 'before buffering') native.player.unmount();
      native.buffering();
      if (closedAt !== 'before buffering') native.player.rerender();
      if (closedAt === 'while buffering') native.player.unmount();
      integrationNativeReleased = true;
      t.mock.timers.tick(4_999);
      assert.equal(store().status, 'loading');
      assert.equal(integrationStatusCalls, 0);
      t.mock.timers.tick(1);
      await flushPlayerOperations();
      assert.equal(store().status, 'error');
      assert.equal(store().currentPosition, 90_000);
      assert.equal(store().error, 'interface.audioPlayFailed');
      assert.equal(integrationStatusCalls, 1);
      assert.equal(recorded.reports.length, 1);
      t.mock.timers.tick(10_000);
      await flushPlayerOperations();
      assert.equal(integrationStatusCalls, 1, 'released sound is checked only once');
      integrationNativeReleased = false;
      await dispatchRemoteCommand({ command: 'play' });
      assert.equal(store().status, 'playing');
      assert.equal(store().error, null);
      assert.equal(loadedStartOffset(), 90_000);
    } finally {
      await native.cleanup();
    }
  });
}

test('stream health: delayed native release probe cannot fail a replacement chapter', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
  const native = await startNativeStreamHealthPlayer();
  const gate = deferPlayerOperation();
  try {
    native.player.unmount();
    native.buffering();
    integrationNativeReleased = true;
    integrationStatusGate = gate.promise;
    t.mock.timers.tick(5_000);
    assert.equal(integrationStatusCalls, 1);
    integrationNativeReleased = false;
    integrationStatusGate = null;
    await native.player.api.playChapter('GEN', 2);
    assert.equal(store().currentChapter, 2);
    gate.resolve();
    await flushPlayerOperations();
    assert.equal(store().status, 'playing');
    assert.equal(store().error, null);
    assert.equal(recorded.reports.length, 0);
    native.buffering();
    t.mock.timers.tick(5_000);
    await flushPlayerOperations();
    assert.equal(
      integrationStatusCalls,
      2,
      'new buffering track can be verified after the old probe drains'
    );
    assert.equal(store().error, null);
  } finally {
    gate.resolve();
    await flushPlayerOperations();
    await native.cleanup();
  }
});

for (const nativePause of [false, true]) {
  test(`stream health: ${nativePause ? 'OS' : 'listener'} pause ends checks after reader closes`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: BASE_TIME });
    const native = await startNativeStreamHealthPlayer();
    try {
      native.player.unmount();
      native.buffering();
      if (nativePause) {
        Object.assign(integrationNativeStatus, { isPlaying: false, isBuffering: false });
        nativeStatusListener?.({ ...integrationNativeStatus });
      } else {
        await native.player.api.pause();
      }
      t.mock.timers.tick(10_000);
      await flushPlayerOperations();
      assert.equal(store().status, 'paused');
      assert.equal(integrationStatusCalls, 0);
      await dispatchRemoteCommand({ command: 'interruption-ended' });
      assert.equal(store().status, nativePause ? 'playing' : 'paused');
      assert.equal(store().error, null);
    } finally {
      await native.cleanup();
    }
  });
}

// Most sources publish no chapter duration (0). The native player reports the real one
// while the chapter loads, and finishing the load must not wipe it: the scrubber is
// disabled and the lock screen shows 0:00 / 0:00 until the next report.
test('a chapter whose source publishes no duration keeps the duration the native player reported', async () => {
  scenario.chapterAudio = async (translationId, bookId, chapter) => ({
    url: `https://cdn.example/${translationId}/${bookId}/${chapter}.mp3`,
    duration: 0,
  });
  const gate = deferPlayerOperation();
  playerGates.set('load:https://cdn.example/bsb/GEN/1.mp3', gate.promise);
  const player = mountPlayer();

  const playing = player.api.playChapter('GEN', 1);
  await settleUntil(() => playerCalls('loadAndPlay').length === 1);
  emitStatus({ durationMillis: 420_000, isPlaying: true });
  gate.resolve();
  await playing;

  assert.equal(store().duration, 420_000);
  assert.equal(recorded.nowPlaying.at(-1)?.durationMs, 420_000);
});
