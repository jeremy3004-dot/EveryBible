import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockMmkvStorage } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
mockMmkvStorage(mock);

const START = new Date('2026-10-01T12:00:00.000Z').getTime();

beforeEach(() => {
  mock.timers.enable({ apis: ['Date', 'setInterval'], now: START });
});
afterEach(() => mock.timers.reset());

async function mountCountdown(minutes: number) {
  const { useSleepTimerCountdown } = await import('./useSleepTimerCountdown');
  const { View } = await import('react-native');
  const shown: Array<number | null> = [];
  function Probe() {
    const remaining = useSleepTimerCountdown({
      sleepTimerEndTime: START + minutes * 60_000,
      sleepTimerRemainingMs: null,
      status: 'playing',
      clearSleepTimer: () => {},
      pause: async () => {},
    });
    shown.push(remaining);
    return <View />;
  }
  const view = await harness.render(<Probe />);
  return { view, shown };
}

test('the sleep timer ticking every second does not re-render its owner until the minute changes', async () => {
  const { shown } = await mountCountdown(30);
  assert.equal(shown.at(-1), 30);

  const since = harness.renders.mark();
  for (let second = 0; second < 30; second += 1) {
    await act(async () => {
      mock.timers.tick(1000);
    });
  }

  assert.equal(
    harness.renders.count(since, 'View'),
    0,
    '30 one-second ticks, still 30 minutes left'
  );
});

test('the sleep timer countdown still steps down when a minute passes', async () => {
  const { shown } = await mountCountdown(30);

  await act(async () => {
    mock.timers.tick(61_000);
  });

  assert.equal(shown.at(-1), 29);
});
