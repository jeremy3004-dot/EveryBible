import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

type Connectivity = { isConnected: boolean | null; isInternetReachable: boolean | null };

// Focused on one thing: the NetInfo subscriber inside useSync, and which
// connectivity transitions it treats as a reconnect worth syncing. The rest of
// the hook's lifecycle lives in useSync.behavior.test.ts.
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockReactNative(mock, { os: 'ios' });

let listener: ((state: Connectivity) => void) | null = null;
let unsubscribed = false;
mockModule(mock, '@react-native-community/netinfo', {
  default: {
    addEventListener: (next: (state: Connectivity) => void) => {
      listener = next;
      return () => {
        unsubscribed = true;
        listener = null;
      };
    },
  },
});

mockModule(mock, sourcePath('services/supabase/index.ts'), {
  supabase: { auth: { startAutoRefresh: () => {}, stopAutoRefresh: () => {} } },
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => auth.user?.uid ?? null,
});

let syncCalls = 0;
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncAll: async () => {
    syncCalls += 1;
  },
  pullFromCloud: async () => ({ success: true }),
});

const auth = {
  user: { uid: 'A' } as { uid: string } | null,
  authGeneration: 1,
  isAuthenticated: true,
  isInitialized: true,
  reconcileUserBoundary: () => {},
};
const useAuthStore = Object.assign(<T>(selector: (state: typeof auth) => T): T => selector(auth), {
  getState: () => auth,
});
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore });

let useSync: typeof import('./useSync').useSync;

before(async () => {
  ({ useSync } = await import('./useSync'));
});

beforeEach(() => {
  listener = null;
  unsubscribed = false;
  syncCalls = 0;
  auth.user = { uid: 'A' };
  auth.authGeneration = 1;
  auth.isAuthenticated = true;
  auth.isInitialized = true;
});

afterEach(() => {
  runtime.unmountAll();
});

/**
 * Mount with nobody signed in so the initial-sync effect stays quiet, then
 * restore the session: what follows is only what the network subscriber does.
 */
function mountNetworkEffect() {
  auth.isAuthenticated = false;
  const view = runtime.mount(useSync);
  view.flushEffects();
  auth.isAuthenticated = true;

  return {
    emit: async (state: Connectivity) => {
      listener?.(state);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    calls: () => syncCalls,
    cleanup: view.unmount,
    unsubscribed: () => unsubscribed,
  };
}

const online = { isConnected: true, isInternetReachable: true };
const offline = { isConnected: false, isInternetReachable: false };

test('network details updates do not repeat cloud sync while still online', async () => {
  const network = mountNetworkEffect();
  await network.emit(online);
  for (let index = 0; index < 10; index += 1) await network.emit(online);
  assert.equal(network.calls(), 0);
  await network.emit(offline);
  await network.emit(online);
  for (let index = 0; index < 10; index += 1) await network.emit(online);
  assert.equal(network.calls(), 1, 'one reconnect should cause one cloud sync');
  network.cleanup();
  assert.equal(network.unsubscribed(), true);
});

test('unknown reachability does not manufacture a disconnect, but confirmed offline does', async () => {
  const network = mountNetworkEffect();
  await network.emit(online);
  await network.emit({ isConnected: true, isInternetReachable: null });
  await network.emit(online);
  assert.equal(network.calls(), 0);
  await network.emit({ isConnected: true, isInternetReachable: false });
  await network.emit(online);
  assert.equal(network.calls(), 1);
});

test('initial unknown connectivity can recover once internet becomes reachable', async () => {
  const network = mountNetworkEffect();
  await network.emit({ isConnected: null, isInternetReachable: null });
  await network.emit(online);
  assert.equal(network.calls(), 1);
});
