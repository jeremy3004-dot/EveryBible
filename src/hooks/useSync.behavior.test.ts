import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import { createSupabaseFake } from '../testing/supabaseFake';
import type { useSync as UseSync } from './useSync';

// There is no renderer installed, so `react` is the shared hook runtime: it
// keeps per-instance ref / memo / callback slots and runs effects (with
// dependency comparison and cleanups) at commit time. That is what makes it
// possible to re-render the hook when auth changes and to assert that
// subscriptions are added on mount and removed on unmount.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

const rn = mockReactNative(mock, { os: 'ios' });

interface Connectivity {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}
let netInfoListener: ((state: Connectivity) => void) | null = null;
let netInfoUnsubscribeCount = 0;
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    addEventListener: (listener: (state: Connectivity) => void) => {
      netInfoListener = listener;
      return () => {
        netInfoUnsubscribeCount += 1;
        netInfoListener = null;
      };
    },
  },
});

const supabaseFake = createSupabaseFake();
mockModule(mock, sourcePath('services/supabase/index.ts'), {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => authState.user?.uid ?? null,
});

const syncAllCalls: Array<{ userId?: string; generation?: number }> = [];
const pullCalls: Array<string | undefined> = [];
let pullResult: () => Promise<{ success: boolean }> = async () => ({ success: true });
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncAll: async (userId?: string, generation?: number) => {
    syncAllCalls.push({ userId, generation });
    return { success: true };
  },
  pullFromCloud: async (userId?: string) => {
    pullCalls.push(userId);
    return pullResult();
  },
});

const reconcileCalls: string[] = [];
const authState = {
  user: { uid: 'user-a' } as { uid: string } | null,
  authGeneration: 1,
  isAuthenticated: true,
  isInitialized: true,
  reconcileUserBoundary: (userId: string) => {
    reconcileCalls.push(userId);
  },
};
const useAuthStore = Object.assign(
  <T>(selector: (state: typeof authState) => T): T => selector(authState),
  { getState: () => authState }
);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore });

// ---------------------------------------------------------------------------

let useSync: typeof UseSync;

/** Mount the hook: one render pass, then the commit that runs its effects. */
const mountSync = () => {
  const view = runtime.mount(useSync);
  view.flushEffects();
  return {
    get sync() {
      return view.result.sync;
    },
    rerender: () => {
      view.rerender();
      view.flushEffects();
    },
    unmount: view.unmount,
  };
};

const flush = async (rounds = 8) => {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const authMethodCalls = (method: string) =>
  supabaseFake.authCalls.filter((call) => call.method === method).length;

before(async () => {
  ({ useSync } = await import('./useSync'));
});

beforeEach(() => {
  supabaseFake.reset();
  rn.AppState.currentState = 'active';
  netInfoListener = null;
  netInfoUnsubscribeCount = 0;
  syncAllCalls.length = 0;
  pullCalls.length = 0;
  reconcileCalls.length = 0;
  pullResult = async () => ({ success: true });
  authState.user = { uid: 'user-a' };
  authState.authGeneration = 1;
  authState.isAuthenticated = true;
  authState.isInitialized = true;
});

afterEach(() => {
  runtime.unmountAll();
});

/** Mount with nobody signed in, then restore the session, so the initial-sync
 *  effect stays quiet and a test can observe one lifecycle event on its own. */
const mountWithoutInitialSync = () => {
  authState.isAuthenticated = false;
  const handle = mountSync();
  authState.isAuthenticated = true;
  return handle;
};

// ---------------------------------------------------------------------------
// Lifecycle subscriptions
// ---------------------------------------------------------------------------

test('mounting in the foreground starts token auto-refresh and subscribes to both signals', () => {
  mountWithoutInitialSync();

  assert.equal(authMethodCalls('startAutoRefresh'), 1);
  assert.equal(rn.AppState.listenerCount(), 1);
  assert.ok(netInfoListener);
});

test('mounting while backgrounded does not start token auto-refresh', () => {
  rn.AppState.currentState = 'background';

  mountWithoutInitialSync();

  assert.equal(authMethodCalls('startAutoRefresh'), 0);
  assert.equal(rn.AppState.listenerCount(), 1);
});

test('unmounting removes both subscriptions and stops token auto-refresh', () => {
  const handle = mountWithoutInitialSync();

  handle.unmount();

  assert.equal(rn.AppState.listenerCount(), 0);
  assert.equal(netInfoUnsubscribeCount, 1);
  assert.equal(authMethodCalls('stopAutoRefresh'), 1);
});

test('an unmounted hook no longer syncs when the app returns to the foreground', async () => {
  const handle = mountWithoutInitialSync();
  handle.unmount();

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await flush();

  assert.deepEqual(syncAllCalls, []);
});

// ---------------------------------------------------------------------------
// App-state driven syncing
// ---------------------------------------------------------------------------

test('returning to the foreground restarts auto-refresh and syncs', async () => {
  mountWithoutInitialSync();

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await flush();

  assert.equal(authMethodCalls('startAutoRefresh'), 2);
  assert.deepEqual(syncAllCalls, [{ userId: 'user-a', generation: 1 }]);
});

test('returning from an inactive state also syncs', async () => {
  mountWithoutInitialSync();

  rn.AppState.emit('inactive');
  rn.AppState.emit('active');
  await flush();

  assert.equal(syncAllCalls.length, 1);
});

test('backgrounding stops auto-refresh and syncs nothing', async () => {
  mountWithoutInitialSync();

  rn.AppState.emit('background');
  await flush();

  assert.equal(authMethodCalls('stopAutoRefresh'), 1);
  assert.deepEqual(syncAllCalls, []);
});

test('an active-to-active transition is not treated as a foreground return', async () => {
  mountWithoutInitialSync();

  rn.AppState.emit('active');
  await flush();

  assert.deepEqual(syncAllCalls, []);
  assert.equal(authMethodCalls('startAutoRefresh'), 1);
});

test('a foreground return pulls before it pushes when nothing has been pulled yet', async () => {
  mountWithoutInitialSync();

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.deepEqual(reconcileCalls, ['user-a']);
  assert.equal(syncAllCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Connectivity driven syncing
// ---------------------------------------------------------------------------

test('the connectivity listener ignores the state it is handed on subscription', async () => {
  mountWithoutInitialSync();

  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  await flush();

  assert.deepEqual(syncAllCalls, []);
});

test('coming back online after a dropout syncs once', async () => {
  mountWithoutInitialSync();

  netInfoListener?.({ isConnected: false, isInternetReachable: false });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  await flush();

  assert.deepEqual(syncAllCalls, [{ userId: 'user-a', generation: 1 }]);
});

test('staying online does not re-sync on every connectivity report', async () => {
  mountWithoutInitialSync();

  netInfoListener?.({ isConnected: false, isInternetReachable: false });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  await flush();

  assert.equal(syncAllCalls.length, 1);
});

test('an unknown reachability probe is not a dropout, so no phantom reconnect sync follows', async () => {
  mountWithoutInitialSync();

  // First callback establishes "online", then reachability goes unknown.
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  netInfoListener?.({ isConnected: true, isInternetReachable: null });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  await flush();

  assert.deepEqual(syncAllCalls, []);
});

test('losing internet while still connected counts as a dropout', async () => {
  mountWithoutInitialSync();

  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  netInfoListener?.({ isConnected: true, isInternetReachable: false });
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
  await flush();

  assert.equal(syncAllCalls.length, 1);
});

// ---------------------------------------------------------------------------
// performSync guards
// ---------------------------------------------------------------------------

test('a sync requested before auth has initialised is dropped', async () => {
  const handle = mountWithoutInitialSync();
  authState.isInitialized = false;

  await handle.sync();

  assert.deepEqual(syncAllCalls, []);
});

test('a sync requested while signed out is dropped', async () => {
  const handle = mountWithoutInitialSync();
  authState.isAuthenticated = false;

  await handle.sync();

  assert.deepEqual(syncAllCalls, []);
});

test('a sync requested with no user on the session is dropped', async () => {
  const handle = mountWithoutInitialSync();
  authState.user = null;

  await handle.sync();

  assert.deepEqual(syncAllCalls, []);
});

test('a sync requested for a different account than the one signed in is dropped', async () => {
  const handle = mountWithoutInitialSync();

  await handle.sync('user-b');

  assert.deepEqual(syncAllCalls, []);
});

test('a sync requested for a superseded auth generation is dropped', async () => {
  const handle = mountWithoutInitialSync();

  await handle.sync('user-a', 0);

  assert.deepEqual(syncAllCalls, []);
});

test('a sync requested for the live identity runs', async () => {
  const handle = mountWithoutInitialSync();

  await handle.sync('user-a', 1);
  await flush();

  assert.deepEqual(syncAllCalls, [{ userId: 'user-a', generation: 1 }]);
});

test('a failing cloud sync is swallowed rather than thrown at the caller', async () => {
  const handle = mountWithoutInitialSync();
  pullResult = async () => {
    throw new Error('offline');
  };

  await assert.doesNotReject(() => handle.sync());
});

// ---------------------------------------------------------------------------
// Initial sync on sign-in
// ---------------------------------------------------------------------------

test('mounting for a signed-in reader reconciles the boundary, pulls, then pushes', async () => {
  mountSync();
  await flush();

  assert.deepEqual(reconcileCalls, ['user-a']);
  assert.deepEqual(pullCalls, ['user-a']);
  assert.deepEqual(syncAllCalls, [{ userId: 'user-a', generation: 1 }]);
});

test('a failed initial pull stops the cycle before anything is pushed', async () => {
  pullResult = async () => ({ success: false });

  mountSync();
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.deepEqual(syncAllCalls, []);
});

test('a later foreground sync reuses the pull the initial sync already made', async () => {
  mountSync();
  await flush();

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.equal(syncAllCalls.length, 2);
});

test('an account switch while the initial pull is in flight abandons the push', async () => {
  pullResult = async () => {
    authState.user = { uid: 'user-b' };
    authState.authGeneration = 2;
    return { success: true };
  };

  mountSync();
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.deepEqual(syncAllCalls, []);
});

test('a re-render with the same identity does not start a second initial sync', async () => {
  const handle = mountSync();
  await flush();

  handle.rerender();
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.equal(syncAllCalls.length, 1);
});

test('signing out stops syncing, and signing back in pulls for the new session', async () => {
  const handle = mountSync();
  await flush();
  assert.equal(syncAllCalls.length, 1);

  authState.isAuthenticated = false;
  authState.user = null;
  handle.rerender();
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  await flush();
  assert.equal(syncAllCalls.length, 1, 'a signed-out foreground return must not sync');

  authState.isAuthenticated = true;
  authState.user = { uid: 'user-a' };
  authState.authGeneration = 2;
  handle.rerender();
  await flush();

  assert.deepEqual(pullCalls, ['user-a', 'user-a']);
  assert.deepEqual(syncAllCalls[1], { userId: 'user-a', generation: 2 });
});

test('a session that drops and returns unchanged syncs again on the prepared pull', async () => {
  // Signing out clears the "already synced this identity" marks, so the
  // restored session is not mistaken for the one that already ran. The pull
  // itself is not repeated: the coordinator has that identity prepared.
  const handle = mountSync();
  await flush();

  authState.isAuthenticated = false;
  handle.rerender();
  await flush();

  authState.isAuthenticated = true;
  handle.rerender();
  await flush();

  assert.deepEqual(pullCalls, ['user-a']);
  assert.deepEqual(syncAllCalls, [
    { userId: 'user-a', generation: 1 },
    { userId: 'user-a', generation: 1 },
  ]);
});

test('a new auth generation for the same uid starts a fresh initial sync', async () => {
  const handle = mountSync();
  await flush();

  authState.authGeneration = 2;
  handle.rerender();
  await flush();

  assert.equal(pullCalls.length, 2);
  assert.deepEqual(syncAllCalls[1], { userId: 'user-a', generation: 2 });
});

test('unmounting while the initial pull is in flight abandons the push', async () => {
  let releasePull = (): void => {};
  pullResult = () =>
    new Promise((resolve) => {
      releasePull = () => resolve({ success: true });
    });

  const handle = mountSync();
  await flush();
  handle.unmount();
  releasePull();
  await flush();

  assert.deepEqual(syncAllCalls, []);
});
