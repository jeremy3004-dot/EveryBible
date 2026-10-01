import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });

// The position the guard follows, as the player writes it.
const audioStore = create(() => ({
  currentTranslationId: 'bsb' as string | null,
  currentBookId: 'JHN' as string | null,
  currentChapter: 3 as number | null,
  currentPosition: 0,
  duration: 60_000,
}));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

const track = { translationId: 'bsb', bookId: 'JHN', chapter: 3 };

beforeEach(() => {
  audioStore.setState(audioStore.getInitialState(), true);
});

const moveTo = (currentPosition: number) =>
  act(async () => {
    audioStore.setState({ currentPosition });
  });

async function mountGuard(endMs: number) {
  const { ReaderAudioPortionPreviewGuard } = await import('./ReaderAudioPositionParts');
  const ends: number[] = [];
  await harness.render(
    <ReaderAudioPortionPreviewGuard
      track={track}
      endMs={endMs}
      onReachEnd={() => ends.push(audioStore.getState().currentPosition)}
    />
  );
  return ends;
}

test('the preview stops once playback passes the end of the clip', async () => {
  audioStore.setState({ currentPosition: 10_000 });
  const ends = await mountGuard(25_000);
  assert.deepEqual(ends, []);

  await moveTo(24_750);
  await moveTo(25_000);

  assert.deepEqual(ends, [25_000]);
});

test('a playhead already past the clip end when the preview starts does not stop it before the seek to the start lands', async () => {
  audioStore.setState({ currentPosition: 50_000 });
  const ends = await mountGuard(25_000);
  assert.deepEqual(ends, [], 'the old playhead is not the end of the preview');

  await moveTo(10_000);
  await moveTo(25_250);

  assert.deepEqual(ends, [25_250]);
});
