import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime, type MountedHook } from '../testing/reactHookRuntime';
import type { UseKeyboardBottomInsetOptions } from './useKeyboardBottomInset';

// iOS branch (useKeyboardBottomInset.android.test.ts covers the measured one).
const rn = mockReactNative(mock, { os: 'ios' });

// There is no renderer, so `react` is the shared hook runtime: state slots that
// survive a re-render, and effects that run when the harness commits them.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let view: MountedHook<[UseKeyboardBottomInsetOptions], number> | null = null;

/** First render of a fresh component: fresh state slots, every effect runs. */
async function mountHook(options: UseKeyboardBottomInsetOptions = {}): Promise<number> {
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  view = runtime.mount(useKeyboardBottomInset, options);
  view.flushEffects();
  return view.result;
}

/** A re-render: same slots, so only effects whose deps changed run again. */
async function rerenderHook(options: UseKeyboardBottomInsetOptions = {}): Promise<number> {
  view!.rerender(options);
  view!.flushEffects();
  return view!.result;
}

const unmountHook = () => {
  runtime.unmountAll();
};

const willShow = (height: number) =>
  rn.Keyboard.emit('keyboardWillShow', { endCoordinates: { height, screenY: 844 - height } });

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

  willShow(336);

  assert.equal(await rerenderHook(), 336);
  unmountHook();
});

test('iOS never measures the surface, so a surfaceRef changes nothing', async () => {
  const surfaceRef = {
    current: {
      measureInWindow: () => {
        throw new Error('iOS must not measure the surface');
      },
    },
  };
  await mountHook({ surfaceRef });

  willShow(336);

  assert.equal(await rerenderHook({ surfaceRef }), 336);
  unmountHook();
});

test('the bottom inset the layout already reserves comes back off the keyboard height', async () => {
  await mountHook({ safeAreaBottomInset: 34 });

  willShow(336);

  assert.equal(await rerenderHook({ safeAreaBottomInset: 34 }), 302);
  unmountHook();
});

test('a safe-area inset that changes between renders is used without re-subscribing', async () => {
  await mountHook({ safeAreaBottomInset: 0 });

  await rerenderHook({ safeAreaBottomInset: 34 });
  willShow(336);

  assert.equal(await rerenderHook({ safeAreaBottomInset: 34 }), 302);
  assert.equal(
    rn.Keyboard.listenerCount('keyboardWillShow'),
    1,
    'the subscription must survive an inset change mid-animation'
  );
  unmountHook();
});

test('a safe-area inset larger than the keyboard never yields a negative inset', async () => {
  await mountHook({ safeAreaBottomInset: 400 });

  willShow(336);

  assert.equal(await rerenderHook({ safeAreaBottomInset: 400 }), 0);
  unmountHook();
});

test('a taller keyboard (with an accessory bar) replaces the previous height', async () => {
  await mountHook();

  willShow(336);
  willShow(391);

  assert.equal(await rerenderHook(), 391);
  unmountHook();
});

test('a keyboard dismissing returns the inset to zero', async () => {
  await mountHook();
  willShow(336);

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

  willShow(336);

  assert.equal(await rerenderHook(), 0);
});

test('remounting starts from a zero inset again', async () => {
  await mountHook();
  willShow(336);
  unmountHook();

  const remounted = await mountHook();

  assert.equal(remounted, 0);
  unmountHook();
});
