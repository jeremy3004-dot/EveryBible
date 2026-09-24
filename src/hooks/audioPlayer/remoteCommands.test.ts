import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import type { BibleNowPlayingRemoteCommand } from '../../services/audio/audioNowPlaying';
import type { RemoteCommandControls } from './remoteCommands';

mockReactNative(mock);
mockMmkvStorage(mock);

type Listener = (command: { command: string; positionSeconds?: number }) => Promise<void>;
const native = {
  loaded: true,
  listeners: new Set<Listener>(),
  unsubscribes: 0,
};

mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: { isLoaded: () => native.loaded },
  subscribeBibleNowPlayingRemoteCommands: (listener: Listener) => {
    native.listeners.add(listener);
    return () => {
      native.listeners.delete(listener);
      native.unsubscribes += 1;
    };
  },
});

const calls: string[] = [];
const controls: RemoteCommandControls = {
  playFromRemote: async () => void calls.push('playFromRemote'),
  pause: async () => void calls.push('pause'),
  resume: async () => void calls.push('resume'),
  stop: async () => void calls.push('stop'),
  skipForward: async () => void calls.push('skipForward'),
  skipBackward: async () => void calls.push('skipBackward'),
  seekTo: async (positionMs) => void calls.push(`seekTo:${positionMs}`),
  nextChapter: async () => void calls.push('nextChapter'),
  previousChapter: async () => void calls.push('previousChapter'),
};

const load = async () => {
  const remote = await import('./remoteCommands');
  const shared = await import('./sharedPlaybackState');
  const { useAudioStore } = await import('../../stores/audioStore');
  return { ...remote, ...shared, useAudioStore };
};

const pausedMidChapter = {
  status: 'paused' as const,
  currentTranslationId: 'bsb',
  currentBookId: 'JHN',
  currentChapter: 3,
  currentPosition: 30_000,
  duration: 300_000,
};

beforeEach(async () => {
  const { useAudioStore, pausedByListener } = await load();
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  pausedByListener.current = false;
  native.loaded = true;
  calls.length = 0;
});

test('transport commands reach the matching player action', async () => {
  const { routeRemoteCommand } = await load();

  const commands: BibleNowPlayingRemoteCommand['command'][] = [
    'play',
    'pause',
    'stop',
    'seek-forward',
    'seek-backward',
    'next',
    'previous',
  ];
  for (const command of commands) {
    await routeRemoteCommand({ command }, controls);
  }

  assert.deepEqual(calls, [
    'playFromRemote',
    'pause',
    'stop',
    'skipForward',
    'skipBackward',
    'nextChapter',
    'previousChapter',
  ]);
});

test('a scrub seeks to the reported second, and one without a position is ignored', async () => {
  const { routeRemoteCommand } = await load();

  await routeRemoteCommand({ command: 'seek-position', positionSeconds: 12.5 }, controls);
  await routeRemoteCommand({ command: 'seek-position' }, controls);

  assert.deepEqual(calls, ['seekTo:12500']);
});

test('toggle pauses a playing or loading chapter and otherwise plays', async () => {
  const { routeRemoteCommand, useAudioStore } = await load();

  for (const status of ['playing', 'loading', 'paused', 'idle'] as const) {
    useAudioStore.setState({ status });
    await routeRemoteCommand({ command: 'toggle' }, controls);
  }

  assert.deepEqual(calls, ['pause', 'pause', 'playFromRemote', 'playFromRemote']);
});

test('the end of an interruption resumes a chapter the system paused', async () => {
  const { routeRemoteCommand, useAudioStore } = await load();
  useAudioStore.setState(pausedMidChapter);

  await routeRemoteCommand({ command: 'interruption-ended' }, controls);

  assert.deepEqual(calls, ['resume']);
});

test('the end of an interruption leaves a listener pause, a finished chapter or no sound alone', async () => {
  const { routeRemoteCommand, useAudioStore, pausedByListener } = await load();

  useAudioStore.setState(pausedMidChapter);
  pausedByListener.current = true;
  await routeRemoteCommand({ command: 'interruption-ended' }, controls);

  pausedByListener.current = false;
  useAudioStore.setState({ ...pausedMidChapter, currentPosition: 300_000 });
  await routeRemoteCommand({ command: 'interruption-ended' }, controls);

  useAudioStore.setState(pausedMidChapter);
  native.loaded = false;
  await routeRemoteCommand({ command: 'interruption-ended' }, controls);

  native.loaded = true;
  useAudioStore.setState({ ...pausedMidChapter, status: 'playing' });
  await routeRemoteCommand({ command: 'interruption-ended' }, controls);

  assert.deepEqual(calls, []);
});

test('a player taking over remote commands replaces the previous subscription', async () => {
  const { takeOverRemoteCommands } = await load();
  const otherCalls: string[] = [];
  const other: RemoteCommandControls = {
    ...controls,
    pause: async () => void otherCalls.push('pause'),
  };

  takeOverRemoteCommands(controls);
  const unsubscribesBefore = native.unsubscribes;
  takeOverRemoteCommands(other);

  assert.equal(native.listeners.size, 1);
  assert.equal(native.unsubscribes, unsubscribesBefore + 1);
  for (const listener of native.listeners) {
    await listener({ command: 'pause' });
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(otherCalls, ['pause']);
});
