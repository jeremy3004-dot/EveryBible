import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockExpoCrypto, mockModule } from '../../testing/mockModules';
import { createReactNativeStub } from '../../testing/reactNativeStub';

/**
 * Platforms without the dynamic app icon native module (Android, and iOS builds
 * where the alternate icon set is absent). appIcon.ts binds the native module at
 * import time, so this scenario needs a module instance of its own.
 */
mockModule(mock, 'react-native', createReactNativeStub({ os: 'android', nativeModules: {} }));

mockExpoCrypto(mock);

const secureStore = new Map<string, string>();
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
});

let appIcon: typeof import('./appIcon');
let privacyService: typeof import('./privacyService');

before(async () => {
  appIcon = await import('./appIcon');
  privacyService = await import('./privacyService');
});

test('a platform without the native module reports no dynamic icon support', () => {
  assert.equal(appIcon.supportsDynamicAppIcon(), false);
});

test('requesting an icon change on an unsupported platform reports false without throwing', async () => {
  assert.equal(await appIcon.setPrivacyAppIcon('discreet'), false);
});

test('reading the current icon on an unsupported platform reports unknown', async () => {
  assert.equal(await appIcon.getCurrentPrivacyAppIcon(), null);
});

test('clearing privacy settings succeeds on a platform that cannot switch icons', async () => {
  await privacyService.updatePrivacyMode('discreet', '1234');
  assert.equal(secureStore.size, 1);

  // setPrivacyAppIcon returns false here, but with no dynamic-icon support that is
  // the expected answer rather than a failure, so clearing must still resolve.
  await privacyService.clearPrivacySettings();

  assert.equal(secureStore.size, 0);
  assert.deepEqual(await privacyService.loadPrivacySettings(), {
    mode: 'standard',
    pinCredential: null,
    legacyPin: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  });
});
