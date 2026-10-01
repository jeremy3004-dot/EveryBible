import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockMmkvStorage, mockModule, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';

mockMmkvStorage(mock);
const harness = installRenderHarness(mock);

const handledErrors: Array<{ scope: string; error: unknown }> = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (scope: string, error: unknown) => handledErrors.push({ scope, error }),
});

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
process.on('unhandledRejection', onUnhandled);
afterEach(() => {
  handledErrors.length = 0;
  unhandled.length = 0;
});

// The gesture fake drops its handlers; keep the pan's onEnd so a test can finish a swipe.
async function capturePanEnd() {
  const gestureHandler = (await import('react-native-gesture-handler')) as unknown as {
    Gesture: { Pan: () => unknown };
  };
  const captured: { onEnd: ((event: unknown) => void) | null } = { onEnd: null };
  const pan: Record<string, unknown> = {};
  const chain = new Proxy(pan, {
    get: (_target, property) =>
      property === 'onEnd'
        ? (handler: (event: unknown) => void) => {
            captured.onEnd = handler;
            return chain;
          }
        : () => chain,
  });
  gestureHandler.Gesture.Pan = () => chain;
  return captured;
}

test('a chapter navigation that fails after a swipe is reported, not left unhandled', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const captured = await capturePanEnd();
  const { useReaderSwipeNavigation } = await import('./useReaderSwipeNavigation');
  const failure = new Error('chapter load failed');
  function Probe() {
    useReaderSwipeNavigation({
      activePlanId: undefined,
      activeRhythmSession: null,
      handleNextReadChapter: async () => {
        throw failure;
      },
      handlePreviousReadChapter: async () => {},
      hasNextChapter: true,
      hasPrevChapter: true,
      nextNavigationTarget: null,
      previousNavigationTarget: null,
      showPlanSessionChrome: false,
    });
    return null;
  }
  const view = await harness.render(<Probe />);
  assert.ok(captured.onEnd, 'the swipe gesture registered an end handler');

  // A fast leftward swipe goes to the next chapter.
  captured.onEnd({ translationX: -200, velocityX: -1500 });
  await view.flush();
  context.mock.timers.tick(200);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(unhandled, []);
  assert.deepEqual(
    handledErrors.map((entry) => entry.scope),
    ['reader.swipeNavigation']
  );
  assert.equal(handledErrors[0]?.error, failure);
});
