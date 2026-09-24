import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// The reconciler decides *when* the reminder is brought in line with the
// preference; notificationService decides *what* that takes. So the service is
// a recorder here, and the auth store and i18n are small fakes that can emit.
const rn = mockReactNative(mock, { os: 'ios' });

type Preferences = { theme: string; notificationsEnabled: boolean; reminderTime: string | null };
type AuthState = { preferences: Preferences };
type AuthListener = (state: AuthState, previous: AuthState) => void;

const auth = {
  state: {
    preferences: { theme: 'light', notificationsEnabled: true, reminderTime: '07:30' },
  } as AuthState,
  listeners: new Set<AuthListener>(),
  setPreferences(changes: Partial<Preferences>) {
    const previous = auth.state;
    auth.state = { preferences: { ...previous.preferences, ...changes } };
    auth.listeners.forEach((listener) => listener(auth.state, previous));
  },
};
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => auth.state,
    subscribe: (listener: AuthListener) => {
      auth.listeners.add(listener);
      return () => auth.listeners.delete(listener);
    },
  },
});

const i18nListeners = new Set<() => void>();
mockModule(mock, sourcePath('i18n/index.ts'), {
  default: {
    on: (event: string, listener: () => void) => {
      if (event === 'languageChanged') i18nListeners.add(listener);
    },
    off: (event: string, listener: () => void) => {
      if (event === 'languageChanged') i18nListeners.delete(listener);
    },
  },
});

const reconciles: Array<{ notificationsEnabled: boolean; reminderTime: string | null }> = [];
let reconcileFailure: Error | null = null;
mockModule(mock, sourcePath('services/notifications/notificationService.ts'), {
  reconcileDailyReminder: async (preference: {
    notificationsEnabled: boolean;
    reminderTime: string | null;
  }) => {
    reconciles.push(preference);
    if (reconcileFailure) throw reconcileFailure;
  },
});

let installDailyReminderReconciler: typeof import('./dailyReminderReconciler').installDailyReminderReconciler;

before(async () => {
  ({ installDailyReminderReconciler } = await import('./dailyReminderReconciler'));
});

let uninstall: (() => void) | null = null;
const install = () => {
  const handle = installDailyReminderReconciler();
  uninstall = handle.uninstall;
  return handle;
};

beforeEach(() => {
  reconciles.length = 0;
  reconcileFailure = null;
  auth.state = {
    preferences: { theme: 'light', notificationsEnabled: true, reminderTime: '07:30' },
  };
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
});

test('installing reconciles the reminder with the saved preference straight away', async () => {
  const reconciler = install();
  await reconciler.idle();

  assert.deepEqual(reconciles, [{ notificationsEnabled: true, reminderTime: '07:30' }]);
});

test('a change to the reminder preference (sync pull, sign-out reset) is reconciled', async () => {
  const reconciler = install();
  await reconciler.idle();

  auth.setPreferences({ notificationsEnabled: false });
  await reconciler.idle();

  assert.deepEqual(reconciles.at(-1), { notificationsEnabled: false, reminderTime: '07:30' });
});

test('an unrelated preference change does not touch the reminder', async () => {
  const reconciler = install();
  await reconciler.idle();

  auth.setPreferences({ theme: 'dark' });
  await reconciler.idle();

  assert.equal(reconciles.length, 1);
});

test('a change of app language is reconciled so the reminder text follows it', async () => {
  const reconciler = install();
  await reconciler.idle();

  i18nListeners.forEach((listener) => listener());
  await reconciler.idle();

  assert.equal(reconciles.length, 2);
});

test('returning to the foreground is reconciled, going to the background is not', async () => {
  const reconciler = install();
  await reconciler.idle();

  rn.AppState.emit('background');
  await reconciler.idle();
  rn.AppState.emit('active');
  await reconciler.idle();

  assert.equal(reconciles.length, 2);
});

test('a failed reconcile is swallowed and the next trigger still runs', async () => {
  reconcileFailure = new Error('notifications unavailable');
  const reconciler = install();
  await reconciler.idle();

  reconcileFailure = null;
  auth.setPreferences({ reminderTime: '21:00' });
  await reconciler.idle();

  assert.deepEqual(reconciles.at(-1), { notificationsEnabled: true, reminderTime: '21:00' });
});

test('uninstalling removes every listener it added', async () => {
  const reconciler = install();
  await reconciler.idle();
  const listenersWhileInstalled = [
    auth.listeners.size,
    i18nListeners.size,
    rn.AppState.listenerCount(),
  ];

  reconciler.uninstall();
  uninstall = null;

  assert.deepEqual(listenersWhileInstalled, [1, 1, 1]);
  assert.deepEqual(
    [auth.listeners.size, i18nListeners.size, rn.AppState.listenerCount()],
    [0, 0, 0]
  );
});
