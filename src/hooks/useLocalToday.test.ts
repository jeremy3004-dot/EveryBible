import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const react = runtime.react as unknown as typeof import('react');
const rn = mockReactNative(mock);

// Stands in for React Navigation: the effect re-runs whenever the screen is focused.
const focus = { refocus: () => {} };
mockModule(mock, '@react-navigation/native', {
  useFocusEffect: (effect: () => void | (() => void)) => {
    const [focusCount, setFocusCount] = react.useState(0);
    focus.refocus = () => setFocusCount((count) => count + 1);
    react.useEffect(effect, [effect, focusCount]);
  },
});

const localKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Counts the timer callbacks the hook runs: each one wakes the JS thread.
const wakeups = { count: 0 };
let restoreSetTimeout: (() => void) | null = null;
function countTimerWakeups() {
  const mockedSetTimeout = globalThis.setTimeout;
  restoreSetTimeout = () => {
    globalThis.setTimeout = mockedSetTimeout;
  };
  wakeups.count = 0;
  globalThis.setTimeout = ((handler: () => void, ms?: number) =>
    mockedSetTimeout(() => {
      wakeups.count += 1;
      handler();
    }, ms)) as typeof setTimeout;
}

afterEach(() => {
  runtime.unmountAll();
  restoreSetTimeout?.();
  restoreSetTimeout = null;
  mock.timers.reset();
});

test('a screen left open overnight in the background shows the new day on return', async () => {
  // 23:10 local on 23 September, whatever zone the suite runs in.
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 23, 10) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  assert.equal(localKey(view.result), '2026-9-23');

  // The app sleeps through the night: no timer runs while it is suspended, and the
  // screen never loses focus.
  rn.AppState.emit('background');
  mock.timers.setTime(new Date(2026, 8, 24, 7, 30).getTime());
  rn.AppState.emit('active');
  view.rerender();

  assert.equal(localKey(view.result), '2026-9-24');
});

test('a screen kept open across local midnight moves to the new day', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 23, 59, 30) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  assert.equal(localKey(view.result), '2026-9-23');

  mock.timers.tick(31_000);
  view.rerender();
  assert.equal(localKey(view.result), '2026-9-24');

  // And again the following midnight: the timer re-arms itself.
  mock.timers.tick(24 * 60 * 60 * 1000);
  view.rerender();
  assert.equal(localKey(view.result), '2026-9-25');
});

test('refocusing or foregrounding on the same day keeps the same Date instance', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 12, 0) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  const first = view.result;

  mock.timers.setTime(new Date(2026, 8, 23, 15, 30).getTime());
  focus.refocus();
  view.rerender();
  await view.commit();
  rn.AppState.emit('active');
  view.rerender();

  // Memoised plan cards keyed on `today` must not recompute for a same-day refresh.
  assert.equal(view.result, first);
});

test('the Date is replaced when the small hours of a new day end, which the cycle rollover reads', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 1, 0) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  const first = view.result;

  mock.timers.setTime(new Date(2026, 8, 23, 8, 0).getTime());
  rn.AppState.emit('active');
  view.rerender();

  assert.notEqual(view.result, first);
  assert.equal(view.result.getHours(), 8);
});

test('a screen kept open past the end of the small hours drops the last-night grace at 04:00 sharp', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 1, 0) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  const lastNight = view.result;

  // No focus change, no foreground: only the timer can move "now" past 04:00, where a
  // recurring plan stops treating a tick as last night's.
  mock.timers.tick(3 * 60 * 60 * 1000 - 1);
  view.rerender();
  assert.equal(view.result, lastNight, 'still the small hours at 03:59:59.999');

  mock.timers.tick(1);
  view.rerender();
  assert.equal(view.result.getTime(), new Date(2026, 8, 23, 4, 0).getTime());
});

test('a screen opened in the last millisecond of the small hours still rolls over at 04:00', async () => {
  mock.timers.enable({
    apis: ['Date', 'setTimeout'],
    now: new Date(2026, 8, 23, 3, 59, 59, 999),
  });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();

  mock.timers.tick(1);
  view.rerender();
  assert.equal(view.result.getTime(), new Date(2026, 8, 23, 4, 0).getTime());
});

test('through the small hours the screen sleeps until they end rather than polling', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 1, 0) });
  countTimerWakeups();
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();

  // Step the clock a minute at a time, as the hours pass, so a timer that kept re-arming
  // itself would be seen waking on every step.
  for (let minute = 0; minute < 3 * 60; minute += 1) {
    mock.timers.tick(60_000);
  }
  view.rerender();

  assert.equal(view.result.getHours(), 4);
  assert.equal(wakeups.count, 1, 'one wakeup, at 04:00');
});

test('focus still refreshes the date, and unmounting leaves nothing running', async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 23, 12, 0) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();

  mock.timers.setTime(new Date(2026, 8, 25, 9, 0).getTime());
  focus.refocus();
  view.rerender();
  await view.commit();
  view.rerender();
  assert.equal(localKey(view.result), '2026-9-25');

  view.unmount();
  assert.equal(rn.AppState.listenerCount(), 0);
  assert.equal(view.cleanupCount, 0);
});
