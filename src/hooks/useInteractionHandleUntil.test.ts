import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createReactNativeStub } from '../testing/reactNativeStub';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const interactions = { open: new Set<number>(), created: 0 };
mockModule(mock, 'react-native', {
  ...createReactNativeStub({ os: 'ios' }),
  InteractionManager: {
    createInteractionHandle: () => {
      interactions.created += 1;
      interactions.open.add(interactions.created);
      return interactions.created;
    },
    clearInteractionHandle: (handle: number) => {
      assert.ok(interactions.open.delete(handle), 'only an open handle is cleared, once');
    },
  },
});

afterEach(() => {
  runtime.unmountAll();
  interactions.open.clear();
});

async function load() {
  const { useInteractionHandleUntil } = await import('./useInteractionHandleUntil');
  return useInteractionHandleUntil;
}

// React Native runs runAfterInteractions work with setImmediate, at the end of the
// current JS batch and before that batch's view updates reach the native side. Releasing
// in the commit's own batch would run the held work ahead of the content it waited for.
test('the handle is held until the batch after the content is committed', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const useInteractionHandleUntil = await load();
  const view = runtime.mount(useInteractionHandleUntil, false, 1500);
  view.flushEffects();
  assert.equal(interactions.open.size, 1, 'held while loading');

  view.rerender(true, 1500);
  view.flushEffects();
  assert.equal(interactions.open.size, 1, 'still held within the batch that drew the content');

  context.mock.timers.tick(0);
  assert.equal(interactions.open.size, 0);
});

test('content that never finishes releases the handle after the cap', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const useInteractionHandleUntil = await load();
  const view = runtime.mount(useInteractionHandleUntil, false, 1500);
  view.flushEffects();

  context.mock.timers.tick(1499);
  assert.equal(interactions.open.size, 1);
  context.mock.timers.tick(1);
  assert.equal(interactions.open.size, 0);
});

test('leaving the screen releases the handle, and later renders take no new one', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const useInteractionHandleUntil = await load();
  const view = runtime.mount(useInteractionHandleUntil, false, 1500);
  view.flushEffects();
  view.unmount();
  assert.equal(interactions.open.size, 0);

  const done = runtime.mount(useInteractionHandleUntil, true, 1500);
  done.flushEffects();
  context.mock.timers.tick(0);
  done.rerender(false, 1500);
  done.flushEffects();
  assert.equal(interactions.open.size, 0, 'a later chapter change holds nothing');
});
