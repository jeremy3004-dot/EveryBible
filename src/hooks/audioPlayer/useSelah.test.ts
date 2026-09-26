import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { createReactHookRuntime } from '../../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockMmkvStorage(mock);

const played: string[] = [];
mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: {
    isLoaded: () => true,
    setVolume: async () => {},
    pause: async () => void played.push('pause'),
  },
  backgroundMusicPlayer: { sync: async () => {}, stop: async () => {}, fadeOut: () => {} },
});
mockModule(mock, sourcePath('hooks/audioPlayer/passageRepeat.ts'), {
  loadChapterVerseTimings: async () => null,
  peekChapterVerseTimings: () => null,
});

let useSelah: (typeof import('./useSelah'))['useSelah'];
let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];

before(async () => {
  ({ useSelah } = await import('./useSelah'));
  ({ useAudioStore } = await import('../../stores/audioStore'));
});

beforeEach(() => {
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  played.length = 0;
});

afterEach(() => runtime.unmountAll());

const store = () => useAudioStore.getState();

test('Selah is unavailable until a background sound is on and a chapter is loaded', () => {
  const view = runtime.mount(useSelah);
  assert.equal(view.result.canSelah, false);
  assert.equal(view.result.isSelahActive, false);

  store().setBackgroundMusicChoice('piano');
  view.rerender();
  assert.equal(view.result.canSelah, false, 'nothing loaded yet');

  store().setCurrentTrack('bsb', 'JHN', 3);
  store().setStatus('playing');
  view.rerender();
  assert.equal(view.result.canSelah, true);
});

test('while on, Selah stays available so it can be turned off', () => {
  store().setBackgroundMusicChoice('piano');
  store().setCurrentTrack('bsb', 'JHN', 3);
  store().setStatus('paused');
  store().setSelahActive(true);
  const view = runtime.mount(useSelah);

  assert.deepEqual(
    { isSelahActive: view.result.isSelahActive, canSelah: view.result.canSelah },
    { isSelahActive: true, canSelah: true }
  );
});

test('every component gets the same toggle, and toggling with nothing to hold does nothing', async () => {
  const first = runtime.mount(useSelah);
  const second = runtime.mount(useSelah);

  assert.equal(first.result.toggleSelah, second.result.toggleSelah);
  first.result.toggleSelah();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(store().selahActive, false);
  assert.deepEqual(played, []);
});
