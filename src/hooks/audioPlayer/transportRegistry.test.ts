import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { AudioStatus } from '../../types/audio';

const audioStore = create(() => ({ status: 'idle' as AudioStatus }));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

const calls: string[] = [];
const controls = {
  playFromRemote: async () => void calls.push('playFromRemote'),
  pause: async () => void calls.push('pause'),
  resume: async () => void calls.push('resume'),
  stop: async () => void calls.push('stop'),
  skipForward: async () => void calls.push('skipForward'),
  skipBackward: async () => void calls.push('skipBackward'),
  seekTo: async () => void calls.push('seekTo'),
  nextChapter: async () => void calls.push('nextChapter'),
  previousChapter: async () => void calls.push('previousChapter'),
};

afterEach(async () => {
  const { resetPlayerTransport } = await import('./transportRegistry');
  resetPlayerTransport();
  audioStore.setState({ status: 'idle' });
  calls.length = 0;
});

test('before any player has mounted the bar’s transport does nothing', async () => {
  const { hasPlayerTransport, stepActivePlayback, toggleActivePlayback } =
    await import('./transportRegistry');
  assert.equal(hasPlayerTransport(), false);
  await toggleActivePlayback();
  await stepActivePlayback(1);
  assert.deepEqual(calls, []);
});

test('toggling pauses a playing or loading chapter and otherwise plays what Play would', async () => {
  const { registerPlayerTransport, toggleActivePlayback } = await import('./transportRegistry');
  registerPlayerTransport(controls);

  for (const status of ['playing', 'loading', 'paused', 'idle'] as const) {
    audioStore.setState({ status });
    await toggleActivePlayback();
  }
  assert.deepEqual(calls, ['pause', 'pause', 'playFromRemote', 'playFromRemote']);
});

test('stepping moves the session a chapter either way, like the lock screen', async () => {
  const { registerPlayerTransport, stepActivePlayback } = await import('./transportRegistry');
  registerPlayerTransport(controls);
  await stepActivePlayback(1);
  await stepActivePlayback(-1);
  assert.deepEqual(calls, ['nextChapter', 'previousChapter']);
});
