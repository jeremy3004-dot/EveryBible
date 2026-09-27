import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';

const audioStore = create(() => ({ duration: 120_000 }));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

const seeks: number[] = [];
mockModule(mock, sourcePath('hooks/audioPlayer/transportRegistry.ts'), {
  seekActivePlayback: async (ms: number) => void seeks.push(ms),
});

afterEach(async () => {
  const { usePlayerBarScrubStore } = await import('./playerBarScrub');
  usePlayerBarScrubStore.setState({ fraction: null });
  audioStore.setState({ duration: 120_000 });
  seeks.length = 0;
});

test('a drag previews where it will land and seeks only on release', async () => {
  const { beginPlayerBarScrub, movePlayerBarScrub, commitPlayerBarScrub, usePlayerBarScrubStore } =
    await import('./playerBarScrub');

  beginPlayerBarScrub(0.25);
  movePlayerBarScrub(0.5);
  assert.equal(usePlayerBarScrubStore.getState().fraction, 0.5);
  assert.deepEqual(seeks, []);

  commitPlayerBarScrub(0.75);
  assert.deepEqual(seeks, [90_000]);
  assert.equal(usePlayerBarScrubStore.getState().fraction, null);
});

test('an interrupted drag drops the preview without seeking', async () => {
  const { beginPlayerBarScrub, cancelPlayerBarScrub, usePlayerBarScrubStore } =
    await import('./playerBarScrub');

  beginPlayerBarScrub(0.4);
  cancelPlayerBarScrub();
  assert.equal(usePlayerBarScrubStore.getState().fraction, null);
  assert.deepEqual(seeks, []);
});

test('with no chapter length known, releasing does not seek', async () => {
  const { beginPlayerBarScrub, commitPlayerBarScrub } = await import('./playerBarScrub');
  audioStore.setState({ duration: 0 });

  beginPlayerBarScrub(0.5);
  commitPlayerBarScrub(0.5);
  assert.deepEqual(seeks, []);
});
