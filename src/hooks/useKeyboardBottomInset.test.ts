/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';

// iOS branch (utils/../useKeyboardBottomInset.android.test.ts covers the other).
const rn = mockReactNative(mock, { os: 'ios' });

// There is no renderer, so `react` is replaced with the smallest thing the hook
// needs: numbered state slots that survive a re-render, and a useEffect that
// runs its effect immediately and hands the cleanup back to the harness.
let stateSlots: unknown[] = [];
let slotIndex = 0;
let cleanups: Array<() => void> = [];
let runEffects = true;

mockModule(mock, 'react', {
  useState: <T>(initial: T | (() => T)) => {
    const index = slotIndex++;
    if (!(index in stateSlots)) {
      stateSlots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((previous: T) => T)) => {
      stateSlots[index] =
        typeof next === 'function' ? (next as (p: T) => T)(stateSlots[index] as T) : next;
    };
    return [stateSlots[index] as T, setState];
  },
  useEffect: (effect: () => void | (() => void)) => {
    if (!runEffects) {
      return;
    }
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      cleanups.push(cleanup);
    }
  },
});

/** First render of a fresh component: fresh state slots, effects run. */
async function mountHook(): Promise<number> {
  stateSlots = [];
  cleanups = [];
  slotIndex = 0;
  runEffects = true;
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  return useKeyboardBottomInset();
}

/** A re-render after state changed: same slots, mount effect does not re-run. */
async function rerenderHook(): Promise<number> {
  slotIndex = 0;
  runEffects = false;
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  return useKeyboardBottomInset();
}

const unmountHook = () => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
};

beforeEach(() => {
  rn.Keyboard.removeAllListeners('keyboardWillShow');
  rn.Keyboard.removeAllListeners('keyboardWillHide');
});

test('the inset starts at zero before the keyboard appears', async () => {
  const inset = await mountHook();

  assert.equal(inset, 0);
  unmountHook();
});

test('mounting registers exactly one show and one hide listener', async () => {
  await mountHook();

  assert.deepEqual(
    {
      show: rn.Keyboard.listenerCount('keyboardWillShow'),
      hide: rn.Keyboard.listenerCount('keyboardWillHide'),
    },
    { show: 1, hide: 1 }
  );
  unmountHook();
});

test('iOS listens for the will-show/will-hide events, not the Android did-* ones', async () => {
  await mountHook();

  assert.deepEqual(
    {
      didShow: rn.Keyboard.listenerCount('keyboardDidShow'),
      didHide: rn.Keyboard.listenerCount('keyboardDidHide'),
    },
    { didShow: 0, didHide: 0 }
  );
  unmountHook();
});

test('a keyboard appearing reports the height it covers', async () => {
  await mountHook();

  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 336 } });

  assert.equal(await rerenderHook(), 336);
  unmountHook();
});

test('a taller keyboard (with an accessory bar) replaces the previous height', async () => {
  await mountHook();

  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 336 } });
  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 391 } });

  assert.equal(await rerenderHook(), 391);
  unmountHook();
});

test('a keyboard dismissing returns the inset to zero', async () => {
  await mountHook();
  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 336 } });

  rn.Keyboard.emit('keyboardWillHide', {});

  assert.equal(await rerenderHook(), 0);
  unmountHook();
});

test('unmounting removes both keyboard listeners', async () => {
  await mountHook();

  unmountHook();

  assert.deepEqual(
    {
      show: rn.Keyboard.listenerCount('keyboardWillShow'),
      hide: rn.Keyboard.listenerCount('keyboardWillHide'),
    },
    { show: 0, hide: 0 }
  );
});

test('a keyboard event after unmount no longer moves the inset', async () => {
  await mountHook();
  unmountHook();

  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 336 } });

  assert.equal(await rerenderHook(), 0);
});

test('remounting starts from a zero inset again', async () => {
  await mountHook();
  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height: 336 } });
  unmountHook();

  const remounted = await mountHook();

  assert.equal(remounted, 0);
  unmountHook();
});
