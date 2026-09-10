import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime, type MountedHook } from '../testing/reactHookRuntime';

// iOS branch (utils/../useKeyboardBottomInset.android.test.ts covers the other).
const rn = mockReactNative(mock, { os: 'ios' });

// There is no renderer, so `react` is the shared hook runtime: state slots that
// survive a re-render, and effects that run when the harness commits them.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let view: MountedHook<[], number> | null = null;

/** First render of a fresh component: fresh state slots, effects committed. */
async function mountHook(): Promise<number> {
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  view = runtime.mount(useKeyboardBottomInset);
  view.flushEffects();
  return view.result;
}

/** A re-render after state changed: same slots, mount effect does not re-run. */
async function rerenderHook(): Promise<number> {
  return view!.rerender();
}

const unmountHook = () => {
  runtime.unmountAll();
};

afterEach(unmountHook);

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
