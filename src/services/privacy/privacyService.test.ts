import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';
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

mockModule(mock, 'expo-secure-store', {
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

test('a device with nothing stored loads the standard, pin-less defaults', async () => {
  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'standard', pin: null });
  assert.deepEqual(secureStoreCalls, [{ method: 'getItemAsync', key: PRIVACY_SETTINGS_KEY }]);
});

test('stored discreet settings are loaded back with their pin', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: '1234' }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'discreet', pin: '1234' });
});

test('an unrecognised stored mode falls back to standard', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'stealth', pin: '1234' }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'standard', pin: '1234' });
});

test('a non-string stored pin is discarded rather than trusted', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, JSON.stringify({ mode: 'discreet', pin: 1234 }));

  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'discreet', pin: null });
});

test('a corrupt stored payload is logged and treated as no privacy configuration', async () => {
  secureStore.set(PRIVACY_SETTINGS_KEY, '{not json');
  const consoleError = mock.method(console, 'error', () => {});

  try {
    assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'standard', pin: null });
  } finally {
    consoleError.mock.restore();
  }

  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Failed to parse privacy settings/);
});

test('a stored payload that is not an object at all is treated as no configuration', async () => {
  // JSON.parse succeeds but yields null, so the property reads throw inside the
  // same guard that catches malformed text.
  secureStore.set(PRIVACY_SETTINGS_KEY, 'null');
  const consoleError = mock.method(console, 'error', () => {});

  try {
    assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'standard', pin: null });
  } finally {
    consoleError.mock.restore();
  }
});

test('an unavailable keychain surfaces to the caller instead of silently unlocking', async () => {
  secureStoreFailure = new Error('keychain locked');

  await assert.rejects(() => privacyService.loadPrivacySettings(), /keychain locked/);
});

test('saving persists the settings and deliberately leaves the app icon alone', async () => {
  await privacyService.savePrivacySettings({ mode: 'discreet', pin: '4321' });

  assert.equal(
    secureStore.get(PRIVACY_SETTINGS_KEY),
    JSON.stringify({ mode: 'discreet', pin: '4321' })
  );
  assert.deepEqual(iconCalls, [], 'the icon swap is deferred to applyPrivacyAppIcon');
});

test('switching to discreet mode stores the pin and returns the persisted settings', async () => {
  const settings = await privacyService.updatePrivacyMode('discreet', '1357');

  assert.deepEqual(settings, { mode: 'discreet', pin: '1357' });
  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'discreet', pin: '1357' });
});

test('switching to standard mode drops any pin that was passed in', async () => {
  await privacyService.updatePrivacyMode('discreet', '1357');

  const settings = await privacyService.updatePrivacyMode('standard', '1357');

  assert.deepEqual(settings, { mode: 'standard', pin: null });
  assert.deepEqual(await privacyService.loadPrivacySettings(), { mode: 'standard', pin: null });
});

test('applying the app icon delegates to the native module', async () => {
  await privacyService.applyPrivacyAppIcon('discreet');

  assert.deepEqual(iconCalls, ['discreet']);
});

test('a matching pin verifies', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');

  assert.equal(await privacyService.verifyPrivacyPin('2468'), true);
});

test('a wrong pin does not verify', async () => {
  await privacyService.updatePrivacyMode('discreet', '2468');

  assert.equal(await privacyService.verifyPrivacyPin('1111'), false);
});

test('switching to discreet mode without a pin stores no pin at all', async () => {
  const settings = await privacyService.updatePrivacyMode('discreet', null);

  assert.deepEqual(settings, { mode: 'discreet', pin: null });
  assert.equal(await privacyService.verifyPrivacyPin(''), false);
});

test('no pin can be verified when privacy was never configured', async () => {
  assert.equal(await privacyService.verifyPrivacyPin(''), false);
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
    true,
    'the pin is kept when the icon cannot be restored, so the install stays unlockable'
  );
});
