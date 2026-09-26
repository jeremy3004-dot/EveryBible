import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionStorage, type SecureStoreOptions } from './authSessionStorage';

// Separate from authSessionStorage.test.ts: the adapter's failure state is per
// process, and these tests need a clean one.

// What iOS does: an item keeps the accessibility it was added with (expo-secure-store's
// update only replaces the value), and while the device is locked an item added as
// "when unlocked" cannot be read: "User interaction is not allowed".
const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
// Stands in for SecureStore.AFTER_FIRST_UNLOCK, a value the native module supplies.
const AFTER_FIRST_UNLOCK = 3;
const OPTIONS: SecureStoreOptions = { keychainAccessible: AFTER_FIRST_UNLOCK };
const interactionNotAllowed = new Error(
  "Calling the 'getValueWithKeyAsync' function has failed → Caused by: User interaction is not allowed."
);

function createIosKeychain() {
  const items = new Map<string, { value: string; accessible: string }>();
  const device = { locked: false };
  return {
    items,
    device,
    secureStore: {
      getItemAsync: async (key: string, _options?: SecureStoreOptions) => {
        const item = items.get(key);
        if (!item) return null;
        if (device.locked && item.accessible === WHEN_UNLOCKED) throw interactionNotAllowed;
        return item.value;
      },
      setItemAsync: async (key: string, value: string, options?: SecureStoreOptions) => {
        const existing = items.get(key);
        const accessible = String(options?.keychainAccessible ?? WHEN_UNLOCKED);
        items.set(key, { value, accessible: existing ? existing.accessible : accessible });
      },
      deleteItemAsync: async (key: string, _options?: SecureStoreOptions) => {
        items.delete(key);
      },
    },
  };
}

test('the session is readable with the phone locked, as background audio needs', async () => {
  const keychain = createIosKeychain();
  const reports: unknown[] = [];
  const storage = createAuthSessionStorage(
    keychain.secureStore,
    (error) => reports.push(error),
    OPTIONS
  );

  await storage.setItem('session', 'token-1');
  keychain.device.locked = true;

  assert.equal(await storage.getItem('session'), 'token-1');
  assert.deepEqual(reports, []);
});

test('a session saved "when unlocked" by an older build moves over on its next save', async () => {
  const keychain = createIosKeychain();
  keychain.items.set('session', { value: 'token-old', accessible: WHEN_UNLOCKED });
  const reports: unknown[] = [];
  const storage = createAuthSessionStorage(
    keychain.secureStore,
    (error) => reports.push(error),
    OPTIONS
  );

  // A token refresh saves the session again; a plain update would keep "when unlocked".
  await storage.setItem('session', 'token-2');
  keychain.device.locked = true;

  assert.equal(await storage.getItem('session'), 'token-2');
  assert.equal(keychain.items.get('session')?.accessible, String(AFTER_FIRST_UNLOCK));
  assert.deepEqual(reports, []);
});
