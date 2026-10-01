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

afterEach(() => {
  runtime.unmountAll();
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
