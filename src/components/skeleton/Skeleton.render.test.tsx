import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);

/** Counts the pulse loops the skeletons start and stop. */
function spyOnLoops() {
  const stops = { count: 0 };
  const loop = mock.method(harness.rn.Animated, 'loop', () => ({
    start: () => {},
    stop: () => {
      stops.count += 1;
    },
    reset: () => {},
  }));
  return { loop, stops };
}

test('every bar of a skeleton shares one pulse loop', async () => {
  const { loop, stops } = spyOnLoops();
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const view = await harness.render(<VersesSkeleton count={8} />);
  await view.flush();

  assert.equal(loop.mock.callCount(), 1);
  assert.equal(stops.count, 0);

  await view.unmount();
  assert.equal(stops.count, 1, 'the loop stops with the last bar');
});

test('with reduce motion on the bars stay still and no loop starts', async () => {
  harness.setReduceMotion(true);
  const { loop } = spyOnLoops();
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const view = await harness.render(<VersesSkeleton count={8} />);
  await view.flush();

  assert.equal(loop.mock.callCount(), 0);
});
