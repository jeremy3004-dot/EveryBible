import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock);

const permission = {
  status: 'granted' as 'granted' | 'denied' | 'undetermined',
  /** Android: the user switched off the reminder's own notification channel. */
  channelOff: false,
  failure: null as Error | null,
  reads: 0,
};
// The notification service is imported lazily so Settings does not load it early.
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  getDailyReminderSystemState: async () => {
    permission.reads += 1;
    if (permission.failure) {
      throw permission.failure;
    }
    if (permission.status === 'undetermined') return 'needs-permission';
    return permission.status === 'denied' || permission.channelOff ? 'blocked' : 'allowed';
  },
});

type Hook = typeof import('./useNotificationsBlockedBySystem').useNotificationsBlockedBySystem;
let useNotificationsBlockedBySystem: Hook;
let notifyNotificationPermissionRequested: () => void;

before(async () => {
  ({ useNotificationsBlockedBySystem } = await import('./useNotificationsBlockedBySystem'));
  ({ notifyNotificationPermissionRequested } =
    await import('../services/notifications/notificationPermissionEvents'));
  await import('../services/notifications');
});

beforeEach(() => {
  permission.status = 'granted';
  permission.channelOff = false;
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

  assert.equal(view.result, 'blocked');
});

test('a reminder whose Android channel was switched off in system settings is reported', async () => {
  permission.channelOff = true;

  const view = await mountSettings(true);

  assert.equal(view.result, 'blocked');
});

test('a reminder with notification permission granted shows no warning', async () => {
  const view = await mountSettings(true);

  assert.equal(view.result, null);
});

test('a reminder synced on to a device never asked for permission reports that it needs it', async () => {
  permission.status = 'undetermined';

  const view = await mountSettings(true);

  assert.equal(view.result, 'needs-permission');
});

test('the in-app permission prompt re-checks, so the notice clears once allowed', async () => {
  // Android does not reliably send the app through the background for its prompt.
  permission.status = 'undetermined';
  const view = await mountSettings(true);
  assert.equal(view.result, 'needs-permission');

  permission.status = 'granted';
  notifyNotificationPermissionRequested();
  await settle();
  view.rerender();

  assert.equal(view.result, null);
});

test('a reminder that is off never warns and never reads the permission', async () => {
  permission.status = 'denied';

  const view = await mountSettings(false);

  assert.equal(view.result, null);
  assert.equal(permission.reads, 0);
});

test('returning from system settings re-checks, so the warning clears once allowed', async () => {
  permission.status = 'denied';
  const view = await mountSettings(true);
  assert.equal(view.result, 'blocked');

  permission.status = 'granted';
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await settle();
  view.rerender();

  assert.equal(view.result, null);
  assert.equal(permission.reads, 2, 'only the return to the foreground re-reads it');
});

test('a permission revoked while the app was in the background shows the warning on return', async () => {
  const view = await mountSettings(true);
  assert.equal(view.result, null);

  permission.status = 'denied';
  rn.AppState.emit('active');
  await settle();
  view.rerender();

  assert.equal(view.result, 'blocked');
});

test('a permission that cannot be read shows no warning rather than a false alarm', async () => {
  permission.failure = new Error('native module unavailable');

  const view = await mountSettings(true);

  assert.equal(view.result, null);
});

test('unmounting stops listening for the foreground and for in-app prompts', async () => {
  const view = await mountSettings(true);
  assert.equal(rn.AppState.listenerCount(), 1);

  view.unmount();
  notifyNotificationPermissionRequested();
  await settle();

  assert.equal(rn.AppState.listenerCount(), 0);
  assert.equal(permission.reads, 1, 'a prompt after unmounting reads nothing');
});
