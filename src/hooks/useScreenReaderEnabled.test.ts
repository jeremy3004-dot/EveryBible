import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createReactNativeStub } from '../testing/reactNativeStub';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const screenReader = {
  enabled: false,
  listeners: new Set<(enabled: boolean) => void>(),
  removed: 0,
  /** When set, the native query stays pending until the test resolves it. */
  hold: null as null | { resolve: (enabled: boolean) => void },
};
mockModule(mock, 'react-native', {
  ...createReactNativeStub(),
  AccessibilityInfo: {
    isScreenReaderEnabled: () =>
      screenReader.hold
        ? new Promise<boolean>((resolve) => {
            if (screenReader.hold) screenReader.hold.resolve = resolve;
          })
        : Promise.resolve(screenReader.enabled),
    addEventListener: (event: string, listener: (enabled: boolean) => void) => {
      assert.equal(event, 'screenReaderChanged');
      screenReader.listeners.add(listener);
      return {
        remove: () => {
          screenReader.removed += 1;
          screenReader.listeners.delete(listener);
        },
      };
    },
  },
});

const emit = (enabled: boolean) => {
  screenReader.enabled = enabled;
  for (const listener of screenReader.listeners) listener(enabled);
};

afterEach(() => {
  runtime.unmountAll();
  screenReader.enabled = false;
  screenReader.hold = null;
  screenReader.removed = 0;
});

test('starts off, adopts the running screen reader, follows changes and unsubscribes', async () => {
  const { useScreenReaderEnabled } = await import('./useScreenReaderEnabled');
  screenReader.enabled = true;
  const view = runtime.mount(useScreenReaderEnabled);
  assert.equal(view.result, false, 'first paint does not wait on the native query');
  await view.commit();
  assert.equal(view.rerender(), true);

  emit(false);
  assert.equal(view.rerender(), false);
  emit(true);
  assert.equal(view.rerender(), true);

  view.unmount();
  assert.equal(screenReader.removed, 1);
  assert.equal(screenReader.listeners.size, 0);
});

test('a change event that lands before the initial query answers is not overwritten', async () => {
  const { useScreenReaderEnabled } = await import('./useScreenReaderEnabled');
  screenReader.hold = { resolve: () => {} };
  const view = runtime.mount(useScreenReaderEnabled);
  await view.commit();

  emit(true);
  screenReader.hold.resolve(false); // the stale answer from before the change
  await view.commit();
  assert.equal(view.rerender(), true);
});
