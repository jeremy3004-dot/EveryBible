import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockExpoCrypto, mockModule, mockSecureStore, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createReactNativeStub } from '../testing/reactNativeStub';

/**
 * iOS shows its own alert for every app icon change, and the app goes 'inactive' under
 * it. That is the app's own doing, not the reader leaving, so it must not lock. The
 * native icon module here raises the alert the way iOS does: the app turns inactive as
 * the change is requested and active again once the alert is dismissed.
 */
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

let homeScreenIcon: 'standard' | 'discreet' = 'standard';
let alertShown: (() => void) | null = null;
/** Resolves once the icon alert is on screen (the app has gone inactive under it). */
const nextIconAlert = () => new Promise<void>((resolve) => (alertShown = resolve));
const iconAlerts: string[] = [];

const rn = createReactNativeStub({
  nativeModules: {
    EveryBiblePrivacyModule: {
      getCurrentAppIcon: async () => homeScreenIcon,
      setAppIcon: async (mode: 'standard' | 'discreet') => {
        iconAlerts.push(mode);
        rn.AppState.emit('inactive');
        alertShown?.();
        homeScreenIcon = mode;
        return true;
      },
    },
  },
});
mockModule(mock, 'react-native', rn);
mockExpoCrypto(mock);
mockSecureStore(mock);

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

let usePrivacyLock: typeof import('./usePrivacyLock').usePrivacyLock;
let usePrivacyStore: typeof import('../stores/privacyStore').usePrivacyStore;
let withPrivacyLockGrace: typeof import('../services/privacy/privacyLockGrace').withPrivacyLockGrace;
let GRACE_MS: number;

before(async () => {
  ({ usePrivacyLock } = await import('./usePrivacyLock'));
  ({ usePrivacyStore } = await import('../stores/privacyStore'));
  const grace = await import('../services/privacy/privacyLockGrace');
  withPrivacyLockGrace = grace.withPrivacyLockGrace;
  GRACE_MS = grace.PRIVACY_LOCK_GRACE_AFTER_SYSTEM_UI_MS;
});

beforeEach(() => {
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
  usePrivacyStore.setState({ isInitialized: true, isLocked: false });
  rn.AppState.currentState = 'active';
  iconAlerts.length = 0;
});

afterEach(() => {
  runtime.unmountAll();
  mock.timers.reset();
});

/** Mounts the lock and records every time it engages, even if something clears it later. */
const mountPrivacyLock = () => {
  const view = runtime.mount(usePrivacyLock);
  view.flushEffects();
  const locks: number[] = [];
  const unsubscribe = usePrivacyStore.subscribe((state, previous) => {
    if (state.isLocked && !previous.isLocked) locks.push(Date.now());
  });
  return { locks, unsubscribe };
};

test('turning discreet mode on does not lock the app under the icon alert it raises', async () => {
  homeScreenIcon = 'standard';
  mock.timers.enable({ apis: ['setTimeout'] });
  const lock = mountPrivacyLock();

  const saved = await usePrivacyStore.getState().saveConfiguration({
    mode: 'discreet',
    pinInput: '1234',
  });
  assert.equal(saved.success, true);

  const alert$ = nextIconAlert();
  mock.timers.tick(400);
  await alert$;
  rn.AppState.emit('active');

  assert.deepEqual(iconAlerts, ['discreet']);
  assert.equal(lock.locks.length, 0, 'the lock never engaged');
  assert.equal(usePrivacyStore.getState().isLocked, false);
  lock.unsubscribe();
});

test('turning discreet mode off does not lock the app under the icon alert it raises', async () => {
  homeScreenIcon = 'discreet';
  mock.timers.enable({ apis: ['setTimeout'] });
  await usePrivacyStore.getState().saveConfiguration({ mode: 'discreet', pinInput: '1234' });
  const lock = mountPrivacyLock();

  await usePrivacyStore.getState().disablePrivacy();
  rn.AppState.emit('active');

  assert.deepEqual(iconAlerts, ['standard']);
  assert.deepEqual(
    { mode: usePrivacyStore.getState().mode, isLocked: usePrivacyStore.getState().isLocked },
    { mode: 'standard', isLocked: false }
  );
  assert.equal(lock.locks.length, 0, 'the lock never engaged, so the navigator never remounted');
  lock.unsubscribe();
});

// ─── The grace window's limits ────────────────────────────────────────────────

const configureDiscreet = () => {
  usePrivacyStore.setState({ mode: 'discreet', hasPin: true, isLocked: false });
};

/** Runs `during` while a self-triggered system prompt is still open. */
async function whileSystemPromptOpen(during: () => void) {
  let answer: () => void = () => {};
  const prompt = withPrivacyLockGrace(() => new Promise<void>((resolve) => (answer = resolve)));
  during();
  answer();
  await prompt;
}

test("leaving for the background while the app's own prompt is open still locks", async () => {
  configureDiscreet();
  mountPrivacyLock();

  await whileSystemPromptOpen(() => rn.AppState.emit('background'));

  assert.equal(usePrivacyStore.getState().isLocked, true);
});

test("an inactive blip ignored for the app's own prompt still locks if the app then backgrounds", async () => {
  configureDiscreet();
  mountPrivacyLock();

  await whileSystemPromptOpen(() => {
    rn.AppState.emit('inactive');
    assert.equal(usePrivacyStore.getState().isLocked, false, 'the prompt itself does not lock');
  });
  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, true);
});

test("once the grace after the app's own prompt has passed, going inactive locks again", async () => {
  configureDiscreet();
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 60_000 });
  mountPrivacyLock();
  await whileSystemPromptOpen(() => undefined);

  mock.timers.tick(GRACE_MS - 1);
  rn.AppState.emit('inactive');
  assert.equal(usePrivacyStore.getState().isLocked, false, 'still inside the grace');
  rn.AppState.emit('active');

  mock.timers.tick(1);
  rn.AppState.emit('inactive');
  assert.equal(usePrivacyStore.getState().isLocked, true);
});

test('a prompt that never settles stops suppressing the lock after the cap', async () => {
  configureDiscreet();
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 120_000 });
  mountPrivacyLock();
  const { PRIVACY_LOCK_GRACE_MAX_PENDING_MS } =
    await import('../services/privacy/privacyLockGrace');
  void withPrivacyLockGrace(() => new Promise<void>(() => undefined));

  mock.timers.tick(PRIVACY_LOCK_GRACE_MAX_PENDING_MS);
  rn.AppState.emit('inactive');

  assert.equal(usePrivacyStore.getState().isLocked, true);
});
