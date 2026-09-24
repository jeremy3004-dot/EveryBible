import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const network = {
  listener: null as ((offline: boolean) => void) | null,
  unsubscribes: 0,
};
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  subscribeToDeviceOffline: (listener: (offline: boolean) => void) => {
    network.listener = listener;
    return () => {
      network.unsubscribes += 1;
      network.listener = null;
    };
  },
});

afterEach(() => runtime.unmountAll());

test('the hook starts online, follows NetInfo, and unsubscribes on unmount', async () => {
  const { useDeviceOffline } = await import('./useDeviceOffline');
  const view = runtime.mount(useDeviceOffline);
  assert.equal(view.result, false, 'first paint does not wait for NetInfo');
  await view.commit();

  network.listener?.(true);
  view.rerender();
  assert.equal(view.result, true);

  network.listener?.(false);
  view.rerender();
  assert.equal(view.result, false);

  view.unmount();
  assert.equal(network.unsubscribes, 1);
  assert.equal(network.listener, null);
});
