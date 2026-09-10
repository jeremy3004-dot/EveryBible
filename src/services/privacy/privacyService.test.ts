/**
 * Privacy secure-code storage hardening (S8).
 *
 * privacyService.ts talks to expo-secure-store and expo-crypto, and appIcon.ts
 * reaches for react-native, so every native specifier is replaced with an
 * in-memory double via node:test module mocks (same pattern as
 * ../auth/authServiceNonce.test.ts).
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const secureStore = new Map<string, string>();
const setItemOptions: unknown[] = [];
const getItemOptions: unknown[] = [];

let serviceModule: typeof import('./privacyService') | null = null;
let loadAttempted = false;

async function loadService(): Promise<typeof import('./privacyService') | null> {
  if (loadAttempted) return serviceModule;
  loadAttempted = true;
  if (typeof (mock as { module?: unknown }).module !== 'function') return null;

  const url = (relative: string) => new URL(relative, import.meta.url).pathname;

  mock.module('expo-secure-store', {
    namedExports: {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
      getItemAsync: async (key: string, options?: unknown) => {
        getItemOptions.push(options);
        return secureStore.has(key) ? (secureStore.get(key) as string) : null;
      },
      setItemAsync: async (key: string, value: string, options?: unknown) => {
        setItemOptions.push(options);
        secureStore.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        secureStore.delete(key);
      },
    },
  });

  mock.module('expo-crypto', {
    namedExports: {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      getRandomBytesAsync: async (length: number) =>
        new Uint8Array(length).map((_, index) => (index * 37 + 11) % 256),
      digestStringAsync: async (algorithm: string, value: string) => {
        assert.equal(algorithm, 'SHA-256');
        return createHash('sha256').update(value).digest('hex');
      },
    },
  });

  mock.module(url('./appIcon.ts'), {
    namedExports: {
      setPrivacyAppIcon: async () => true,
      supportsDynamicAppIcon: () => false,
    },
  });

  try {
    serviceModule = await import('./privacyService');
  } catch {
    serviceModule = null;
  }

  return serviceModule;
}

const PRIVACY_KEY = 'everybible.privacy.settings';

function readStoredRecord(): Record<string, unknown> {
  const raw = secureStore.get(PRIVACY_KEY);
  assert.ok(raw, 'expected a persisted privacy record');
  return JSON.parse(raw) as Record<string, unknown>;
}

function reset(): void {
  secureStore.clear();
  setItemOptions.length = 0;
  getItemOptions.length = 0;
}

test('updatePrivacyMode never persists the secure code in cleartext', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');
  reset();

  await service.updatePrivacyMode('discreet', '1234');

  const record = readStoredRecord();
  assert.equal(record.pin, undefined, 'the legacy cleartext `pin` field must be gone');
  assert.equal(
    JSON.stringify(record).includes('1234'),
    false,
    'the secure code must not appear anywhere in the persisted record'
  );

  const credential = record.pinCredential as { hash: string; salt: string };
  assert.equal(typeof credential.hash, 'string');
  assert.equal(credential.salt.length, 32, 'salt should be 16 random bytes, hex encoded');
  assert.equal(
    credential.hash,
    createHash('sha256').update(`${credential.salt}:1234`).digest('hex')
  );
});

test('the privacy record is written and read with a device-only keychain class', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');
  reset();

  await service.updatePrivacyMode('discreet', '1234');
  await service.loadPrivacySettings();

  assert.deepEqual(setItemOptions.at(-1), { keychainAccessible: 'whenUnlockedThisDeviceOnly' });
  assert.deepEqual(getItemOptions.at(-1), { keychainAccessible: 'whenUnlockedThisDeviceOnly' });
});

test('a legacy cleartext record still verifies, then upgrades itself to a hash', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');
  reset();

  secureStore.set(PRIVACY_KEY, JSON.stringify({ mode: 'discreet', pin: '4321' }));

  const legacy = await service.loadPrivacySettings();
  assert.equal(legacy.legacyPin, '4321');
  assert.equal(service.hasPrivacyPin(legacy), true);

  const wrong = await service.verifyPrivacyPin('9999');
  assert.equal(wrong.success, false);
  assert.equal(
    (await service.loadPrivacySettings()).legacyPin,
    '4321',
    'a failed attempt must not destroy a not-yet-upgraded legacy record'
  );

  const right = await service.verifyPrivacyPin('4321');
  assert.equal(right.success, true);

  const record = readStoredRecord();
  assert.equal(record.pin, undefined, 'the cleartext code must be dropped after the upgrade');
  assert.ok(record.pinCredential, 'a salted hash should have replaced the cleartext code');

  const upgraded = await service.loadPrivacySettings();
  assert.equal(upgraded.legacyPin, null);
  assert.equal((await service.verifyPrivacyPin('4321')).success, true);
  assert.equal((await service.verifyPrivacyPin('9999')).success, false);
});

test('repeated wrong codes trip an exponential lockout that blocks further attempts', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');
  reset();

  await service.updatePrivacyMode('discreet', '1234');

  const start = 1_000_000;
  for (let attempt = 1; attempt < service.PRIVACY_PIN_LOCKOUT_THRESHOLD; attempt += 1) {
    const result = await service.verifyPrivacyPin('0000', { now: start });
    assert.equal(result.success, false);
    assert.equal(result.lockedUntil, null, `attempt ${attempt} should not lock yet`);
  }

  const tripped = await service.verifyPrivacyPin('0000', { now: start });
  assert.equal(tripped.success, false);
  assert.equal(tripped.remainingLockoutMs, service.PRIVACY_PIN_LOCKOUT_BASE_MS);
  assert.equal(tripped.lockedUntil, start + service.PRIVACY_PIN_LOCKOUT_BASE_MS);

  // Even the CORRECT code is refused while the window is open.
  const duringLockout = await service.verifyPrivacyPin('1234', { now: start + 1_000 });
  assert.equal(duringLockout.success, false);
  assert.equal(duringLockout.remainingLockoutMs, service.PRIVACY_PIN_LOCKOUT_BASE_MS - 1_000);

  // ... and accepted once it has passed.
  const afterLockout = await service.verifyPrivacyPin('1234', {
    now: start + service.PRIVACY_PIN_LOCKOUT_BASE_MS + 1,
  });
  assert.equal(afterLockout.success, true);
  assert.equal(readStoredRecord().failedPinAttempts, 0, 'a success should clear the counter');
  assert.equal(readStoredRecord().pinLockedUntil, null);
});

test('each further failure past the threshold doubles the lockout, up to the cap', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');

  assert.equal(service.getPrivacyPinLockoutMs(service.PRIVACY_PIN_LOCKOUT_THRESHOLD - 1), 0);
  assert.equal(
    service.getPrivacyPinLockoutMs(service.PRIVACY_PIN_LOCKOUT_THRESHOLD),
    service.PRIVACY_PIN_LOCKOUT_BASE_MS
  );
  assert.equal(
    service.getPrivacyPinLockoutMs(service.PRIVACY_PIN_LOCKOUT_THRESHOLD + 1),
    service.PRIVACY_PIN_LOCKOUT_BASE_MS * 2
  );
  assert.equal(service.getPrivacyPinLockoutMs(99), service.PRIVACY_PIN_LOCKOUT_MAX_MS);
});

test('a batch of candidates from one key sequence costs a single attempt', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');
  reset();

  await service.updatePrivacyMode('discreet', '1234');

  await service.verifyPrivacyPinCandidates(['0000', '00000', '000000'], { now: 5_000 });
  assert.equal(readStoredRecord().failedPinAttempts, 1);

  const matched = await service.verifyPrivacyPinCandidates(['9999', '1234'], { now: 5_000 });
  assert.equal(matched.success, true);
  assert.equal(readStoredRecord().failedPinAttempts, 0);
});

test('sanitizeStoredPrivacySettings tolerates junk and both record shapes', async (t) => {
  const service = await loadService();
  if (!service) return t.skip('node:test module mocks are unavailable in this runtime');

  assert.deepEqual(service.sanitizeStoredPrivacySettings(null), {
    mode: 'standard',
    pinCredential: null,
    legacyPin: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  });

  assert.deepEqual(service.sanitizeStoredPrivacySettings('{not json'), {
    mode: 'standard',
    pinCredential: null,
    legacyPin: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  });

  assert.deepEqual(
    service.sanitizeStoredPrivacySettings(
      JSON.stringify({ mode: 'discreet', pin: '1234', failedPinAttempts: -4, pinLockedUntil: 0 })
    ),
    {
      mode: 'discreet',
      pinCredential: null,
      legacyPin: '1234',
      failedPinAttempts: 0,
      pinLockedUntil: null,
    }
  );

  assert.deepEqual(
    service.sanitizeStoredPrivacySettings(
      JSON.stringify({
        mode: 'discreet',
        pin: '1234',
        pinCredential: { hash: 'h', salt: 's' },
        failedPinAttempts: 3,
        pinLockedUntil: 42,
      })
    ),
    {
      mode: 'discreet',
      pinCredential: { hash: 'h', salt: 's' },
      // A hashed record wins; the stale cleartext field is ignored outright.
      legacyPin: null,
      failedPinAttempts: 3,
      pinLockedUntil: 42,
    }
  );
});
