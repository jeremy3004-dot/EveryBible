/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import type { MockTimers } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import type { AudioChapterMap } from '../services/bible/contentAvailability';

// ---------------------------------------------------------------------------
// A deterministic hook harness.
//
// No React renderer is installed, so `react` itself is replaced with hook
// implementations backed by per-instance slot arrays: useState keeps its value
// in a slot, useRef hands back a stable object, useMemo/useCallback compare
// deps with Object.is, and useEffect collects work that runs when a test calls
// `flushEffects()` (cleanups first, then effects, as React commits them).
// Re-renders are explicit: nothing re-runs until a test asks for it.
// ---------------------------------------------------------------------------

interface EffectRecord {
  deps: unknown[] | undefined;
  effect: () => void | (() => void);
  cleanup?: () => void;
  pending: boolean;
}

interface HookInstance {
  slots: unknown[];
  cursor: number;
  effects: EffectRecord[];
  effectCursor: number;
}

let activeInstance: HookInstance | null = null;

const requireInstance = (): HookInstance => {
  if (!activeInstance) {
    throw new Error('A hook was called outside of a render pass');
  }
  return activeInstance;
};

const depsChanged = (previous: unknown[] | undefined, next: unknown[] | undefined): boolean =>
  !previous ||
  !next ||
  previous.length !== next.length ||
  previous.some((value, index) => !Object.is(value, next[index]));

const useStateMock = <T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => {
  const instance = requireInstance();
  const index = instance.cursor++;
  if (!instance.slots[index]) {
    instance.slots[index] = {
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
    };
  }
  const slot = instance.slots[index] as { value: T };
  const setState = (next: T | ((prev: T) => T)) => {
    slot.value = typeof next === 'function' ? (next as (prev: T) => T)(slot.value) : next;
  };
  return [slot.value, setState];
};

const useRefMock = <T>(initial: T): { current: T } => {
  const instance = requireInstance();
  const index = instance.cursor++;
  if (!instance.slots[index]) {
    instance.slots[index] = { current: initial };
  }
  return instance.slots[index] as { current: T };
};

const useMemoMock = <T>(factory: () => T, deps?: unknown[]): T => {
  const instance = requireInstance();
  const index = instance.cursor++;
  const slot = instance.slots[index] as { deps: unknown[] | undefined; value: T } | undefined;
  if (!slot || depsChanged(slot.deps, deps)) {
    const value = factory();
    instance.slots[index] = { deps, value };
    return value;
  }
  return slot.value;
};

const useCallbackMock = <T>(callback: T, deps?: unknown[]): T => useMemoMock(() => callback, deps);

const useEffectMock = (effect: () => void | (() => void), deps?: unknown[]): void => {
  const instance = requireInstance();
  const index = instance.effectCursor++;
  const slot = instance.effects[index];
  if (!slot) {
    instance.effects[index] = { deps, effect, pending: true };
    return;
  }
  if (depsChanged(slot.deps, deps)) {
    slot.pending = true;
  }
  slot.deps = deps;
  slot.effect = effect;
};

const useSyncExternalStoreMock = <T>(_subscribe: unknown, getSnapshot: () => T): T => getSnapshot();

const reactExports = {
  useState: useStateMock,
  useRef: useRefMock,
  useMemo: useMemoMock,
  useCallback: useCallbackMock,
  useEffect: useEffectMock,
  useSyncExternalStore: useSyncExternalStoreMock,
  useDebugValue: () => {},
};

// ---------------------------------------------------------------------------
// Recording doubles for every native-backed collaborator
// ---------------------------------------------------------------------------

interface ProgressSnapshot {
  isLoaded: true;
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
  isBuffering: boolean;
  didJustFinish: false;
}

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
  analytics: [] as { name: string; properties: Record<string, unknown> }[],
  history: [] as { bookId: string; chapter: number; progress: number }[],
  listened: [] as { bookId: string; chapter: number; durationMs: number }[],
  prefetch: [] as { translationId: string; bookId: string; chapter: number; count: number }[],
  deletedFiles: [] as string[],
  audioLookups: [] as { translationId: string; bookId: string; chapter: number }[],
  remoteLookups: [] as { translationId: string; bookId: string; chapter: number }[],
  remoteUnsubscribes: 0,
};

const DEFAULT_DURATION_MS = 600_000;

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
  loadAndPlay(url: string, rate: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  isLoaded(): boolean;
}

const audioPlayerDouble: AudioPlayerDouble = {
  loaded: false,
  callbacks: {},
  setCallbacks(callbacks: AudioPlayerCallbacks) {
    audioPlayerDouble.callbacks = callbacks;
    recorded.player.push({ method: 'setCallbacks', args: [] });
  },
  async loadAndPlay(url: string, rate: number) {
    recorded.player.push({ method: 'loadAndPlay', args: [url, rate] });
    if (scenario.failLoadUrls.has(url)) {
      throw new Error(`decode failed: ${url}`);
    }
    audioPlayerDouble.loaded = true;
  },
  async pause() {
    recorded.player.push({ method: 'pause', args: [] });
  },
  async resume() {
    recorded.player.push({ method: 'resume', args: [] });
  },
  async stop() {
    recorded.player.push({ method: 'stop', args: [] });
    audioPlayerDouble.loaded = false;
  },
  async seekTo(positionMs: number) {
    recorded.player.push({ method: 'seekTo', args: [positionMs] });
  },
  async setRate(rate: number) {
    recorded.player.push({ method: 'setRate', args: [rate] });
  },
  isLoaded() {
    return audioPlayerDouble.loaded;
  },
};

const backgroundMusicDouble = {
  async sync(choice: string, shouldPlay: boolean) {
    recorded.backgroundMusic.push({ method: 'sync', choice, shouldPlay });
  },
  async stop() {
    recorded.backgroundMusic.push({ method: 'stop' });
  },
};

type RemoteCommand = { command: string; positionSeconds?: number };
let remoteCommandListener: ((command: RemoteCommand) => void | Promise<void>) | null = null;

const bibleState = {
  translations: [{ id: 'bsb', name: 'Berean Standard Bible' }] as { id: string; name: string }[],
};

const mmkv = mockMmkvStorage(mock);

const translate = (key: string) => key;

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

mockPackage('react', { ...reactExports, default: reactExports });
mockPackage('react-i18next', { useTranslation: () => ({ t: translate }) });
mockPackage('zustand/react/shallow', { useShallow: (selector: unknown) => selector });

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
      markChapterListened: (bookId: string, chapter: number, durationMs: number) => {
        recorded.listened.push({ bookId, chapter, durationMs });
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
    remoteCommandListener = listener;
    return () => {
      remoteCommandListener = null;
      recorded.remoteUnsubscribes += 1;
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
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  trackAnonymousUsageEvent: (name: string, properties: Record<string, unknown>) => {
    recorded.analytics.push({ name, properties });
  },
});
mockModule(mock, sourcePath('hooks/useTranslationContentSummary.ts'), {
  useTranslationContentSummary: () => scenario.contentSummary,
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
  api: PlayerApi;
  rerender: () => PlayerApi;
  flushEffects: () => void;
  unmount: () => void;
}

// Every mounted hook is tracked so `afterEach` can run its effect cleanups.
// The hook owns three `setInterval`s (position interpolation, listening
// telemetry, sleep timer) that only stop when React unmounts the effects; a
// test that leaves one running keeps the whole runner process alive.
const mountedPlayers = new Set<MountedPlayer>();

const mountPlayer = (translationId = 'bsb'): MountedPlayer => {
  const instance: HookInstance = { slots: [], cursor: 0, effects: [], effectCursor: 0 };

  const render = () => {
    const previous = activeInstance;
    activeInstance = instance;
    instance.cursor = 0;
    instance.effectCursor = 0;
    try {
      mounted.api = useAudioPlayer(translationId);
    } finally {
      activeInstance = previous;
    }
  };

  const flushEffects = () => {
    const pending = instance.effects.filter((record) => record.pending);
    for (const record of pending) {
      record.cleanup?.();
      record.cleanup = undefined;
    }
    for (const record of pending) {
      record.pending = false;
      const cleanup = record.effect();
      record.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  };

  const mounted: MountedPlayer = {
    api: undefined as unknown as PlayerApi,
    rerender: () => {
      render();
      flushEffects();
      return mounted.api;
    },
    flushEffects,
    unmount: () => {
      for (const record of instance.effects) {
        record.cleanup?.();
        record.cleanup = undefined;
      }
      instance.effects.length = 0;
      mountedPlayers.delete(mounted);
    },
  };

  mountedPlayers.add(mounted);
  render();
  flushEffects();
  return mounted;
};

const store = () => useAudioStore.getState();

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
const liveIntervals = new Set<ReturnType<typeof setInterval>>();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const handle = realSetInterval(...args);
  liveIntervals.add(handle);
  return handle;
}) as typeof setInterval;
globalThis.clearInterval = ((handle?: ReturnType<typeof setInterval>) => {
  if (handle !== undefined) {
    liveIntervals.delete(handle);
  }
  return realClearInterval(handle);
}) as typeof clearInterval;

after(() => {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});

beforeEach(() => {
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
  recorded.prefetch.length = 0;
  recorded.deletedFiles.length = 0;
  recorded.audioLookups.length = 0;
  recorded.remoteLookups.length = 0;
  recorded.remoteUnsubscribes = 0;

  scenario.availableTranslations = new Set(['bsb', 'web']);
  scenario.chapterAudio = defaultChapterAudio;
  scenario.remoteFallback = async () => null;
  scenario.failLoadUrls = new Set();
  scenario.contentSummary = undefined;

  audioPlayerDouble.loaded = false;
  audioPlayerDouble.callbacks = {};
  remoteCommandListener = null;
  bibleState.translations = [{ id: 'bsb', name: 'Berean Standard Bible' }];
});

afterEach(() => {
  // React unmounts the hook between screens; the harness has to do it by hand.
  for (const player of Array.from(mountedPlayers)) {
    player.unmount();
  }

  const leaked = liveIntervals.size;
  for (const handle of Array.from(liveIntervals)) {
    clearInterval(handle);
  }
  assert.equal(leaked, 0, 'the test left a real setInterval running');
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

test('unmounting removes the lock screen command subscription', () => {
  const player = mountPlayer();

  player.unmount();

  assert.equal(recorded.remoteUnsubscribes, 1);
  assert.equal(remoteCommandListener, null);
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
    chapter: 1,
    positionMs: 0,
    durationMs: DEFAULT_DURATION_MS,
    isPlaying: true,
    playbackRate: 1,
    canSkipNext: true,
    canSkipPrevious: false,
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

  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [42_000] }]);
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

test('the player reporting an error surfaces the playback failure message', () => {
  mountPlayer();

  audioPlayerDouble.callbacks.onError?.('native decoder gave up');

  assert.equal(store().status, 'error');
  assert.equal(store().error, 'interface.audioPlayFailed');
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

  await player.rerender().stop();

  assert.equal(store().status, 'idle');
  assert.equal(store().currentBookId, null);
  assert.equal(store().audioReturnTarget, null);
  assert.deepEqual(recorded.backgroundMusic.at(-1), { method: 'stop' });
});

test('togglePlayPause pauses a chapter that is playing', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  await player.rerender().togglePlayPause();

  assert.equal(store().status, 'paused');
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
  assert.deepEqual(playerCalls('seekTo'), [{ method: 'seekTo', args: [60_000] }]);
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
// Chapter navigation
// ---------------------------------------------------------------------------

test('nextChapter follows the queue before anything else', async () => {
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

test('navigating away from an idle chapter leaves the player idle', async () => {
  const player = mountPlayer();
  store().setCurrentTrack('bsb', 'GEN', 1);

  await player.rerender().nextChapter();

  assert.equal(store().status, 'idle');
  assert.equal(store().currentChapter, 2);
});

test('navigating away from a playing chapter starts the new one immediately', async () => {
  const player = mountPlayer();
  await player.api.playChapter('GEN', 1);

  await player.rerender().nextChapter();

  assert.equal(store().status, 'playing');
  assert.equal(store().currentChapter, 2);
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
  assert.deepEqual(recorded.listened, [
    { bookId: 'GEN', chapter: 1, durationMs: DEFAULT_DURATION_MS },
  ]);
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
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  recorded.backgroundMusic.length = 0;

  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: false },
  ]);
});

test('the chosen background bed plays alongside the chapter', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  recorded.backgroundMusic.length = 0;

  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: true },
  ]);
});

test('the background bed keeps playing while the next chapter loads', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  store().setStatus('loading');
  recorded.backgroundMusic.length = 0;

  player.rerender();

  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: true },
  ]);
});

test('the background bed keeps playing when a chapter transition fails', async () => {
  const player = mountPlayer();
  store().setBackgroundMusicChoice('piano');
  await player.rerender().playChapter('GEN', 1);
  player.rerender();
  scenario.chapterAudio = async () => null;
  await player.api.playChapter('GEN', 2);
  recorded.backgroundMusic.length = 0;

  player.rerender();

  assert.equal(store().status, 'error');
  assert.deepEqual(recorded.backgroundMusic, [
    { method: 'sync', choice: 'piano', shouldPlay: true },
  ]);
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
