import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockMmkvStorage } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
mockMmkvStorage(mock);

const START = new Date('2026-10-01T22:00:00.000Z').getTime();

const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;
let wakeups = 0;

beforeEach(() => {
  mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: START });
  wakeups = 0;
  // Count every timer callback the countdown runs: each one is a CPU wakeup.
  const mockedInterval = globalThis.setInterval;
  const mockedTimeout = globalThis.setTimeout;
  globalThis.setInterval = ((handler: () => void, ms?: number) =>
    mockedInterval(() => {
      wakeups += 1;
      handler();
    }, ms)) as typeof setInterval;
  globalThis.setTimeout = ((handler: () => void, ms?: number) =>
    mockedTimeout(() => {
      wakeups += 1;
      handler();
    }, ms)) as typeof setTimeout;
});
afterEach(() => {
  globalThis.setInterval = realSetInterval;
  globalThis.setTimeout = realSetTimeout;
  mock.timers.reset();
});

async function mountCountdown(minutes: number) {
  const { useSleepTimerCountdown } = await import('./useSleepTimerCountdown');
  const { useAudioStore } = await import('../../stores/audioStore');
  const { View } = await import('react-native');
  const endTime = START + minutes * 60_000;
  useAudioStore.setState({ sleepTimerEndTime: endTime });
  const calls = { cleared: 0, paused: 0 };
  const shown: Array<number | null> = [];
  function Probe() {
    const remaining = useSleepTimerCountdown({
      sleepTimerEndTime: endTime,
      sleepTimerRemainingMs: null,
      status: 'playing',
      clearSleepTimer: () => {
        calls.cleared += 1;
        useAudioStore.setState({ sleepTimerEndTime: null });
      },
      pause: async () => {
        calls.paused += 1;
      },
    });
    shown.push(remaining);
    return <View />;
  }
  await harness.render(<Probe />);
  return { calls, shown };
}

async function tickSeconds(seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    await act(async () => {
      mock.timers.tick(1000);
    });
  }
}

test('backgrounded, the sleep timer wakes once for the whole countdown and still expires on time', async () => {
  harness.rn.AppState.emit('active');
  const { calls } = await mountCountdown(5);
  await act(async () => {
    harness.rn.AppState.emit('background');
  });
  wakeups = 0;

  await tickSeconds(299);
  assert.equal(calls.paused, 0, 'not expired yet');
  assert.equal(wakeups, 0, 'no wakeups while the screen is off and nothing is due');

  await tickSeconds(1);
  assert.equal(calls.paused, 1, 'expiry still pauses on time');
  assert.equal(calls.cleared, 1);
  assert.equal(wakeups, 1);
});

test('in the foreground the countdown still ticks every second', async () => {
  harness.rn.AppState.emit('active');
  await mountCountdown(30);
  wakeups = 0;
  await tickSeconds(60);
  assert.equal(wakeups, 60);
});

test('coming back to the foreground resyncs the minutes and resumes the one-second clock', async () => {
  harness.rn.AppState.emit('active');
  const { shown, calls } = await mountCountdown(30);
  await act(async () => {
    harness.rn.AppState.emit('background');
  });
  await act(async () => {
    mock.timers.tick(10 * 60_000);
  });
  await act(async () => {
    harness.rn.AppState.emit('active');
  });
  assert.equal(shown.at(-1), 20, 'minutes resynced on foreground without waiting for a tick');

  wakeups = 0;
  await tickSeconds(61);
  assert.equal(shown.at(-1), 19, 'foreground ticking is back');
  assert.equal(wakeups, 61);
  assert.equal(calls.paused, 0);
});
