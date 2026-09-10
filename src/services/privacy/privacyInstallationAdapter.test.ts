import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { LEGACY_AUTH_STORAGE_KEY, PRIVACY_INSTALLATION_MARKER_KEY } from './privacyInstallation';

/**
 * Covers the production bridge in privacyInstallationAdapter.ts — the part that
 * wires MMKV, AsyncStorage, the storage migration and the destructive privacy
 * reset together. The pure policy functions it composes are tested in
 * privacyInstallation.test.ts.
 */
const mmkv = new Map<string, string>();
const mmkvInstance = {
  getString: (key: string) => mmkv.get(key),
  set: (key: string, value: string) => {
    mmkv.set(key, String(value));
  },
  delete: (key: string) => {
    mmkv.delete(key);
  },
  contains: (key: string) => mmkv.has(key),
  getAllKeys: () => Array.from(mmkv.keys()),
  clearAll: () => mmkv.clear(),
};
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance,
  zustandStorage: {
    getItem: (name: string) => mmkv.get(name) ?? null,
    setItem: (name: string, value: string) => mmkv.set(name, value),
    removeItem: (name: string) => mmkv.delete(name),
  },
});

const asyncStorage = new Map<string, string>();
const asyncStorageReads: string[] = [];
mockModule(mock, '@react-native-async-storage/async-storage', {
  default: {
    getItem: async (key: string) => {
      asyncStorageReads.push(key);
      return asyncStorage.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      asyncStorage.set(key, value);
    },
  },
});

const events: string[] = [];
let migrateFailure: Error | null = null;
let clearFailure: Error | null = null;
mockModule(mock, sourcePath('stores/migrateFromAsyncStorage.ts'), {
  migrateFromAsyncStorage: async () => {
    events.push('migrate');
    if (migrateFailure) {
      throw migrateFailure;
    }
  },
});
mockModule(mock, sourcePath('services/privacy/privacyService.ts'), {
  clearPrivacySettings: async () => {
    events.push('clearPrivacySettings');
    if (clearFailure) {
      throw clearFailure;
    }
  },
});

let adapter: typeof import('./privacyInstallationAdapter');

before(async () => {
  adapter = await import('./privacyInstallationAdapter');
});

beforeEach(() => {
  mmkv.clear();
  asyncStorage.clear();
  asyncStorageReads.length = 0;
  events.length = 0;
  migrateFailure = null;
  clearFailure = null;
});

test('a genuinely empty app container is treated as a reinstall: privacy is reset and the marker seeded', async () => {
  await adapter.initializePrivacyInstallationOnStartup();

  assert.deepEqual(events, ['migrate', 'clearPrivacySettings']);
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
  assert.deepEqual(asyncStorageReads, [LEGACY_AUTH_STORAGE_KEY]);
});

test('storage migration always runs before the installation is classified', async () => {
  mmkv.set(PRIVACY_INSTALLATION_MARKER_KEY, '1');

  await adapter.initializePrivacyInstallationOnStartup();

  assert.deepEqual(events, ['migrate']);
});

test('an existing marker preserves privacy settings without touching AsyncStorage', async () => {
  mmkv.set(PRIVACY_INSTALLATION_MARKER_KEY, '1');

  await adapter.reconcilePrivacyInstallationOnStartup();

  assert.deepEqual(events, []);
  assert.deepEqual(asyncStorageReads, [], 'the AsyncStorage fallback must stay off the fast path');
});

test('a pre-marker install with MMKV auth state is preserved and gets the marker seeded', async () => {
  mmkv.set(LEGACY_AUTH_STORAGE_KEY, JSON.stringify({ state: { user: { uid: 'u' } } }));

  await adapter.reconcilePrivacyInstallationOnStartup();

  assert.deepEqual(events, [], 'an upgraded install must never lose its privacy settings');
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
  assert.deepEqual(asyncStorageReads, []);
});

test('a pre-MMKV install is recognised from AsyncStorage auth state and preserved', async () => {
  asyncStorage.set(LEGACY_AUTH_STORAGE_KEY, JSON.stringify({ state: { user: { uid: 'u' } } }));

  await adapter.reconcilePrivacyInstallationOnStartup();

  assert.deepEqual(events, []);
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
  assert.deepEqual(asyncStorageReads, [LEGACY_AUTH_STORAGE_KEY]);
});

test('an empty legacy AsyncStorage value still counts as evidence of an existing install', async () => {
  asyncStorage.set(LEGACY_AUTH_STORAGE_KEY, '');

  await adapter.reconcilePrivacyInstallationOnStartup();

  assert.deepEqual(events, []);
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
});

test('a marker written by a concurrent attempt is not overwritten', async () => {
  mmkv.set(LEGACY_AUTH_STORAGE_KEY, 'state');
  mmkv.set(PRIVACY_INSTALLATION_MARKER_KEY, 'written-earlier');

  await adapter.reconcilePrivacyInstallationOnStartup();

  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), 'written-earlier');
});

test('concurrent startups join one reconciliation instead of resetting privacy twice', async () => {
  const [first, second] = await Promise.all([
    adapter.reconcilePrivacyInstallationOnStartup(),
    adapter.reconcilePrivacyInstallationOnStartup(),
  ]);

  assert.equal(first, second);
  assert.deepEqual(events, ['clearPrivacySettings']);
});

test('concurrent bootstraps join one migration as well', async () => {
  mmkv.set(PRIVACY_INSTALLATION_MARKER_KEY, '1');

  await Promise.all([
    adapter.initializePrivacyInstallationOnStartup(),
    adapter.initializePrivacyInstallationOnStartup(),
  ]);

  assert.deepEqual(events, ['migrate']);
});

test('a failed migration rejects and leaves the installation unclassified', async () => {
  migrateFailure = new Error('MMKV unavailable');

  await assert.rejects(() => adapter.initializePrivacyInstallationOnStartup(), /MMKV unavailable/);
  assert.equal(mmkv.has(PRIVACY_INSTALLATION_MARKER_KEY), false);
});

test('a retry after a failed migration starts a fresh attempt rather than replaying the rejection', async () => {
  migrateFailure = new Error('MMKV unavailable');
  await assert.rejects(() => adapter.initializePrivacyInstallationOnStartup());
  migrateFailure = null;
  events.length = 0;

  await adapter.initializePrivacyInstallationOnStartup();

  assert.deepEqual(events, ['migrate', 'clearPrivacySettings']);
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
});

test('a failed reset leaves the marker unwritten so the next launch retries in a locked state', async () => {
  clearFailure = new Error('keychain locked');

  await assert.rejects(() => adapter.reconcilePrivacyInstallationOnStartup(), /keychain locked/);
  assert.equal(mmkv.has(PRIVACY_INSTALLATION_MARKER_KEY), false);
});

test('auth state migrated into MMKV during the AsyncStorage read still prevents a reset', async () => {
  // The AsyncStorage read is the only await before the container is classified.
  // A migration finishing inside that window writes the MMKV auth key, and the
  // post-await re-read must notice it rather than wiping a real user's privacy.
  asyncStorage.set(LEGACY_AUTH_STORAGE_KEY, '');
  asyncStorage.delete(LEGACY_AUTH_STORAGE_KEY);
  const asyncStorageModule = await import('@react-native-async-storage/async-storage');
  const getItem = mock.method(asyncStorageModule.default, 'getItem', async (key: string) => {
    asyncStorageReads.push(key);
    mmkv.set(LEGACY_AUTH_STORAGE_KEY, 'migrated-mid-flight');
    return null;
  });

  try {
    await adapter.reconcilePrivacyInstallationOnStartup();
  } finally {
    getItem.mock.restore();
  }

  assert.deepEqual(events, [], 'a migrated install must never be reset');
  assert.equal(mmkv.get(PRIVACY_INSTALLATION_MARKER_KEY), '1');
});
