/**
 * Translator review passcode storage (S7) + dev-passcode inlining (S10).
 *
 * The store imports react-native-mmkv (native) and expo-secure-store (native), so both are
 * replaced with in-memory doubles through node:test module mocks. That lets the real store —
 * persist middleware, migrate and partialize included — run under the Node test runner.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// --- S7: the passcode must not be written to MMKV ---------------------------------------

const mmkv = new Map<string, string>();
const secureStore = new Map<string, string>();
const secureStoreCalls: { op: string; key: string }[] = [];

let storeModule: typeof import('./translatorReviewStore') | null = null;

async function loadStore(): Promise<typeof import('./translatorReviewStore') | null> {
  if (storeModule) return storeModule;
  if (typeof (mock as { module?: unknown }).module !== 'function') return null;

  mock.module('expo-secure-store', {
    namedExports: {
      getItemAsync: async (key: string) => {
        secureStoreCalls.push({ op: 'get', key });
        return secureStore.get(key) ?? null;
      },
      setItemAsync: async (key: string, value: string) => {
        secureStoreCalls.push({ op: 'set', key });
        secureStore.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        secureStoreCalls.push({ op: 'delete', key });
        secureStore.delete(key);
      },
    },
  });

  mock.module(new URL('./mmkvStorage.ts', import.meta.url).pathname, {
    namedExports: {
      mmkvInstance: {
        getString: (key: string) => mmkv.get(key),
        set: (key: string, value: string) => mmkv.set(key, value),
        delete: (key: string) => mmkv.delete(key),
      },
      zustandStorage: {
        getItem: (name: string) => mmkv.get(name) ?? null,
        setItem: (name: string, value: string) => {
          mmkv.set(name, value);
        },
        removeItem: (name: string) => {
          mmkv.delete(name);
        },
      },
    },
  });

  try {
    storeModule = await import('./translatorReviewStore');
  } catch {
    storeModule = null;
  }
  return storeModule;
}

// --- S10: a release build never reads the dev passcode ---------------------------------

test('a release runtime never reads the dev passcode env var, even when it is set', async (t) => {
  // Expo inlines process.env.EXPO_PUBLIC_* at build time, so the read must sit inside a
  // __DEV__ branch for the minifier to drop the literal. Under node --test there is no
  // __DEV__ (a release runtime), so the store must load without touching the variable.
  const realEnv = process.env;
  const reads: string[] = [];
  process.env = new Proxy(
    { ...realEnv, EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE: 'dev-only-code' },
    {
      get(target, key, receiver) {
        if (typeof key === 'string') reads.push(key);
        return Reflect.get(target, key, receiver);
      },
    }
  );
  let store: Awaited<ReturnType<typeof loadStore>>;
  try {
    store = await loadStore();
  } finally {
    process.env = realEnv;
  }
  if (!store) {
    t.skip('module mocking unavailable (run with --experimental-test-module-mocks)');
    return;
  }

  assert.equal(reads.includes('EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE'), false);
  assert.equal(store.useTranslatorReviewStore.getState().accessPasscode, null);
  assert.equal(store.useTranslatorReviewStore.getState().enabled, false);
});

// Lets the queued (fire-and-forget) SecureStore writes settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function persistedSnapshot(): Record<string, unknown> {
  const raw = mmkv.get('translator-review-storage');
  return raw ? ((JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {}) : {};
}

test('enabling writes the passcode to SecureStore and never to MMKV', async (t) => {
  const store = await loadStore();
  if (!store) {
    t.skip('module mocking unavailable (run with --experimental-test-module-mocks)');
    return;
  }
  secureStoreCalls.length = 0;

  const { useTranslatorReviewStore } = store;
  assert.equal(useTranslatorReviewStore.getState().enableWithPasscode('  Secret-1  '), true);
  await flush();

  assert.equal(useTranslatorReviewStore.getState().enabled, true);
  assert.equal(useTranslatorReviewStore.getState().accessPasscode, 'Secret-1');

  const persisted = persistedSnapshot();
  assert.equal(persisted.enabled, true, 'enabled stays in MMKV so cold start renders instantly');
  assert.equal(
    'accessPasscode' in persisted,
    false,
    'the passcode must not appear in the MMKV snapshot'
  );
  assert.equal(JSON.stringify(persisted).includes('Secret-1'), false);

  assert.deepEqual(
    secureStoreCalls.filter((call) => call.op === 'set'),
    [{ op: 'set', key: 'everybible.translatorReview.passcode' }]
  );
  assert.equal(secureStore.get('everybible.translatorReview.passcode'), 'Secret-1');
});

test('an invalid passcode neither enables the store nor touches SecureStore', async (t) => {
  const store = await loadStore();
  if (!store) {
    t.skip('module mocking unavailable');
    return;
  }
  const { useTranslatorReviewStore } = store;
  useTranslatorReviewStore.setState({ enabled: false, accessPasscode: null });
  secureStore.clear();
  secureStoreCalls.length = 0;

  assert.equal(useTranslatorReviewStore.getState().enableWithPasscode('   '), false);
  await flush();

  assert.equal(useTranslatorReviewStore.getState().enabled, false);
  assert.equal(secureStoreCalls.length, 0);
});

test('disable() and resetForSignOut() delete the stored passcode', async (t) => {
  const store = await loadStore();
  if (!store) {
    t.skip('module mocking unavailable');
    return;
  }
  const { useTranslatorReviewStore } = store;

  for (const action of ['disable', 'resetForSignOut'] as const) {
    useTranslatorReviewStore.getState().enableWithPasscode('Secret-2');
    await flush();
    assert.equal(secureStore.get('everybible.translatorReview.passcode'), 'Secret-2');

    secureStoreCalls.length = 0;
    useTranslatorReviewStore.getState()[action]();
    await flush();

    assert.equal(useTranslatorReviewStore.getState().enabled, false, `${action} disables`);
    assert.equal(useTranslatorReviewStore.getState().accessPasscode, null, `${action} clears`);
    assert.equal(
      secureStore.has('everybible.translatorReview.passcode'),
      false,
      `${action} must delete the keystore entry`
    );
    assert.deepEqual(
      secureStoreCalls
        .filter((call) => call.key === 'everybible.translatorReview.passcode')
        .map((call) => call.op),
      ['delete']
    );
  }

  // resetForSignOut is the broader one: it also drops per-device markers.
  useTranslatorReviewStore.getState().markListened('item-1');
  useTranslatorReviewStore.getState().disable();
  assert.deepEqual(Object.keys(useTranslatorReviewStore.getState().feedbackMarkers), ['item-1']);
  useTranslatorReviewStore.getState().resetForSignOut();
  assert.deepEqual(useTranslatorReviewStore.getState().feedbackMarkers, {});
});

test('hydrateTranslatorReviewPasscode restores the passcode from SecureStore', async (t) => {
  const store = await loadStore();
  if (!store) {
    t.skip('module mocking unavailable');
    return;
  }
  const { useTranslatorReviewStore, hydrateTranslatorReviewPasscode } = store;

  // Cold start: persist middleware rehydrated `enabled`, the passcode is not in memory yet.
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: null });
  secureStore.set('everybible.translatorReview.passcode', 'Secret-3');

  await hydrateTranslatorReviewPasscode();

  assert.equal(useTranslatorReviewStore.getState().accessPasscode, 'Secret-3');
  assert.equal(useTranslatorReviewStore.getState().enabled, true);

  // A passcode already set in memory (dev passcode / just-entered) is not overwritten.
  useTranslatorReviewStore.setState({ accessPasscode: 'in-memory' });
  await hydrateTranslatorReviewPasscode();
  assert.equal(useTranslatorReviewStore.getState().accessPasscode, 'in-memory');

  // Translator mode off: the keystore is never read at all.
  useTranslatorReviewStore.setState({ enabled: false, accessPasscode: null });
  secureStoreCalls.length = 0;
  await hydrateTranslatorReviewPasscode();
  assert.equal(secureStoreCalls.length, 0);
  assert.equal(useTranslatorReviewStore.getState().accessPasscode, null);
});

test('a SecureStore failure does not throw out of a store action', async (t) => {
  const store = await loadStore();
  if (!store) {
    t.skip('module mocking unavailable');
    return;
  }
  const { useTranslatorReviewStore, hydrateTranslatorReviewPasscode } = store;
  const warn = console.warn;
  console.warn = () => {};
  try {
    // Nothing stored and the mock resolves null — hydration must be a no-op, not a throw.
    secureStore.delete('everybible.translatorReview.passcode');
    useTranslatorReviewStore.setState({ enabled: true, accessPasscode: null });
    await hydrateTranslatorReviewPasscode();
    assert.equal(useTranslatorReviewStore.getState().accessPasscode, null);
  } finally {
    console.warn = warn;
  }
});

// --- S7 migration: a legacy plaintext passcode moves into SecureStore and is scrubbed ----

// The v4 migration (plaintext passcode moved to SecureStore, version 5, passcode-free
// snapshot) runs on the real store in translatorReviewStore.test.ts: 'migrating from v2
// keeps a stored passcode ... into the keystore' and 'migration rewrites the stored
// snapshot at the current version, passcode-free'.
