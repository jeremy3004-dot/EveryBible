import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

// Regression cover for session single-emission and attribution (P1 S4): signed-in users
// once produced a duplicate anonymous session_started, and session rows lost user_id.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock, { os: 'ios' });

const auth = { isAuthenticated: false, isInitialized: true };
const authListeners = new Set<(state: typeof auth) => void>();
/** The session restore finishing: auth settles, then subscribers hear about it. */
const finishRestore = (isAuthenticated: boolean) => {
  Object.assign(auth, { isAuthenticated, isInitialized: true });
  for (const listener of [...authListeners]) {
    listener(auth);
  }
};
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => auth,
    subscribe: (listener: (state: typeof auth) => void) => {
      authListeners.add(listener);
      return () => {
        authListeners.delete(listener);
      };
    },
  },
});

const calls: string[] = [];
const record =
  (name: string, result?: unknown) =>
  (...args: unknown[]) => {
    calls.push(args.length > 0 ? `${name}(${args.join(',')})` : name);
    return result;
  };
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  startAnonymousUsageSession: record('startAnonymousUsageSession'),
  initAnonymousSessionContext: record('initAnonymousSessionContext', 'session-1'),
  startSession: record('startSession'),
  primeGeoContext: record('primeGeoContext', Promise.resolve()),
  endAnonymousUsageSession: record('endAnonymousUsageSession'),
  clearAnonymousSessionContext: record('clearAnonymousSessionContext'),
  flushAnonymousUsageEvents: record('flushAnonymousUsageEvents', Promise.resolve()),
  endSession: record('endSession'),
  flushEvents: record('flushEvents', Promise.resolve()),
});

type Hook = typeof import('./useAppSessionAnalytics').useAppSessionAnalytics;
let useAppSessionAnalytics: Hook;

before(async () => {
  ({ useAppSessionAnalytics } = await import('./useAppSessionAnalytics'));
  // Load the (mocked) service up front so each lazy import resolves from the cache.
  await import('../services/analytics');
});

beforeEach(() => {
  rn.AppState.currentState = 'active';
  auth.isAuthenticated = false;
  auth.isInitialized = true;
  authListeners.clear();
  calls.length = 0;
});

/**
 * Let the hook's lazy `import('../services/analytics').then(...)` land. Await a
 * load of the same (mocked) module rather than counting turns: on Node 22 each
 * import crosses the loader thread and can outlast any fixed number of turns.
 */
const settle = async () => {
  await import('../services/analytics');
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

afterEach(async () => {
  runtime.unmountAll();
  // An unmount while active ends the session through the lazy import; let it
  // land here so it is not recorded against the next test.
  await settle();
});

function mountApp(enabled = true) {
  const view = runtime.mount(useAppSessionAnalytics, enabled);
  view.flushEffects();
  return view;
}

const background = async () => {
  rn.AppState.emit('background');
  await settle();
};
const foreground = async () => {
  rn.AppState.emit('active');
  await settle();
};

test('a signed-in foreground starts exactly one session, on the authenticated path', async () => {
  auth.isAuthenticated = true;
  mountApp();
  await settle();

  assert.deepEqual(calls, [
    'primeGeoContext',
    'initAnonymousSessionContext',
    'startSession(session-1)',
  ]);
});

test('a signed-out foreground starts exactly one anonymous session', async () => {
  mountApp();
  await settle();

  assert.deepEqual(calls, ['primeGeoContext', 'startAnonymousUsageSession']);
});

test('a signed-in background ends exactly one session and flushes both queues', async () => {
  auth.isAuthenticated = true;
  mountApp();
  await settle();
  calls.length = 0;

  await background();

  assert.deepEqual(calls, [
    'clearAnonymousSessionContext',
    'endSession',
    'flushAnonymousUsageEvents',
    'flushEvents',
  ]);
});

test('a signed-out background ends the anonymous session and flushes both queues', async () => {
  mountApp();
  await settle();
  calls.length = 0;

  await background();

  assert.deepEqual(calls, ['endAnonymousUsageSession', 'flushAnonymousUsageEvents', 'flushEvents']);
});

test('auth is read when a session starts, so a sign-in between sessions is attributed', async () => {
  mountApp();
  await settle();
  await background();
  auth.isAuthenticated = true;
  calls.length = 0;

  await foreground();

  assert.deepEqual(calls, [
    'primeGeoContext',
    'initAnonymousSessionContext',
    'startSession(session-1)',
  ]);
});

test('a session ends on the path it started on, even if auth changed meanwhile', async () => {
  auth.isAuthenticated = true;
  mountApp();
  await settle();
  auth.isAuthenticated = false;
  calls.length = 0;

  await background();

  assert.ok(calls.includes('endSession'));
  assert.ok(!calls.includes('endAnonymousUsageSession'));
});

test('nothing is tracked before onboarding or while the privacy lock is on', async () => {
  mountApp(false);
  await settle();
  await background();
  await foreground();

  assert.deepEqual(calls, []);
});

test('unmounting while active ends and flushes the open session', async () => {
  const view = mountApp();
  await settle();
  calls.length = 0;

  view.unmount();
  await settle();

  assert.deepEqual(calls, ['endAnonymousUsageSession', 'flushAnonymousUsageEvents', 'flushEvents']);
});

test('a cold-start session waits for the session restore, then is attributed to the signed-in reader', async () => {
  auth.isInitialized = false;
  mountApp();
  await settle();

  assert.deepEqual(calls, ['primeGeoContext']);

  finishRestore(true);
  await settle();

  assert.deepEqual(calls, [
    'primeGeoContext',
    'initAnonymousSessionContext',
    'startSession(session-1)',
  ]);
  assert.equal(authListeners.size, 0);
});

test('a cold start that restores no session starts one anonymous session when the restore finishes', async () => {
  auth.isInitialized = false;
  mountApp();
  await settle();

  finishRestore(false);
  finishRestore(false);
  await settle();

  assert.deepEqual(calls, ['primeGeoContext', 'startAnonymousUsageSession']);
});

test('leaving the app before the restore finishes still starts and ends exactly one session', async () => {
  auth.isInitialized = false;
  mountApp();
  await settle();

  await background();
  finishRestore(true);
  await settle();

  assert.deepEqual(calls, [
    'primeGeoContext',
    'startAnonymousUsageSession',
    'endAnonymousUsageSession',
    'flushAnonymousUsageEvents',
    'flushEvents',
  ]);
  assert.equal(authListeners.size, 0);
});
