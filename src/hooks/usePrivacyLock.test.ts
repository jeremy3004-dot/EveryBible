import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mockExpoCrypto, mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createReactNativeStub } from '../testing/reactNativeStub';

/**
 * There is no React renderer installed, so `react` is the shared hook runtime:
 * refs persist per mount, effects run when the harness commits them, and
 * `useSyncExternalStore` reads the Zustand snapshot directly. The privacy store
 * itself is real.
 */
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const rn = createReactNativeStub({ nativeModules: {} });
mockModule(mock, 'react-native', rn);

// The privacy store's service layer hashes the secure code with expo-crypto.
mockExpoCrypto(mock);

const secureStore = new Map<string, string>();
let pauseSecureRead: (() => Promise<void>) | null = null;
let pauseSecureWrite: (() => Promise<void>) | null = null;
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => {
    const record = secureStore.get(key) ?? null;
    await pauseSecureRead?.();
    return record;
  },
  setItemAsync: async (key: string, value: string) => {
    await pauseSecureWrite?.();
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
let lockAfterPrivacyLockFailure: typeof import('./usePrivacyLock').lockAfterPrivacyLockFailure;
let usePrivacyStore: typeof import('../stores/privacyStore').usePrivacyStore;

/** Mounts the hook and returns its unmount function. */
const mountPrivacyLock = () => {
  const view = runtime.mount(usePrivacyLock);
  view.flushEffects();
  return view.unmount;
};

before(async () => {
  ({ usePrivacyLock, lockAfterPrivacyLockFailure } = await import('./usePrivacyLock'));
  ({ usePrivacyStore } = await import('../stores/privacyStore'));
});

afterEach(() => {
  runtime.unmountAll();
});

beforeEach(() => {
  pauseSecureRead = null;
  pauseSecureWrite = null;
  secureStore.clear();
  usePrivacyStore.setState(usePrivacyStore.getInitialState(), true);
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

const configureLockedPin = () => {
  const salt = 'test-salt';
  secureStore.set(
    'everybible.privacy.settings',
    JSON.stringify({
      mode: 'discreet',
      pinCredential: {
        salt,
        hash: createHash('sha256').update(`${salt}:1234`).digest('hex'),
      },
      failedPinAttempts: 0,
      pinLockedUntil: null,
    })
  );
  configureDiscreet();
  usePrivacyStore.getState().lock();
  recordIconReconciles();
};

for (const backgroundDuringSave of [false, true]) {
  test(`a discreet PIN change ${backgroundDuringSave ? 'preserves a background lock' : 'stays unlocked without a new lock'}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    configureLockedPin();
    assert.equal(await usePrivacyStore.getState().unlock('1234'), true);
    const unmount = mountPrivacyLock();
    let markWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    let releaseWrite!: () => void;
    const writePaused = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    pauseSecureWrite = () => {
      markWriteStarted();
      return writePaused;
    };

    const save = usePrivacyStore
      .getState()
      .saveConfiguration({ mode: 'discreet', pinInput: '5678' });
    await writeStarted;
    if (backgroundDuringSave) {
      rn.AppState.emit('background');
      rn.AppState.emit('active');
      assert.equal(usePrivacyStore.getState().isLocked, true);
    }
    releaseWrite();
    assert.deepEqual(await save, { success: true, errorKey: null });
    assert.equal(usePrivacyStore.getState().isLocked, backgroundDuringSave);

    pauseSecureWrite = null;
    usePrivacyStore.getState().lock();
    assert.equal(await usePrivacyStore.getState().unlock('5678'), true, 'the new PIN was saved');
    unmount();
  });
}

test('an old PIN attempt during a pending PIN change cannot restore the old credential', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  configureLockedPin();
  assert.equal(await usePrivacyStore.getState().unlock('1234'), true);
  const unmount = mountPrivacyLock();
  let markWriteStarted!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  let releaseWrite!: () => void;
  const writePaused = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  pauseSecureWrite = () => {
    markWriteStarted();
    return writePaused;
  };
  const save = usePrivacyStore.getState().saveConfiguration({ mode: 'discreet', pinInput: '5678' });
  await writeStarted;
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  const oldAttempt = usePrivacyStore.getState().unlock('1234');
  await new Promise<void>((resolve) => setImmediate(resolve));
  pauseSecureWrite = null;
  releaseWrite();
  await save;
  const oldSuccess = await oldAttempt;

  assert.equal(oldSuccess, false);
  assert.equal(usePrivacyStore.getState().isLocked, true);
  assert.equal(await usePrivacyStore.getState().unlock('5678'), true);
  usePrivacyStore.getState().lock();
  assert.equal(await usePrivacyStore.getState().unlock('1234'), false);
  unmount();
});

test('overlapping configuration saves leave the store and persisted record at the latest request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  configureLockedPin();
  assert.equal(await usePrivacyStore.getState().unlock('1234'), true);
  let markWriteStarted!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  let releaseWrite!: () => void;
  const writePaused = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  pauseSecureWrite = () => {
    markWriteStarted();
    return writePaused;
  };
  const earlier = usePrivacyStore
    .getState()
    .saveConfiguration({ mode: 'discreet', pinInput: '5678' });
  await writeStarted;
  pauseSecureWrite = null;
  const latest = usePrivacyStore.getState().saveConfiguration({ mode: 'standard' });
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseWrite();
  await Promise.all([earlier, latest]);

  assert.equal(usePrivacyStore.getState().mode, 'standard');
  assert.equal(usePrivacyStore.getState().hasPin, false);
  const persisted = JSON.parse(secureStore.get('everybible.privacy.settings')!);
  assert.equal(persisted.mode, 'standard');
  assert.equal(persisted.pinCredential, null);
});

test('a PIN verification started before backgrounding cannot unlock the new foreground session', async () => {
  configureLockedPin();
  const unmount = mountPrivacyLock();
  let markReadStarted!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  let releaseRead!: () => void;
  const readPaused = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  pauseSecureRead = () => {
    markReadStarted();
    return readPaused;
  };

  const attempt = usePrivacyStore.getState().unlock('1234');
  await readStarted;
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  releaseRead();
  const success = await attempt;

  assert.equal(
    usePrivacyStore.getState().isLocked,
    true,
    'returning from the background requires a fresh PIN attempt'
  );
  assert.equal(success, false, 'the caller must not treat the stale verification as an unlock');
  pauseSecureRead = null;
  assert.equal(await usePrivacyStore.getState().unlock('1234'), true);
  assert.equal(usePrivacyStore.getState().isLocked, false, 'a fresh correct attempt still unlocks');
  unmount();
});

test('PIN attempts queued before backgrounding cannot unlock the new foreground session', async () => {
  configureLockedPin();
  const unmount = mountPrivacyLock();
  let markReadStarted!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  let releaseRead!: () => void;
  const readPaused = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  pauseSecureRead = () => {
    markReadStarted();
    return readPaused;
  };

  const wrongAttempt = usePrivacyStore.getState().unlock('9999');
  await readStarted;
  const queuedCorrectAttempt = usePrivacyStore.getState().unlock('1234');
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  releaseRead();
  const outcomes = await Promise.all([wrongAttempt, queuedCorrectAttempt]);

  assert.equal(usePrivacyStore.getState().isLocked, true);
  assert.deepEqual(outcomes, [false, false]);
  assert.equal(
    JSON.parse(secureStore.get('everybible.privacy.settings')!).failedPinAttempts,
    1,
    'the completed wrong attempt remains counted, while the invalidated queued attempt never runs'
  );
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

test('discreet mode turned on after mount still locks on the next background', () => {
  const unmount = mountPrivacyLock();
  // The configuration is read when the app leaves the foreground, so the lock never
  // depends on the host having re-rendered after privacy settings changed.
  configureDiscreet();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, true);
  unmount();
});

test('an error while locking still leaves a discreet install locked', (t) => {
  t.mock.method(console, 'error', () => {});
  configureDiscreet();
  usePrivacyStore.setState({
    lock: () => {
      throw new Error('lock failed');
    },
  });
  const unmount = mountPrivacyLock();

  rn.AppState.emit('background');

  assert.equal(usePrivacyStore.getState().isLocked, true);
  unmount();
});

test('a failed privacy-lock host locks a discreet install so the lock screen shows', (t) => {
  t.mock.method(console, 'error', () => {});
  configureDiscreet();

  lockAfterPrivacyLockFailure(new Error('host crashed'));

  assert.equal(usePrivacyStore.getState().isLocked, true);
});

test('a failed privacy-lock host leaves a standard install usable', (t) => {
  t.mock.method(console, 'error', () => {});
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'standard',
    hasPin: false,
    isLocked: false,
  });

  lockAfterPrivacyLockFailure(new Error('host crashed'));

  assert.equal(usePrivacyStore.getState().isLocked, false);
});

test('a failed privacy-lock host does not lock out a discreet install that has no PIN', (t) => {
  t.mock.method(console, 'error', () => {});
  usePrivacyStore.setState({
    isInitialized: true,
    mode: 'discreet',
    hasPin: false,
    isLocked: false,
  });

  lockAfterPrivacyLockFailure(new Error('host crashed'));

  assert.equal(usePrivacyStore.getState().isLocked, false, 'there is no PIN to unlock it with');
});

// ─── app icon retry ───────────────────────────────────────────────────────────

/** Replaces the store's icon reconcile with a counter; the real one is covered in privacyStore. */
const recordIconReconciles = () => {
  const calls = { count: 0 };
  usePrivacyStore.setState({
    reconcileAppIcon: async () => {
      calls.count += 1;
    },
  });
  return calls;
};

test('returning to the foreground retries an icon change that did not take', () => {
  configureDiscreet();
  const reconciles = recordIconReconciles();
  const unmount = mountPrivacyLock();
  const atMount = reconciles.count;

  rn.AppState.emit('background');
  rn.AppState.emit('active');

  assert.equal(reconciles.count, atMount + 1);
  unmount();
});

test('leaving the foreground does not touch the app icon', () => {
  configureDiscreet();
  const reconciles = recordIconReconciles();
  const unmount = mountPrivacyLock();
  const atMount = reconciles.count;

  rn.AppState.emit('inactive');
  rn.AppState.emit('background');

  assert.equal(reconciles.count, atMount);
  unmount();
});

test('the icon is reconciled once privacy settings have loaded at launch', () => {
  const reconciles = recordIconReconciles();
  const unmount = mountPrivacyLock();
  assert.equal(reconciles.count, 0, 'the saved mode is not known before initialization');

  usePrivacyStore.setState({ isInitialized: true, mode: 'discreet' });
  usePrivacyStore.setState({ isLocked: false });

  assert.equal(reconciles.count, 1, 'only the transition to initialized triggers it');
  unmount();
});

test('a lock host mounted after initialization reconciles the icon straight away', () => {
  configureDiscreet();
  const reconciles = recordIconReconciles();

  const unmount = mountPrivacyLock();

  assert.equal(reconciles.count, 1);
  unmount();
});
