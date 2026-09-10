/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockExpoCrypto, mockModule, sourcePath } from '../testing/mockModules';
import { createReactNativeStub } from '../testing/reactNativeStub';

/**
 * There is no React renderer installed, so `react` is replaced with the
 * smallest host that makes the hook run: effects fire immediately and their
 * cleanups are collected, refs persist per mount, and `useSyncExternalStore`
 * reads the Zustand snapshot directly. The privacy store itself is real.
 */
const cleanups: Array<() => void> = [];
const reactStub = {
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      cleanups.push(cleanup);
    }
  },
  useRef: <T>(initial: T) => ({ current: initial }),
  useCallback: <T>(callback: T) => callback,
  useMemo: <T>(factory: () => T) => factory(),
  useDebugValue: () => {},
  useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T): T => getSnapshot(),
};
mockModule(mock, 'react', { ...reactStub, default: reactStub });

const rn = createReactNativeStub({ nativeModules: {} });
mockModule(mock, 'react-native', rn);

// The privacy store's service layer hashes the secure code with expo-crypto.
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

/** Mounts the hook and returns its unmount function. */
const mountPrivacyLock = () => {
  const before = cleanups.length;
  usePrivacyLock();
  return () => {
    for (const cleanup of cleanups.splice(before)) {
      cleanup();
    }
  };
};

before(async () => {
  ({ usePrivacyLock } = await import('./usePrivacyLock'));
  ({ usePrivacyStore } = await import('../stores/privacyStore'));
});

beforeEach(() => {
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
  cleanups.length = 0;
  rn.AppState.currentState = 'active';
});

const configureDiscreet = () => {
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: true,
    isLocked: false,
  });
};

test('mounting registers exactly one app state listener', () => {
  const unmount = mountPrivacyLock();

  assert.equal(rn.AppState.listenerCount(), 1);

  unmount();
});

test('unmounting removes the app state listener so backgrounding no longer locks', () => {
  configureDiscreet();
  const unmount = mountPrivacyLock();

  unmount();

  assert.equal(rn.AppState.listenerCount(), 0);
  rn.AppState.emit('background');
  assert.equal(usePrivacyStore.getState().isLocked, false);
});

test('backgrounding a configured discreet install locks it', () => {
  configureDiscreet();
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, true);
  unmount();
});

test('the app-switcher preview (inactive) also locks a configured discreet install', () => {
  configureDiscreet();
  const unmount = mountPrivacyLock();

  rn.AppState.emit('inactive');

  assert.equal(usePrivacyStore.getState().isLocked, true);
  unmount();
});

test('returning to the foreground never locks on its own', () => {
  configureDiscreet();
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');
  usePrivacyStore.setState({ isLocked: false });
  rn.AppState.emit('active');

  assert.equal(usePrivacyStore.getState().isLocked, false);
  unmount();
});

test('a background-to-inactive transition does not re-lock an app the user already unlocked', () => {
  configureDiscreet();
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');
  usePrivacyStore.setState({ isLocked: false });
  rn.AppState.emit('inactive');

  assert.equal(
    usePrivacyStore.getState().isLocked,
    false,
    'only a transition out of the active state may lock'
  );
  unmount();
});

test('a standard-mode install is never locked by backgrounding', () => {
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'standard',
    hasPin: false,
    isLocked: false,
  });
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, false);
  unmount();
});

test('a discreet install without a pin is never locked by backgrounding', () => {
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: false,
    isLocked: false,
  });
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, false);
  unmount();
});

test('the listener reads privacy configuration captured at mount time', () => {
  const unmount = mountPrivacyLock();
  // The effect closes over mode/hasPin; React would re-run it on change, so a
  // configuration made after mount must not affect this mount's listener.
  configureDiscreet();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, false);
  unmount();
});
