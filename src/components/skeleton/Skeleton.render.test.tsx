import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flattenStyle, installRenderHarness } from '../../testing/render';

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

// A chapter skeleton draws dozens of bars. Each bar used to ask the OS for reduce
// motion itself, and every answer re-rendered the app tree separately: React
// Native's old architecture does not batch updates made outside events. The
// release-build profile of opening a chapter had ~17 ms in those passes.
test('a skeleton asks the OS about reduce motion once, however many bars it draws', async (context) => {
  const query = context.mock.method(harness.rn.AccessibilityInfo, 'isReduceMotionEnabled');
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const view = await harness.render(<VersesSkeleton count={8} />);
  await view.flush();

  assert.equal(query.mock.callCount(), 1);
  await view.unmount();
});

test('a later skeleton starts from the answer already known, without waiting for the OS', async (context) => {
  const { VersesSkeleton } = await import('./VersesSkeleton');
  const first = await harness.render(<VersesSkeleton count={2} />);
  await first.flush();
  await first.unmount();

  harness.setReduceMotion(true);
  const query = context.mock.method(harness.rn.AccessibilityInfo, 'isReduceMotionEnabled');
  const pending = new Promise<boolean>(() => {});
  query.mock.mockImplementation(() => pending);
  const next = await harness.render(<VersesSkeleton count={2} />);

  // Pulsing bars draw with the shared Animated interpolation; still ones with 0.5.
  const opacities = next
    .queryAllByType('View')
    .map((node) => flattenStyle(node.props.style)?.opacity)
    .filter((opacity) => opacity !== undefined);
  assert.ok(opacities.length > 0);
  assert.ok(
    opacities.every((opacity) => typeof opacity === 'object' && opacity !== null),
    'the bars pulse at once with the last known setting'
  );
  await next.unmount();
});
