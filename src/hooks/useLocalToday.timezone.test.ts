// useLocalToday across a time-zone change. The device starts in UTC and the test moves
// it to Tokyo while the app is in the background, as a flight would. Changing TZ here is
// safe because the test runner gives every file its own process.
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const react = runtime.react as unknown as typeof import('react');
const rn = mockReactNative(mock);
// The screen never loses focus in this scenario, so focus only refreshes at mount.
mockModule(mock, '@react-navigation/native', {
  useFocusEffect: (effect: () => void) => react.useEffect(effect, [effect]),
});

const localKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

afterEach(() => {
  runtime.unmountAll();
  mock.timers.reset();
  process.env.TZ = 'UTC';
});

test('back in the foreground in a zone further east, the day rolls over at that zone’s midnight', async () => {
  // Noon in UTC: the rollover is armed for UTC midnight, twelve hours away.
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 8, 23, 12, 0) });
  const { useLocalToday } = await import('./useLocalToday');
  const view = runtime.mount(useLocalToday);
  await view.commit();
  assert.equal(localKey(view.result), '2026-9-23');

  // An hour later the app comes back in Tokyo, where it is already 22:00. Tokyo's
  // midnight is two hours away; UTC's is still eleven.
  rn.AppState.emit('background');
  process.env.TZ = 'Asia/Tokyo';
  mock.timers.setTime(Date.UTC(2026, 8, 23, 13, 0));
  rn.AppState.emit('active');
  view.rerender();
  assert.equal(localKey(view.result), '2026-9-23');

  mock.timers.tick(2 * 60 * 60 * 1000);
  view.rerender();
  assert.equal(localKey(view.result), '2026-9-24');
});
