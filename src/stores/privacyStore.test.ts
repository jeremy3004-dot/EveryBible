import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mockExpoCrypto, mockModule, sourcePath } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';
import type { PrivacyAppIconMode } from '../types';

/**
 * The whole privacy dependency graph is real here (privacyService,
 * privacyMode, privacyInitialization, privacyInstallation and its adapter);
 * only the native edges are replaced: SecureStore, expo-crypto (the secure code
 * is a salted SHA-256 credential now), the app-icon native module, MMKV and
 * AsyncStorage.
 */
const PRIVACY_SETTINGS_KEY = 'everybible.privacy.settings';
const PRIVACY_INSTALLATION_MARKER_KEY = 'everybible.privacy.installation.v1';

const secureStore = new Map<string, string>();
const secureStoreReads: string[] = [];
/** Every options object SecureStore was called with, to pin keychain accessibility. */
const secureStoreOptions: unknown[] = [];
type Deferred = { promise: Promise<string | null>; resolve: (value: string | null) => void };
let pendingRead: Deferred | null = null;
let readFailure: Error | null = null;

const createDeferred = (): Deferred => {
  let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

mockExpoCrypto(mock);

mockModule(mock, 'expo-secure-store', {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: (key: string, options?: unknown) => {
    secureStoreReads.push(key);
    secureStoreOptions.push(options);
    if (readFailure) {
      return Promise.reject(readFailure);
    }
    if (pendingRead) {
      return pendingRead.promise;
    }
    return Promise.resolve(secureStore.get(key) ?? null);
  },
  setItemAsync: async (key: string, value: string, options?: unknown) => {
    secureStoreOptions.push(options);
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string, options?: unknown) => {
    secureStoreOptions.push(options);
    secureStore.delete(key);
  },
});

const iconCalls: PrivacyAppIconMode[] = [];
mockModule(
  mock,
  'react-native',
  createReactNativeStub({
    nativeModules: {
      EveryBiblePrivacyModule: {
        setAppIcon: async (mode: PrivacyAppIconMode) => {
          iconCalls.push(mode);
          return true;
        },
        getCurrentAppIcon: async () => 'standard',
      },
    },
  })
);

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

let usePrivacyStore: typeof import('./privacyStore').usePrivacyStore;

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const store = () => usePrivacyStore.getState();
const storedSettings = () =>
  JSON.parse(secureStore.get(PRIVACY_SETTINGS_KEY) ?? 'null') as Record<string, unknown> | null;
/** The hash privacyService derives for a code: SHA-256 of `${salt}:${pin}`. */
const expectedHash = (salt: string, pin: string) =>
  createHash('sha256').update(`${salt}:${pin}`).digest('hex');

before(async () => {
  ({ usePrivacyStore } = await import('./privacyStore'));
});

beforeEach(() => {
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
  secureStore.clear();
  secureStoreReads.length = 0;
  secureStoreOptions.length = 0;
  iconCalls.length = 0;
  mmkv.clear();
  // Default to an upgraded install so reconciliation is a no-op; the reinstall
  // path gets its own test.
  mmkv.set(PRIVACY_INSTALLATION_MARKER_KEY, '1');
  pendingRead = null;
  readFailure = null;
});

test('the app starts locked and uninitialized so no content shows before privacy is resolved', () => {
  assert.deepEqual(
    {
      isInitialized: store().isInitialized,
      isLoading: store().isLoading,
      initializationError: store().initializationError,
      mode: store().mode,
      hasPin: store().hasPin,
      isLocked: store().isLocked,
    },
    {
      isInitialized: false,
      isLoading: false,
      initializationError: null,
      mode: 'standard',
      hasPin: false,
      isLocked: true,
    }
  );
});

test('initializing an unconfigured install unlocks the app in standard mode', async () => {
  await store().initialize();

  assert.equal(store().isInitialized, true);
  assert.equal(store().isLoading, false);
  assert.equal(store().mode, 'standard');
  assert.equal(store().hasPin, false);
  assert.equal(store().isLocked, false);
  assert.equal(store().initializationError, null);
});

test('initializing a discreet install with a pin keeps the app locked', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));

  await store().initialize();

  assert.equal(store().isInitialized, true);
  assert.equal(store().mode, 'discreet');
  assert.equal(store().hasPin, true);
  assert.equal(store().isLocked, true);
});

test('a discreet install whose pin was lost does not lock the user out', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: null }));

  await store().initialize();

  assert.equal(store().mode, 'discreet');
  assert.equal(store().hasPin, false);
  assert.equal(store().isLocked, false);
});

test('a reinstalled app container clears leftover keychain privacy settings before loading', async () => {
  mmkv.delete(PRIVACY_INSTALLATION_MARKER_KEY);
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));

  await store().initialize();

  assert.equal(secureStore.has(PRIVACY_SETTINGS_KEY), false);
  assert.equal(store().mode, 'standard');
  assert.equal(store().isLocked, false);
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
});

test('initializing again after success does not re-read the keychain', async () => {
  await store().initialize();
  secureStoreReads.length = 0;

  await store().initialize();

  assert.deepEqual(secureStoreReads, []);
});

test('two initializations racing at startup share a single keychain read', async () => {
  await Promise.all([store().initialize(), store().initialize()]);

  assert.deepEqual(secureStoreReads, [PRIVACY_SETTINGS_KEY]);
});

test('a keychain that never answers times out into a locked, retryable state', async () => {
  const consoleWarn = mock.method(console, 'warn', () => {});
  pendingRead = createDeferred();
  mock.timers.enable({ apis: ['setTimeout'] });

  try {
    const initializing = store().initialize();
    await flush();
    assert.equal(store().isLoading, true, 'the app shows the loading state while waiting');
    mock.timers.tick(3_500);
    await initializing;
  } finally {
    mock.timers.reset();
    consoleWarn.mock.restore();
  }

  assert.equal(store().isInitialized, false);
  assert.equal(store().isLoading, false);
  assert.equal(store().initializationError, 'timeout');
  assert.equal(store().isLocked, true);
  assert.equal(consoleWarn.mock.callCount(), 1);
});

test('a keychain failure is reported as unavailable and leaves the app locked', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  readFailure = new Error('keychain unavailable');

  try {
    await store().initialize();
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(store().initializationError, 'unavailable');
  assert.equal(store().isInitialized, false);
  assert.equal(store().isLocked, true);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Failed to initialize privacy/);
});

test('the visible error survives while a retry is still pending', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  readFailure = new Error('keychain unavailable');
  await store().initialize();
  readFailure = null;
  pendingRead = createDeferred();

  try {
    const retry = store().retryInitialize();
    await flush();
    assert.equal(store().isLoading, true);
    assert.equal(
      store().initializationError,
      'unavailable',
      'the retry screen must keep showing why it failed'
    );
    pendingRead.resolve(null);
    pendingRead = null;
    await retry;
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(store().initializationError, null);
  assert.equal(store().isInitialized, true);
});

test('pressing retry again while an attempt is in flight joins it instead of restarting it', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  readFailure = new Error('keychain unavailable');
  await store().initialize();
  consoleError.mock.restore();
  readFailure = null;
  pendingRead = createDeferred();
  secureStoreReads.length = 0;

  const retry = store().retryInitialize();
  await flush();
  await store().retryInitialize();

  assert.deepEqual(secureStoreReads, [PRIVACY_SETTINGS_KEY]);
  pendingRead.resolve(null);
  pendingRead = null;
  await retry;
});

test('retrying after a timeout can still succeed', async () => {
  const consoleWarn = mock.method(console, 'warn', () => {});
  pendingRead = createDeferred();
  mock.timers.enable({ apis: ['setTimeout'] });
  const initializing = store().initialize();
  await flush();
  mock.timers.tick(3_500);
  await initializing;
  mock.timers.reset();
  consoleWarn.mock.restore();

  pendingRead = null;
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().retryInitialize();

  assert.equal(store().initializationError, null);
  assert.equal(store().isInitialized, true);
  assert.equal(store().mode, 'discreet');
  assert.equal(store().isLocked, true);
});

test('a pin shorter than four characters is rejected without persisting anything', async () => {
  await store().initialize();

  const result = await store().saveConfiguration({ mode: 'discreet', pinInput: '123' });

  assert.deepEqual(result, { success: false, errorKey: 'privacy.pinTooShort' });
  assert.equal(secureStore.has(PRIVACY_SETTINGS_KEY), false);
  assert.equal(store().mode, 'standard');
});

test('a pin longer than six characters is rejected', async () => {
  await store().initialize();

  const result = await store().saveConfiguration({ mode: 'discreet', pinInput: '1234567' });

  assert.deepEqual(result, { success: false, errorKey: 'privacy.pinTooLong' });
});

test('a pin containing letters is rejected', async () => {
  await store().initialize();

  const result = await store().saveConfiguration({ mode: 'discreet', pinInput: '12ab' });

  assert.deepEqual(result, { success: false, errorKey: 'privacy.pinInvalidCharacters' });
});

test('switching to discreet mode with a missing pin is rejected', async () => {
  await store().initialize();

  const result = await store().saveConfiguration({ mode: 'discreet' });

  assert.deepEqual(result, { success: false, errorKey: 'privacy.pinTooShort' });
});

test('saving a discreet pin persists the normalized pin and unlocks the app', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });

  try {
    await store().initialize();

    const result = await store().saveConfiguration({ mode: 'discreet', pinInput: '12 x 4' });

    assert.deepEqual(result, { success: true, errorKey: null });
    // The code is stored as a salted hash, never in the clear.
    const stored = storedSettings() ?? {};
    const credential = stored.pinCredential as { salt: string; hash: string };
    assert.equal('pin' in stored, false);
    assert.equal(JSON.stringify(stored).includes('12*4'), false);
    assert.match(credential.salt, /^[0-9a-f]{32}$/);
    assert.equal(credential.hash, expectedHash(credential.salt, '12*4'));
    assert.deepEqual(
      {
        mode: stored.mode,
        failedPinAttempts: stored.failedPinAttempts,
        pinLockedUntil: stored.pinLockedUntil,
      },
      { mode: 'discreet', failedPinAttempts: 0, pinLockedUntil: null }
    );
    assert.equal(store().mode, 'discreet');
    assert.equal(store().hasPin, true);
    assert.equal(store().isLocked, false);
    assert.equal(store().isInitialized, true);
    assert.deepEqual(iconCalls, [], 'the icon swap is deferred past navigation');

    mock.timers.tick(400);
    assert.deepEqual(iconCalls, ['discreet']);
  } finally {
    mock.timers.reset();
  }
});

test('switching back to standard mode drops the stored pin and restores the standard icon', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });

  try {
    await store().initialize();
    await store().saveConfiguration({ mode: 'discreet', pinInput: '1234' });
    mock.timers.tick(400);
    iconCalls.length = 0;

    const result = await store().saveConfiguration({ mode: 'standard' });

    assert.deepEqual(result, { success: true, errorKey: null });
    assert.deepEqual(storedSettings(), {
      mode: 'standard',
      pinCredential: null,
      failedPinAttempts: 0,
      pinLockedUntil: null,
    });
    assert.equal(store().hasPin, false);
    assert.equal(store().isLocked, false);

    mock.timers.tick(400);
    assert.deepEqual(iconCalls, ['standard']);
  } finally {
    mock.timers.reset();
  }
});

test('saving a configuration clears a previous initialization error', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  readFailure = new Error('keychain unavailable');
  await store().initialize();
  consoleError.mock.restore();
  readFailure = null;
  mock.timers.enable({ apis: ['setTimeout'] });

  try {
    await store().saveConfiguration({ mode: 'standard' });
  } finally {
    mock.timers.reset();
  }

  assert.equal(store().initializationError, null);
  assert.equal(store().isInitialized, true);
});

test('backgrounding a discreet install with a pin locks it', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();
  usePrivacyStore.setState({ isLocked: false });

  store().lock();

  assert.equal(store().isLocked, true);
});

test('locking a standard install leaves the app open because there is nothing to unlock with', async () => {
  await store().initialize();

  store().lock();

  assert.equal(store().isLocked, false);
});

test('locking before initialization keeps the app locked', () => {
  store().lock();

  assert.equal(store().isLocked, true);
});

test('unlocking is refused before privacy settings have been loaded', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));

  assert.equal(await store().unlock('1234'), false);
  assert.deepEqual(secureStoreReads, [], 'no keychain read happens before initialization');
  assert.equal(store().isLocked, true);
});

test('a malformed pin entry is rejected without a keychain round trip', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();
  secureStoreReads.length = 0;

  assert.equal(await store().unlock('12'), false);
  assert.deepEqual(secureStoreReads, []);
  assert.equal(store().isLocked, true);
});

test('a wrong pin leaves the app locked', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  assert.equal(await store().unlock('9999'), false);
  assert.equal(store().isLocked, true);
});

test('the correct pin unlocks the app', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '12*4' }));
  await store().initialize();

  assert.equal(await store().unlock('12 x 4'), true);
  assert.equal(store().isLocked, false);
});

test('every keychain access is pinned to this device and to an unlocked screen', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await store().initialize();
    await store().saveConfiguration({ mode: 'discreet', pinInput: '1234' });
  } finally {
    mock.timers.reset();
  }

  // Device-only accessibility keeps the code out of iCloud/Keychain backups, so a
  // restored install comes back in standard mode rather than locked with a lost code.
  assert.ok(secureStoreOptions.length > 0);
  assert.deepEqual(
    [...new Set(secureStoreOptions.map((options) => JSON.stringify(options)))],
    [JSON.stringify({ keychainAccessible: 'whenUnlockedThisDeviceOnly' })]
  );
});

test('a correct code upgrades a legacy cleartext record to a salted hash in place', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  assert.equal(await store().unlock('1234'), true);

  const stored = storedSettings() ?? {};
  const credential = stored.pinCredential as { salt: string; hash: string };
  assert.equal('pin' in stored, false, 'the cleartext code is gone once it can be hashed');
  assert.equal(credential.hash, expectedHash(credential.salt, '1234'));
});

test('repeated wrong codes trip an exponential lockout that refuses further attempts', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal(await store().unlock('9999'), false);
    assert.equal(store().pinLockedUntil, null, `attempt ${attempt} is below the threshold`);
  }

  assert.equal(await store().unlock('9999'), false);
  const lockedUntil = store().pinLockedUntil;
  assert.ok(typeof lockedUntil === 'number' && lockedUntil > Date.now());
  assert.equal(storedSettings()?.failedPinAttempts, 5);

  // While throttled even the CORRECT code is refused, without a keychain round trip.
  secureStoreReads.length = 0;
  assert.equal(await store().unlock('1234'), false);
  assert.deepEqual(secureStoreReads, []);
  assert.equal(store().isLocked, true);
});

test('a persisted lockout survives a cold start', async () => {
  const lockedUntil = Date.now() + 60_000;
  secureStore.set(
    PRIVACY_SETTINGS_KEY,
    JSON.stringify({
      mode: 'discreet',
      pin: '1234',
      failedPinAttempts: 6,
      pinLockedUntil: lockedUntil,
    })
  );

  await store().initialize();

  assert.equal(store().pinLockedUntil, lockedUntil);
  assert.equal(await store().unlock('1234'), false);
  assert.equal(store().isLocked, true);
});

test('a batch of candidates from one key sequence counts as a single failed attempt', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  // The lock screen derives 4/5/6-character readings of the same taps.
  assert.equal(await store().unlock(['9999', '99999', '999999']), false);

  assert.equal(storedSettings()?.failedPinAttempts, 1, 'one sequence, one attempt');
});

test('a batch containing the right reading of the taps unlocks the app', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  assert.equal(await store().unlock(['9999', '1234', '123456']), true);

  assert.equal(store().isLocked, false);
  assert.equal(storedSettings()?.failedPinAttempts, 0);
  assert.equal(store().pinLockedUntil, null);
});

test('disabling privacy erases the keychain settings and reopens the app', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));
  await store().initialize();

  await store().disablePrivacy();

  assert.equal(secureStore.has(PRIVACY_SETTINGS_KEY), false);
  assert.equal(store().mode, 'standard');
  assert.equal(store().hasPin, false);
  assert.equal(store().isLocked, false);
  assert.equal(store().isInitialized, true);
  assert.deepEqual(iconCalls, ['standard'], 'disabling restores the standard icon immediately');
});

test('disabling privacy from an unavailable state still leaves the app usable', async () => {
  const consoleError = mock.method(console, 'error', () => {});
  readFailure = new Error('keychain unavailable');
  await store().initialize();
  consoleError.mock.restore();
  readFailure = null;

  await store().disablePrivacy();

  assert.equal(store().initializationError, null);
  assert.equal(store().isInitialized, true);
  assert.equal(store().isLocked, false);
});
