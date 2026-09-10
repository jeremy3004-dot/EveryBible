import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime, type MountedHook } from '../testing/reactHookRuntime';

// Android branch. Platform.OS is read inside the effect, but a whole-file stub
// keeps the two platforms from sharing mutable module state
// (useKeyboardBottomInset.test.ts covers iOS).
const rn = mockReactNative(mock, { os: 'android' });

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let view: MountedHook<[], number> | null = null;

afterEach(() => {
  runtime.unmountAll();
  view = null;
});

async function mountHook(): Promise<number> {
  const { useKeyboardBottomInset } = await import('./useKeyboardBottomInset');
  view = runtime.mount(useKeyboardBottomInset);
  view.flushEffects();
  return view.result;
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

  assert.equal(view!.cleanupCount, 0);
});

test('an Android keyboard event cannot move the inset', async () => {
  await mountHook();

  rn.Keyboard.emit('keyboardDidShow', { endCoordinates: { height: 280 } });

  assert.equal(await mountHook(), 0);
});
