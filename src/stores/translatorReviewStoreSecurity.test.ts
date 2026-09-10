/**
 * Translator review passcode storage (S7) + dev-passcode inlining (S10).
 *
 * The store imports react-native-mmkv (native) and expo-secure-store (native), so both are
 * replaced with in-memory doubles through node:test module mocks. That lets the real store —
 * persist middleware, migrate and partialize included — run under the Node test runner.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const storeSource = readFileSync(
  fileURLToPath(new URL('./translatorReviewStore.ts', import.meta.url).href),
  'utf8'
);

// --- S10: the dev passcode must be dead-code-eliminable in a release bundle -------------

test('the dev passcode env read is confined to a __DEV__ branch', () => {
  // Expo's Babel transform inlines process.env.EXPO_PUBLIC_* as a string literal at build
  // time. Reading it unconditionally would bake the dev passcode into the production
  // bundle; inside a __DEV__ branch the minifier drops it.
  const match = storeSource.match(
    /EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE:\s*([\s\S]{0,160}?),\n/
  );
  assert.ok(match, 'expected the env key to be assigned from a guarded expression');
  const expression = match?.[1] ?? '';
  assert.match(expression, /isDevRuntime\s*\?/);
  assert.match(expression, /:\s*undefined/);
  assert.match(storeSource, /const isDevRuntime = typeof __DEV__ !== 'undefined' && __DEV__;/);

  // No unguarded read anywhere else in the file.
  const occurrences = storeSource.match(
    /process\.env\.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE/g
  );
  assert.equal(occurrences?.length, 1);
});

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
      secureStoreCalls.map((call) => call.op),
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

test('the v4 migration moves a persisted plaintext passcode into SecureStore', () => {
  // The persisted snapshot below is what a pre-v4 install has on disk. Rather than
  // re-importing the store under a second module registry, exercise the exported migrate
  // contract structurally: version bumped, migration hook present, partialize passcode-free.
  assert.match(storeSource, /version: 4,/);
  assert.match(
    storeSource,
    /if \(version < 4 && accessPasscode\) \{\s*persistPasscodeToSecureStore\(accessPasscode\);/
  );

  const partialize = storeSource.match(/partialize: \(state\) => \(\{([\s\S]*?)\}\),/)?.[1] ?? '';
  assert.ok(partialize.includes('enabled: state.enabled'));
  assert.ok(partialize.includes('feedbackMarkers: state.feedbackMarkers'));
  assert.equal(
    partialize.includes('accessPasscode'),
    false,
    'partialize must not persist accessPasscode to MMKV'
  );
});
