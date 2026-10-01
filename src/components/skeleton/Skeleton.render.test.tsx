import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);

/**
 * Counts the pulse loops the skeletons start and stop. Like React Native's
 * Animated.loop, a stopped loop stays finished, and start() runs nothing,
 * until reset() is called.
 */
function spyOnLoops() {
  const stops = { count: 0 };
  const running = { count: 0 };
  const loop = mock.method(harness.rn.Animated, 'loop', () => {
    let finished = false;
    return {
      start: () => {
        if (!finished) running.count += 1;
      },
      stop: () => {
        finished = true;
        stops.count += 1;
      },
      reset: () => {
        finished = false;
      },
    };
  });
  return { loop, stops, running };
}

// The pulse is created once per module, so this test owns the loop for the file.
test('every bar of a skeleton shares one pulse loop, restarted for the next skeleton', async () => {
  const { loop, stops, running } = spyOnLoops();
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const view = await harness.render(<VersesSkeleton count={8} />);
  await view.flush();

  assert.equal(loop.mock.callCount(), 1);
  assert.equal(stops.count, 0);

  await view.unmount();
  assert.equal(stops.count, 1, 'the loop stops with the last bar');

  const next = await harness.render(<VersesSkeleton count={3} />);
  await next.flush();
  assert.equal(running.count, 2, 'the stopped loop pulses again instead of staying finished');
  await next.unmount();
});

test('with reduce motion on the bars stay still and no loop starts', async () => {
  harness.setReduceMotion(true);
  const { loop } = spyOnLoops();
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const view = await harness.render(<VersesSkeleton count={8} />);
  await view.flush();

  assert.equal(loop.mock.callCount(), 0);
});
