import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import type { PrivacyAppIconMode } from '../../types';
import type { PrivacyLockHint } from './privacyLockHint';

/**
 * Discreet mode keeps the app out of the recents / app-switcher preview. The native
 * package is mocked by name; every call it receives is recorded in order.
 */
const nativeCalls: string[] = [];
let nativeFailure: Error | null = null;
const recordNative =
  (name: string) =>
  async (...args: unknown[]): Promise<void> => {
    nativeCalls.push(args.length > 0 ? `${name}(${args.map(String).join(', ')})` : `${name}()`);
    if (nativeFailure) {
      throw nativeFailure;
    }
  };

// Mirrors the package's own JS bookkeeping: a key is marked active before the native
// call, so preventing again with a key still marked never reaches the native module.
const activeKeys = new Set<string>();
const recordPrevent = recordNative('preventScreenCaptureAsync');
const recordAllow = recordNative('allowScreenCaptureAsync');
// Android sets FLAG_SECURE on the current activity's window only. Switching the launcher
// alias creates a new activity, and so a new window without the flag.
let currentWindow = 1;
const secureWindows = new Set<number>();
const preventNative = async (key: string): Promise<void> => {
  await recordPrevent(key);
  secureWindows.add(currentWindow);
};
const allowNative = async (key: string): Promise<void> => {
  await recordAllow(key);
  secureWindows.delete(currentWindow);
};
const windowListeners = new Set<() => void>();
/** The alias switch: a new activity window comes up and the app is active again. */
const openNewWindow = () => {
  currentWindow += 1;
  windowListeners.forEach((listener) => listener());
};
/** The app coming back to the foreground on the same window. */
const returnToSameWindow = () => windowListeners.forEach((listener) => listener());

mockPackage(mock, 'expo-screen-capture', {
  preventScreenCaptureAsync: async (key = 'default') => {
    if (!activeKeys.has(key)) {
      activeKeys.add(key);
      await preventNative(key);
    }
  },
  allowScreenCaptureAsync: async (key = 'default') => {
    activeKeys.delete(key);
    if (activeKeys.size === 0) {
      await allowNative(key);
    }
  },
  enableAppSwitcherProtectionAsync: recordNative('enableAppSwitcherProtectionAsync'),
  disableAppSwitcherProtectionAsync: recordNative('disableAppSwitcherProtectionAsync'),
  isAvailableAsync: async () => true,
});

const reportedErrors: { source: string; message: string }[] = [];
let reportWaiters: (() => void)[] = [];
/** Resolves on the next report: the crash queue is loaded by a lazy import. */
const nextReport = () => new Promise<void>((resolve) => reportWaiters.push(resolve));
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reportedErrors.push({
      source,
      message: error instanceof Error ? error.message : String(error),
    });
    const waiters = reportWaiters;
    reportWaiters = [];
    waiters.forEach((resolve) => resolve());
  },
});

interface FakePrivacyState {
  isInitialized: boolean;
  mode: PrivacyAppIconMode;
  initializationError: 'timeout' | 'unavailable' | null;
}

const UNINITIALIZED: FakePrivacyState = {
  isInitialized: false,
  mode: 'standard',
  initializationError: null,
};

// Only the fields the service reads; the real privacyStore starts in this same state.
const privacyStore = create<FakePrivacyState>()(() => UNINITIALIZED);
let lockHint: PrivacyLockHint | null = null;
let moduleLoads = 0;
const handles: { stop(): void }[] = [];

beforeEach(() => {
  nativeCalls.length = 0;
  activeKeys.clear();
  nativeFailure = null;
  reportedErrors.length = 0;
  reportWaiters = [];
  privacyStore.setState(UNINITIALIZED, true);
  lockHint = null;
  moduleLoads = 0;
  currentWindow = 1;
  secureWindows.clear();
  windowListeners.clear();
});

// A failed assertion must not leave a subscription behind to answer the next test's changes.
afterEach(() => {
  handles.splice(0).forEach((handle) => handle.stop());
});

const start = async (platform: string) => {
  const { startScreenCaptureProtection } = await import('./screenCaptureProtection');
  const handle = startScreenCaptureProtection({
    platform,
    store: privacyStore,
    readLockHint: () => lockHint,
    loadScreenCapture: () => {
      moduleLoads += 1;
      return import('expo-screen-capture');
    },
    subscribeToWindowChanges: (listener) => {
      windowListeners.add(listener);
      return () => windowListeners.delete(listener);
    },
  });
  handles.push(handle);
  return handle;
};

const becomes = (state: Partial<FakePrivacyState>) =>
  privacyStore.setState({ isInitialized: true, initializationError: null, ...state });

test('a discreet install on Android keeps its content out of recents from launch', async () => {
  lockHint = 'discreet';
  const protection = await start('android');
  becomes({ mode: 'discreet' });
  await protection.settled();

  assert.deepEqual(nativeCalls, ['preventScreenCaptureAsync(discreet)']);
});

test('a discreet install on iOS covers the app switcher snapshot at full blur and still allows screenshots', async () => {
  privacyStore.setState({ isInitialized: true, mode: 'discreet' });
  const protection = await start('ios');
  await protection.settled();

  assert.deepEqual(nativeCalls, ['enableAppSwitcherProtectionAsync(1)']);
});

test('a discreet lock hint protects the screen before privacy settings have loaded', async () => {
  lockHint = 'discreet';
  const protection = await start('android');
  await protection.settled();

  assert.equal(privacyStore.getState().isInitialized, false);
  assert.deepEqual(nativeCalls, ['preventScreenCaptureAsync(discreet)']);
});

test('unreadable privacy settings with nothing saying standard fail closed', async () => {
  const protection = await start('ios');
  privacyStore.setState({ initializationError: 'unavailable' });
  await protection.settled();

  assert.deepEqual(nativeCalls, ['enableAppSwitcherProtectionAsync(1)']);
});

test('unreadable privacy settings on an install whose hint says standard stay unprotected', async () => {
  lockHint = 'standard';
  const protection = await start('android');
  privacyStore.setState({ initializationError: 'timeout' });
  await protection.settled();

  assert.deepEqual(nativeCalls, []);
  assert.equal(moduleLoads, 0);
});

test('a standard launch never loads the screen capture module', async () => {
  lockHint = 'standard';
  const protection = await start('android');
  becomes({ mode: 'standard' });
  await protection.settled();

  assert.equal(moduleLoads, 0);
  assert.deepEqual(nativeCalls, []);
});

test('a first launch with no hint and no saved mode never loads the module', async () => {
  const protection = await start('ios');
  becomes({ mode: 'standard' });
  await protection.settled();

  assert.equal(moduleLoads, 0);
});

test('switching discreet mode on and off turns the Android protection on and off', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('android');

  becomes({ mode: 'discreet' });
  await protection.settled();
  becomes({ mode: 'standard' });
  await protection.settled();

  assert.deepEqual(nativeCalls, [
    'preventScreenCaptureAsync(discreet)',
    'allowScreenCaptureAsync(discreet)',
  ]);
});

test('switching discreet mode on and off turns the iOS app switcher cover on and off', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('ios');

  becomes({ mode: 'discreet' });
  await protection.settled();
  becomes({ mode: 'standard' });
  await protection.settled();

  assert.deepEqual(nativeCalls, [
    'enableAppSwitcherProtectionAsync(1)',
    'disableAppSwitcherProtectionAsync()',
  ]);
});

test('rapid toggles settle on the last requested state without replaying each one', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('android');

  becomes({ mode: 'discreet' });
  becomes({ mode: 'standard' });
  becomes({ mode: 'discreet' });
  await protection.settled();
  assert.deepEqual(nativeCalls, ['preventScreenCaptureAsync(discreet)']);

  becomes({ mode: 'standard' });
  becomes({ mode: 'discreet' });
  becomes({ mode: 'standard' });
  await protection.settled();
  assert.deepEqual(nativeCalls, [
    'preventScreenCaptureAsync(discreet)',
    'allowScreenCaptureAsync(discreet)',
  ]);
});

test('store updates that do not change the mode do not call the native module again', async () => {
  becomes({ mode: 'discreet' });
  const protection = await start('ios');
  await protection.settled();
  privacyStore.setState({ initializationError: null });
  privacyStore.setState({ mode: 'discreet' });
  await protection.settled();

  assert.deepEqual(nativeCalls, ['enableAppSwitcherProtectionAsync(1)']);
});

test('a native failure is reported instead of thrown, and the next change retries', async () => {
  // Android throws MissingActivity when the window is not attached yet.
  nativeFailure = new Error('window unavailable');
  const reported = nextReport();
  becomes({ mode: 'discreet' });
  const protection = await start('android');
  await protection.settled();
  await reported;

  assert.deepEqual(reportedErrors, [
    { source: 'privacy.screenCapture', message: 'window unavailable' },
  ]);

  nativeFailure = null;
  privacyStore.setState({ mode: 'discreet' });
  await protection.settled();
  // The failed attempt is rolled back, so the package does not treat the key as already
  // applied and the retry reaches the native module.
  assert.deepEqual(nativeCalls, [
    'preventScreenCaptureAsync(discreet)',
    'allowScreenCaptureAsync(discreet)',
    'preventScreenCaptureAsync(discreet)',
  ]);
});

test('a binary without the native module reports the load failure and keeps running', async () => {
  const { startScreenCaptureProtection } = await import('./screenCaptureProtection');
  const reported = nextReport();
  becomes({ mode: 'discreet' });
  const protection = startScreenCaptureProtection({
    platform: 'ios',
    store: privacyStore,
    readLockHint: () => lockHint,
    loadScreenCapture: () =>
      Promise.reject(new Error("Cannot find native module 'ExpoScreenCapture'")),
  });
  handles.push(protection);
  await protection.settled();
  await reported;

  assert.deepEqual(reportedErrors, [
    {
      source: 'privacy.screenCapture',
      message: "Cannot find native module 'ExpoScreenCapture'",
    },
  ]);
});

test('platforms without the protection never load the module', async () => {
  becomes({ mode: 'discreet' });
  const protection = await start('web');
  await protection.settled();

  assert.equal(moduleLoads, 0);
  assert.deepEqual(nativeCalls, []);
});

test('stopping leaves later privacy changes alone', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('android');
  protection.stop();

  becomes({ mode: 'discreet' });
  await protection.settled();

  assert.deepEqual(nativeCalls, []);
});

// ─── A new window after discreet mode is turned on (Android) ─────────────────

test('turning discreet mode on mid-session also protects the window the alias switch opens', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('android');
  becomes({ mode: 'discreet' });
  await protection.settled();
  assert.deepEqual([...secureWindows], [1]);

  openNewWindow();
  await protection.settled();

  assert.equal(secureWindows.has(currentWindow), true, 'the new window is FLAG_SECURE');
  assert.deepEqual(nativeCalls, [
    'preventScreenCaptureAsync(discreet)',
    'preventScreenCaptureAsync(discreet:1)',
  ]);
  // The keys stay balanced: turning discreet off still clears the flag natively.
  becomes({ mode: 'standard' });
  await protection.settled();
  assert.equal(secureWindows.has(currentWindow), false);
  assert.deepEqual(activeKeys, new Set());
});

test('every return to the foreground re-asserts the flag once, and no more', async () => {
  becomes({ mode: 'discreet' });
  const protection = await start('android');
  await protection.settled();

  // The icon change completing and the app turning active arrive together.
  openNewWindow();
  returnToSameWindow();
  returnToSameWindow();
  await protection.settled();
  assert.equal(nativeCalls.filter((call) => call.startsWith('prevent')).length, 2);

  returnToSameWindow();
  await protection.settled();
  assert.equal(nativeCalls.filter((call) => call.startsWith('prevent')).length, 3);
  assert.equal(
    nativeCalls.some((call) => call.startsWith('allow')),
    false,
    'the flag is never lifted in between'
  );
});

test('with discreet mode off a new window is left alone', async () => {
  becomes({ mode: 'standard' });
  const protection = await start('android');
  openNewWindow();
  await protection.settled();

  assert.deepEqual(nativeCalls, []);
  assert.equal(moduleLoads, 0);
});

test('iOS keeps its single app switcher cover across windows', async () => {
  becomes({ mode: 'discreet' });
  const protection = await start('ios');
  await protection.settled();
  openNewWindow();
  await protection.settled();

  assert.deepEqual(nativeCalls, ['enableAppSwitcherProtectionAsync(1)']);
});

test('a re-assert that fails is reported and the earlier protection is kept', async () => {
  becomes({ mode: 'discreet' });
  const protection = await start('android');
  await protection.settled();

  nativeFailure = new Error('window unavailable');
  const reported = nextReport();
  openNewWindow();
  await protection.settled();
  await reported;
  assert.deepEqual(activeKeys, new Set(['discreet']), 'the failed key is released');

  nativeFailure = null;
  returnToSameWindow();
  await protection.settled();
  assert.equal(secureWindows.has(currentWindow), true, 'the next activation protects it');
});
