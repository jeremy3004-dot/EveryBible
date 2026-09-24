import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockExpoCrypto, mockModule, mockSecureStore, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createReactNativeStub } from '../testing/reactNativeStub';

/**
 * Android has no 'inactive' state: a permission dialog the app raises pauses the activity,
 * and AppState reports 'background'. Discreet mode must not take that for the reader
 * leaving (it locked, remounted Settings and dropped the permission result), but only
 * while the app's own prompt is open, and never for longer than the grace cap.
 */
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = createReactNativeStub({ os: 'android' });
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
let grace: typeof import('../services/privacy/privacyLockGrace');

before(async () => {
  ({ usePrivacyLock } = await import('./usePrivacyLock'));
  ({ usePrivacyStore } = await import('../stores/privacyStore'));
  grace = await import('../services/privacy/privacyLockGrace');
});

// Each test runs later on the fake clock, clear of any grace an earlier test left behind.
let clock = Date.now() + 1_000_000;

beforeEach(() => {
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: true,
    isLocked: false,
  });
  rn.AppState.currentState = 'active';
  clock += 1_000_000;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: clock });
});

afterEach(() => {
  runtime.unmountAll();
  mock.timers.reset();
});

const mountPrivacyLock = () => {
  const view = runtime.mount(usePrivacyLock);
  view.flushEffects();
};

/** Opens a prompt the app raised itself; the returned function answers it. */
function openOwnPrompt<T>(answerWith: T) {
  let answer: () => void = () => {};
  const result = grace.withPrivacyLockGrace(
    () => new Promise<T>((resolve) => (answer = () => resolve(answerWith)))
  );
  return { answer: () => (answer(), result) };
}

const isLocked = () => usePrivacyStore.getState().isLocked;

test("the app's own permission dialog does not lock, and its answer arrives", async () => {
  mountPrivacyLock();
  const prompt = openOwnPrompt('granted');

  rn.AppState.emit('background');
  assert.equal(isLocked(), false, 'the dialog pausing the activity does not lock');
  mock.timers.tick(3_000);
  rn.AppState.emit('active');
  assert.equal(await prompt.answer(), 'granted');

  assert.equal(isLocked(), false);
  mock.timers.tick(grace.PRIVACY_LOCK_GRACE_MAX_PENDING_MS * 2);
  assert.equal(isLocked(), false, 'no lock is left armed after the return');
});

test('backgrounding with no prompt of our own open locks at once', () => {
  mountPrivacyLock();

  rn.AppState.emit('background');

  assert.equal(isLocked(), true);
});

test("backgrounding just after the app's own prompt settled still locks at once", async () => {
  mountPrivacyLock();
  const prompt = openOwnPrompt('granted');
  await prompt.answer();

  rn.AppState.emit('background');

  assert.equal(isLocked(), true, 'only an open prompt excuses leaving the foreground');
});

test('a prompt left open past the cap locks while the app is still away', () => {
  mountPrivacyLock();
  openOwnPrompt('granted');

  rn.AppState.emit('background');
  mock.timers.tick(grace.PRIVACY_LOCK_GRACE_MAX_PENDING_MS - 1);
  assert.equal(isLocked(), false);
  mock.timers.tick(1);

  assert.equal(isLocked(), true);
});

test('returning after the cap locks even if no timer ran while the app was paused', () => {
  mountPrivacyLock();
  openOwnPrompt('granted');
  rn.AppState.emit('background');
  // Android stops JS timers while the activity is paused; only the clock moves.
  mock.timers.setTime(Date.now() + grace.PRIVACY_LOCK_GRACE_MAX_PENDING_MS + 1);

  rn.AppState.emit('active');

  assert.equal(isLocked(), true);
});

test('a standard install is never locked by the grace timer', () => {
  usePrivacyStore.setState({ mode: 'standard', hasPin: false });
  mountPrivacyLock();
  openOwnPrompt('granted');
  rn.AppState.emit('background');
  mock.timers.tick(grace.PRIVACY_LOCK_GRACE_MAX_PENDING_MS);

  assert.equal(isLocked(), false);
});
