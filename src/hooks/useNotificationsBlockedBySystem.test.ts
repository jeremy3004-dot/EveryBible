import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock);

const permission = {
  status: 'granted' as 'granted' | 'denied' | 'undetermined',
  failure: null as Error | null,
  reads: 0,
};
// The notification service is imported lazily so Settings does not load it early.
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  getNotificationPermissionStatus: async () => {
    permission.reads += 1;
    if (permission.failure) {
      throw permission.failure;
    }
    return permission.status;
  },
});

type Hook = typeof import('./useNotificationsBlockedBySystem').useNotificationsBlockedBySystem;
let useNotificationsBlockedBySystem: Hook;

before(async () => {
  ({ useNotificationsBlockedBySystem } = await import('./useNotificationsBlockedBySystem'));
  await import('../services/notifications');
});

beforeEach(() => {
  permission.status = 'granted';
  permission.failure = null;
  permission.reads = 0;
});

afterEach(() => {
  runtime.unmountAll();
});

async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function mountSettings(reminderEnabled: boolean) {
  const view = runtime.mount(useNotificationsBlockedBySystem, reminderEnabled);
  await view.commit();
  await settle();
  view.rerender();
  return view;
}

test('a reminder that is on while the system blocks notifications is reported', async () => {
  permission.status = 'denied';

  const view = await mountSettings(true);

  assert.equal(view.result, true);
});

test('a reminder with notification permission granted shows no warning', async () => {
  const view = await mountSettings(true);

  assert.equal(view.result, false);
});

test('a reminder that is off never warns and never reads the permission', async () => {
  permission.status = 'denied';

  const view = await mountSettings(false);

  assert.equal(view.result, false);
  assert.equal(permission.reads, 0);
});

test('returning from system settings re-checks, so the warning clears once allowed', async () => {
  permission.status = 'denied';
  const view = await mountSettings(true);
  assert.equal(view.result, true);

  permission.status = 'granted';
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await settle();
  view.rerender();

  assert.equal(view.result, false);
  assert.equal(permission.reads, 2, 'only the return to the foreground re-reads it');
});

test('a permission revoked while the app was in the background shows the warning on return', async () => {
  const view = await mountSettings(true);
  assert.equal(view.result, false);

  permission.status = 'denied';
  rn.AppState.emit('active');
  await settle();
  view.rerender();

  assert.equal(view.result, true);
});

test('a permission that cannot be read shows no warning rather than a false alarm', async () => {
  permission.failure = new Error('native module unavailable');

  const view = await mountSettings(true);

  assert.equal(view.result, false);
});

test('unmounting stops listening for the app returning to the foreground', async () => {
  const view = await mountSettings(true);
  assert.equal(rn.AppState.listenerCount(), 1);

  view.unmount();

  assert.equal(rn.AppState.listenerCount(), 0);
});
