import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime, type MountedHook } from '../testing/reactHookRuntime';
import type {
  KeyboardMeasurableSurface,
  UseKeyboardBottomInsetOptions,
} from './useKeyboardBottomInset';

// Android branch. Platform.OS is read inside the effect, but a whole-file stub
// keeps the two platforms from sharing mutable module state
// (useKeyboardBottomInset.test.ts covers iOS).
const rn = mockReactNative(mock, { os: 'android' });

// There is no renderer, so `react` is the shared hook runtime: state slots that
// survive a re-render, and effects that run when the harness commits them.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let view: MountedHook<[UseKeyboardBottomInsetOptions], number> | null = null;

async function mountHook(options: UseKeyboardBottomInsetOptions = {}): Promise<number> {
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  view = runtime.mount(useKeyboardBottomInset, options);
  view.flushEffects();
  return view.result;
}

async function rerenderHook(options: UseKeyboardBottomInsetOptions = {}): Promise<number> {
  view!.rerender(options);
  view!.flushEffects();
  return view!.result;
}

const unmountHook = () => {
  runtime.unmountAll();
};

/** A host View that reports its own window rectangle, as measureInWindow does. */
const measureCalls: string[] = [];
const surfaceAt = (top: number, height: number): KeyboardMeasurableSurface => ({
  measureInWindow: (callback) => {
    measureCalls.push(`${top}+${height}`);
    callback(0, top, 360, height);
  },
});

/** Android only reports the keyboard once it is up, and gives its top edge. */
const didShow = (keyboardTopY: number, height = 915 - keyboardTopY) =>
  rn.Keyboard.emit('keyboardDidShow', { endCoordinates: { height, screenY: keyboardTopY } });

afterEach(() => {
  unmountHook();
  view = null;
});

beforeEach(() => {
  for (const event of [
    'keyboardWillShow',
    'keyboardWillHide',
    'keyboardDidShow',
    'keyboardDidHide',
  ]) {
    rn.Keyboard.removeAllListeners(event);
  }
  measureCalls.length = 0;
});

test('Android listens for the did-show/did-hide events, not the iOS will-* ones', async () => {
  await mountHook({ surfaceRef: { current: surfaceAt(0, 915) } });

  assert.deepEqual(
    {
      didShow: rn.Keyboard.listenerCount('keyboardDidShow'),
      didHide: rn.Keyboard.listenerCount('keyboardDidHide'),
      willShow: rn.Keyboard.listenerCount('keyboardWillShow'),
      willHide: rn.Keyboard.listenerCount('keyboardWillHide'),
    },
    { didShow: 1, didHide: 1, willShow: 0, willHide: 0 }
  );
  unmountHook();
});

test('the inset is how far the surface reaches past the top of the keyboard', async () => {
  const surfaceRef = { current: surfaceAt(0, 915) };
  await mountHook({ surfaceRef });

  didShow(635);

  // The surface ends at 915; the keyboard starts at 635, so 280pt is hidden.
  assert.equal(await rerenderHook({ surfaceRef }), 280);
  unmountHook();
});

test('the reported keyboard height is not used, because it excludes the nav bar', async () => {
  const surfaceRef = { current: surfaceAt(0, 915) };
  await mountHook({ surfaceRef });

  // A keyboard whose reported height (200) disagrees with its measured top edge.
  didShow(635, 200);

  assert.equal(await rerenderHook({ surfaceRef }), 280);
  unmountHook();
});

test('a surface the window already resized above the keyboard needs no extra room', async () => {
  const surfaceRef = { current: surfaceAt(0, 600) };
  await mountHook({ surfaceRef });

  didShow(635);

  assert.equal(await rerenderHook({ surfaceRef }), 0);
  unmountHook();
});

test('a surface offset down the window is measured from its own bottom edge', async () => {
  const surfaceRef = { current: surfaceAt(100, 700) };
  await mountHook({ surfaceRef });

  didShow(635);

  // The surface ends at 800, so only 165pt of it is behind the keyboard.
  assert.equal(await rerenderHook({ surfaceRef }), 165);
  unmountHook();
});

test('the safe-area inset is not discounted on Android, where the measurement already includes it', async () => {
  const surfaceRef = { current: surfaceAt(0, 915) };
  await mountHook({ surfaceRef, safeAreaBottomInset: 34 });

  didShow(635);

  assert.equal(await rerenderHook({ surfaceRef, safeAreaBottomInset: 34 }), 280);
  unmountHook();
});

test('without a surface to measure the inset stays at zero, as it always did', async () => {
  await mountHook();

  didShow(635);

  assert.equal(await rerenderHook(), 0);
  assert.deepEqual(measureCalls, []);
  unmountHook();
});

test('a surface ref that has not attached yet reports zero rather than guessing', async () => {
  const surfaceRef = { current: null as KeyboardMeasurableSurface | null };
  await mountHook({ surfaceRef });

  didShow(635);

  assert.equal(await rerenderHook({ surfaceRef }), 0);
  unmountHook();
});

test('a surface that attaches after mount is measured without re-subscribing', async () => {
  const surfaceRef = { current: null as KeyboardMeasurableSurface | null };
  await mountHook({ surfaceRef });

  surfaceRef.current = surfaceAt(0, 915);
  didShow(635);

  assert.equal(await rerenderHook({ surfaceRef }), 280);
  assert.equal(rn.Keyboard.listenerCount('keyboardDidShow'), 1);
  unmountHook();
});

test('the surface is re-measured on every keyboard appearance, not cached', async () => {
  const surfaceRef = { current: surfaceAt(0, 915) };
  await mountHook({ surfaceRef });

  didShow(635);
  didShow(500);

  assert.equal(await rerenderHook({ surfaceRef }), 415);
  assert.equal(measureCalls.length, 2);
  unmountHook();
});

test('dismissing the keyboard returns the inset to zero', async () => {
  const surfaceRef = { current: surfaceAt(0, 915) };
  await mountHook({ surfaceRef });
  didShow(635);

  rn.Keyboard.emit('keyboardDidHide', {});

  assert.equal(await rerenderHook({ surfaceRef }), 0);
  unmountHook();
});

test('unmounting removes both keyboard listeners', async () => {
  await mountHook({ surfaceRef: { current: surfaceAt(0, 915) } });

  unmountHook();

  assert.deepEqual(
    {
      didShow: rn.Keyboard.listenerCount('keyboardDidShow'),
      didHide: rn.Keyboard.listenerCount('keyboardDidHide'),
    },
    { didShow: 0, didHide: 0 }
  );
});
