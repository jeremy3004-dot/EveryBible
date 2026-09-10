import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mockExpoCrypto, mockModule } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';
import type { PrivacyAppIconMode } from '../../types';

const PRIVACY_SETTINGS_KEY = 'everybible.privacy.settings';

// In-memory SecureStore with a failure switch, so the "keychain is unavailable"
// path can be exercised alongside the happy path in one module configuration.
const secureStore = new Map<string, string>();
const secureStoreCalls: Array<{ method: string; key: string; value?: string }> = [];
let secureStoreFailure: Error | null = null;

const guard = () => {
  if (secureStoreFailure) {
    throw secureStoreFailure;
  }
};

// The secure code is a salted SHA-256 credential now, so expo-crypto is part of
// this module's dependency graph. `privacyService.test.ts` pins the hashing and
// the lockout arithmetic; this file covers the storage/icon behaviour around them.
mockExpoCrypto(mock);

mockModule(mock, 'expo-secure-store', {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: async (key: string) => {
    secureStoreCalls.push({ method: 'getItemAsync', key });
    guard();
    return secureStore.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    secureStoreCalls.push({ method: 'setItemAsync', key, value });
    guard();
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStoreCalls.push({ method: 'deleteItemAsync', key });
    guard();
    secureStore.delete(key);
  },
});

const iconCalls: PrivacyAppIconMode[] = [];
let setAppIconResult = true;
mockModule(
  mock,
  'react-native',
  createReactNativeStub({
    nativeModules: {
      EveryBiblePrivacyModule: {
        setAppIcon: async (mode: PrivacyAppIconMode) => {
          iconCalls.push(mode);
          return setAppIconResult;
        },
        getCurrentAppIcon: async () => 'standard',
      },
    },
  })
);

let privacyService: typeof import('./privacyService');

before(async () => {
  privacyService = await import('./privacyService');
});

beforeEach(() => {
  secureStore.clear();
  secureStoreCalls.length = 0;
  secureStoreFailure = null;
  iconCalls.length = 0;
  setAppIconResult = true;
});

const DEFAULT_RECORD = {
  mode: 'standard' as const,
  pinCredential: null,
  legacyPin: null,
  failedPinAttempts: 0,
  pinLockedUntil: null,
};

/** A stored record carrying a salted hash of `pin`, as the current code writes it. */
const hashedRecord = async (mode: PrivacyAppIconMode, pin: string) => ({
  mode,
  pinCredential: await privacyService.createPrivacyPinCredential(pin),
  legacyPin: null,
  failedPinAttempts: 0,
  pinLockedUntil: null,
});

test('a device with nothing stored loads the standard, code-less defaults', async () => {
  assert.deepEqual(await privacyService.loadPrivacySettings(), DEFAULT_RECORD);
  assert.deepEqual(secureStoreCalls, [{ method: 'getItemAsync', key: PRIVACY_SETTINGS_KEY }]);
});

test('a stored hashed credential is loaded back verbatim', async () => {
  const record = await hashedRecord('discreet', '1234');
  await privacyService.savePrivacySettings(record);

  assert.deepEqual(await privacyService.loadPrivacySettings(), record);
});

test('a legacy cleartext record is loaded as a legacy pin awaiting upgrade', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), {
    ...DEFAULT_RECORD,
    mode: 'discreet',
    legacyPin: '1234',
  });
});

test('an unrecognised stored mode falls back to standard', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'stealth', pin: '1234' }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), {
    ...DEFAULT_RECORD,
    mode: 'standard',
    legacyPin: '1234',
  });
});

test('a non-string stored code is discarded rather than trusted', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: 1234 }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), {
    ...DEFAULT_RECORD,
    mode: 'discreet',
  });
});

test('a malformed credential object is discarded rather than half-trusted', async () => {
  secureStore.set(
    PRIVACY_SETTINGS_KEY,
    JSON.stringify({ mode: 'discreet', pinCredential: { hash: 'h' } })
  );

  const settings = await privacyService.loadPrivacySettings();

  assert.equal(settings.pinCredential, null, 'a credential with no salt cannot verify anything');
  assert.equal(privacyService.hasPrivacyPin(settings), false);
});

test('a corrupt stored payload is logged and treated as no privacy configuration', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, '{not json');
  const consoleError = mock.method(console, 'error', () => {});

  try {
    assert.deepEqual(await privacyService.loadPrivacySettings(), DEFAULT_RECORD);
  } finally {
    consoleError.mock.restore();
  }

  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Failed to parse privacy settings/);
});

test('an unavailable keychain surfaces to the caller instead of silently unlocking', async () => {
  secureStoreFailure = new Error('keychain locked');

  await assert.rejects(() => privacyService.loadPrivacySettings(), /keychain locked/);
});

test('saving persists the hashed record and deliberately leaves the app icon alone', async () => {
  const record = await hashedRecord('discreet', '4321');

  await privacyService.savePrivacySettings(record);

  const stored = JSON.parse(secureStore.get(PRIVACY_SETTINGS_KEY) ?? 'null');
  assert.deepEqual(stored, {
    mode: 'discreet',
    pinCredential: record.pinCredential,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  });
  assert.equal(JSON.stringify(stored).includes('4321'), false, 'no cleartext code is written');
  assert.deepEqual(iconCalls, [], 'the icon swap is deferred to applyPrivacyAppIcon');
});

test('switching to discreet mode stores a salted hash and returns the persisted settings', async () => {
  const settings = await privacyService.updatePrivacyMode('discreet', '1357');

  assert.equal(settings.mode, 'discreet');
  assert.equal(settings.legacyPin, null);
  const credential = settings.pinCredential;
  assert.ok(credential);
  assert.equal(
    credential.hash,
    createHash('sha256').update(`${credential.salt}:1357`).digest('hex')
  );
  assert.deepEqual(await privacyService.loadPrivacySettings(), settings);
});

test('switching to standard mode drops any code that was passed in', async () => {
  await privacyService.updatePrivacyMode('discreet', '1357');

  const settings = await privacyService.updatePrivacyMode('standard', '1357');

  assert.deepEqual(settings, DEFAULT_RECORD);
  assert.deepEqual(await privacyService.loadPrivacySettings(), DEFAULT_RECORD);
});

test('applying the app icon delegates to the native module', async () => {
  await privacyService.applyPrivacyAppIcon('discreet');

  assert.deepEqual(iconCalls, ['discreet']);
});

test('a matching code verifies', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');

  assert.deepEqual(await privacyService.verifyPrivacyPin('2468'), {
    success: true,
    lockedUntil: null,
    remainingLockoutMs: 0,
  });
});

test('a wrong code does not verify and is counted as a failed attempt', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');

  const result = await privacyService.verifyPrivacyPin('1111');

  assert.equal(result.success, false);
  assert.equal(result.lockedUntil, null, 'one failure is below the throttling threshold');
  assert.equal((await privacyService.loadPrivacySettings()).failedPinAttempts, 1);
});

test('no code can be verified when privacy was never configured', async () => {
  const result = await privacyService.verifyPrivacyPin('');

  assert.deepEqual(result, { success: false, lockedUntil: null, remainingLockoutMs: 0 });
  // Nothing to throttle either: an unconfigured install records no attempts.
  assert.deepEqual(
    secureStoreCalls.map((call) => call.method),
    ['getItemAsync']
  );
});

test('clearing removes the stored settings and restores the standard icon', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');

  await privacyService.clearPrivacySettings();

  assert.equal(secureStore.has(PRIVACY_SETTINGS_KEY), false);
  assert.deepEqual(iconCalls, ['standard']);
});

test('clearing fails loudly when a device that supports icons cannot restore the standard one', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');
  setAppIconResult = false;

  await assert.rejects(
    () => privacyService.clearPrivacySettings(),
    /Failed to apply the standard privacy app icon/
  );
  assert.equal(
    secureStore.has(PRIVACY_SETTINGS_KEY),
    false,
    'the credentials are still cleared before the icon is restored'
  );
});
