import test, { afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockExpoCrypto,
  mockModule,
  mockSecureStore,
  sourcePath,
} from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import { createReactNativeStub } from '../../../testing/reactNativeStub';

/**
 * Turning the daily reminder on in discreet mode on Android: the notification permission
 * dialog pauses the activity (AppState 'background'). That used to lock discreet mode,
 * remounting Settings under the lock, so the grant was dropped and the reminder stayed
 * off. The dialog is the app's own, so the lock waits, and the grant schedules the
 * reminder.
 */
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = createReactNativeStub({ os: 'android' });
mockModule(mock, 'react-native', rn);
mockExpoCrypto(mock);
mockSecureStore(mock);
mockModule(mock, 'react-i18next', { useTranslation: () => ({ t: (key: string) => key }) });

interface FakePreferences {
  notificationsEnabled: boolean;
  reminderTime: string | null;
}
// Only what the hook reads. (zustand would bind to the real React, not the test runtime.)
const auth = {
  preferences: { notificationsEnabled: false, reminderTime: '07:30' } as FakePreferences,
  setPreferences: (next: Partial<FakePreferences>) => {
    auth.preferences = { ...auth.preferences, ...next };
  },
};
const authStore = <T>(selector: (state: typeof auth) => T): T => selector(auth);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: authStore });
mockModule(mock, sourcePath('services/sync/index.ts'), { syncPreferences: async () => {} });
mockModule(mock, sourcePath('utils/index.ts'), { lightHaptic: () => undefined });

const scheduled: string[] = [];
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  // Android's dialog: the activity pauses while it is up and resumes once answered.
  requestNotificationPermissionOutcome: async () => {
    rn.AppState.emit('background');
    await new Promise((resolve) => setImmediate(resolve));
    rn.AppState.emit('active');
    return 'granted';
  },
  scheduleDailyReminder: async (hour: number, minute: number) => {
    scheduled.push(`${hour}:${minute}`);
  },
  cancelDailyReminder: async () => {},
});

const mmkv = new Map<string, string>();
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance: {
    getString: (key: string) => mmkv.get(key),
    set: (key: string, value: string) => mmkv.set(key, String(value)),
    delete: (key: string) => mmkv.delete(key),
    contains: (key: string) => mmkv.has(key),
    getAllKeys: () => Array.from(mmkv.keys()),
    clearAll: () => mmkv.clear(),
  },
  zustandStorage: {
    getItem: (name: string) => mmkv.get(name) ?? null,
    setItem: (name: string, value: string) => mmkv.set(name, value),
    removeItem: (name: string) => mmkv.delete(name),
  },
});
mockModule(mock, '@react-native-async-storage/async-storage', {
  default: { getItem: async () => null, setItem: async () => {} },
});
mockModule(mock, sourcePath('stores/migrateFromAsyncStorage.ts'), {
  migrateFromAsyncStorage: async () => {},
});

let usePrivacyLock: typeof import('../../../hooks/usePrivacyLock').usePrivacyLock;
let usePrivacyStore: typeof import('../../../stores/privacyStore').usePrivacyStore;
let useReminderSettings: typeof import('./useReminderSettings').useReminderSettings;

before(async () => {
  ({ usePrivacyLock } = await import('../../../hooks/usePrivacyLock'));
  ({ usePrivacyStore } = await import('../../../stores/privacyStore'));
  ({ useReminderSettings } = await import('./useReminderSettings'));
});

afterEach(() => runtime.unmountAll());

test('granting notifications in discreet mode on Android schedules the reminder without locking', async () => {
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: true,
    isLocked: false,
  });
  const lock = runtime.mount(usePrivacyLock);
  lock.flushEffects();
  const settings = runtime.mount(useReminderSettings);

  await settings.result.handleNotificationToggle();

  assert.equal(usePrivacyStore.getState().isLocked, false, 'the dialog did not lock');
  assert.deepEqual(scheduled, ['7:30']);
  assert.equal(auth.preferences.notificationsEnabled, true);
});
