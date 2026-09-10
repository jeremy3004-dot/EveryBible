/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// Android branch. Platform.OS is read inside the effect, but a whole-file stub
// keeps the two platforms from sharing mutable module state
// (useKeyboardBottomInset.test.ts covers iOS).
const rn = mockReactNative(mock, { os: 'android' });

let stateSlots: unknown[] = [];
let slotIndex = 0;
const cleanups: Array<() => void> = [];

mockModule(mock, 'react', {
  useState: <T>(initial: T | (() => T)) => {
    const index = slotIndex++;
    if (!(index in stateSlots)) {
      stateSlots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T) => {
      stateSlots[index] = next;
    };
    return [stateSlots[index] as T, setState];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      cleanups.push(cleanup);
    }
  },
});

async function mountHook(): Promise<number> {
  stateSlots = [];
  slotIndex = 0;
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  return useKeyboardBottomInset();
}

test('Android reports a zero inset and holds existing layout behaviour', async () => {
  assert.equal(await mountHook(), 0);
});

test('Android registers no keyboard listeners at all', async () => {
  await mountHook();

  assert.deepEqual(
    {
      willShow: rn.Keyboard.listenerCount('keyboardWillShow'),
      willHide: rn.Keyboard.listenerCount('keyboardWillHide'),
      didShow: rn.Keyboard.listenerCount('keyboardDidShow'),
      didHide: rn.Keyboard.listenerCount('keyboardDidHide'),
    },
    { willShow: 0, willHide: 0, didShow: 0, didHide: 0 }
  );
});

test('Android registers no cleanup, because it subscribed to nothing', async () => {
  await mountHook();

  assert.equal(cleanups.length, 0);
});

test('an Android keyboard event cannot move the inset', async () => {
  await mountHook();

  rn.Keyboard.emit('keyboardDidShow', { endCoordinates: { height: 280 } });

  assert.equal(await mountHook(), 0);
});
