import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';

// The reconciler decides *when* the reminder is brought in line with the
// preference; notificationService decides *what* that takes. So the service is
// a recorder here, and the auth store and i18n are small fakes that can emit.
const rn = mockReactNative(mock, { os: 'ios' });
// The persisted "a reminder may be scheduled" flag (dailyReminderScheduleMarker.ts).
const mmkv = mockMmkvStorage(mock);
const MAY_BE_SCHEDULED_KEY = 'daily-reminder-may-be-scheduled';

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

type PrivacyState = { isInitialized: boolean; mode: 'standard' | 'discreet' };
type PrivacyListener = (state: PrivacyState, previous: PrivacyState) => void;
const privacy = {
  state: { isInitialized: true, mode: 'standard' } as PrivacyState,
  listeners: new Set<PrivacyListener>(),
  set(changes: Partial<PrivacyState>) {
    const previous = privacy.state;
    privacy.state = { ...previous, ...changes };
    privacy.listeners.forEach((listener) => listener(privacy.state, previous));
  },
};
mockModule(mock, sourcePath('stores/privacyStore.ts'), {
  usePrivacyStore: {
    getState: () => privacy.state,
    subscribe: (listener: PrivacyListener) => {
      privacy.listeners.add(listener);
      return () => privacy.listeners.delete(listener);
    },
  },
  isDiscreetModeActive: (state: PrivacyState = privacy.state) =>
    !state.isInitialized || state.mode === 'discreet',
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
    // What the real service leaves behind: set when it schedules, cleared once cancelled.
    mmkv.store.set(MAY_BE_SCHEDULED_KEY, preference.notificationsEnabled ? '1' : '0');
  },
});

let installDailyReminderReconciler: typeof import('./dailyReminderReconciler').installDailyReminderReconciler;

before(async () => {
  ({ installDailyReminderReconciler } = await import('./dailyReminderReconciler'));
});

let uninstall: (() => void) | null = null;
/** How many times the reconciler reached for the notification service. */
let serviceLoads = 0;
const install = () => {
  const handle = installDailyReminderReconciler(() => {
    serviceLoads += 1;
    return import('./notificationService');
  });
  uninstall = handle.uninstall;
  return handle;
};

beforeEach(() => {
  reconciles.length = 0;
  reconcileFailure = null;
  serviceLoads = 0;
  mmkv.store.clear();
  rn.Platform.OS = 'ios';
  privacy.state = { isInitialized: true, mode: 'standard' };
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

test('turning discreet mode on or off is reconciled so the reminder text is replaced', async () => {
  const reconciler = install();
  await reconciler.idle();

  privacy.set({ mode: 'discreet' });
  await reconciler.idle();
  privacy.set({ mode: 'standard' });
  await reconciler.idle();

  assert.equal(reconciles.length, 3);
});

test('a privacy store update that leaves discreet mode unchanged does not touch the reminder', async () => {
  const reconciler = install();
  await reconciler.idle();

  privacy.set({ mode: 'standard' });
  await reconciler.idle();

  assert.equal(reconciles.length, 1);
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
    privacy.listeners.size,
  ];

  reconciler.uninstall();
  uninstall = null;

  assert.deepEqual(listenersWhileInstalled, [1, 1, 1, 1]);
  assert.deepEqual(
    [auth.listeners.size, i18nListeners.size, rn.AppState.listenerCount(), privacy.listeners.size],
    [0, 0, 0, 0]
  );
});

// ─── Launch cost with the reminder off ───────────────────────────────────────

test('with the reminder off and nothing left scheduled, launch and foreground skip the service', async () => {
  auth.state = { preferences: { theme: 'light', notificationsEnabled: false, reminderTime: null } };
  mmkv.store.set(MAY_BE_SCHEDULED_KEY, '0');
  const reconciler = install();
  await reconciler.idle();

  rn.AppState.emit('active');
  i18nListeners.forEach((listener) => listener());
  privacy.set({ mode: 'discreet' });
  await reconciler.idle();

  assert.deepEqual([serviceLoads, reconciles.length], [0, 0]);
});

test('a reminder left scheduled is still cancelled at launch with the reminder off', async () => {
  // Turned off on another device while this one was closed: it must stop firing.
  auth.state = { preferences: { theme: 'light', notificationsEnabled: false, reminderTime: null } };
  mmkv.store.set(MAY_BE_SCHEDULED_KEY, '1');
  const reconciler = install();
  await reconciler.idle();

  assert.deepEqual(reconciles, [{ notificationsEnabled: false, reminderTime: null }]);
  assert.equal(mmkv.store.get(MAY_BE_SCHEDULED_KEY), '0');

  rn.AppState.emit('active');
  await reconciler.idle();
  assert.equal(serviceLoads, 1, 'once cancelled, the next foreground skips the service');
});

test('an install from before the flag existed cancels once at launch, whatever an older build left', async () => {
  auth.state = { preferences: { theme: 'light', notificationsEnabled: false, reminderTime: null } };
  const reconciler = install();
  await reconciler.idle();

  assert.deepEqual(reconciles, [{ notificationsEnabled: false, reminderTime: null }]);
});

test('turning the reminder off right after turning it on still cancels the one just scheduled', async () => {
  auth.state = { preferences: { theme: 'light', notificationsEnabled: false, reminderTime: null } };
  mmkv.store.set(MAY_BE_SCHEDULED_KEY, '0');
  const reconciler = install();
  await reconciler.idle();

  // The "on" reconcile is still queued when the "off" arrives.
  auth.setPreferences({ notificationsEnabled: true, reminderTime: '07:30' });
  auth.setPreferences({ notificationsEnabled: false });
  await reconciler.idle();

  assert.deepEqual(
    reconciles.map((preference) => preference.notificationsEnabled),
    [true, false]
  );
  assert.equal(mmkv.store.get(MAY_BE_SCHEDULED_KEY), '0');
});

test('Android still reconciles with the reminder off, so the channel name follows language and discreet mode', async () => {
  rn.Platform.OS = 'android';
  auth.state = { preferences: { theme: 'light', notificationsEnabled: false, reminderTime: null } };
  mmkv.store.set(MAY_BE_SCHEDULED_KEY, '0');
  const reconciler = install();
  await reconciler.idle();

  privacy.set({ mode: 'discreet' });
  await reconciler.idle();

  assert.equal(reconciles.length, 2);
});
