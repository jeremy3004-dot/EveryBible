import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createSyncCoordinator } from './syncCoordinator';

type Connectivity = { isConnected: boolean | null; isInternetReachable: boolean | null };

function mountNetworkEffect() {
  const effects: Array<() => void | (() => void)> = [];
  let listener!: (state: Connectivity) => void;
  let syncCalls = 0;
  let unsubscribed = false;
  const auth = {
    user: { uid: 'A' },
    authGeneration: 1,
    isAuthenticated: true,
    isInitialized: true,
    reconcileUserBoundary: () => {},
  };
  const useAuthStore = Object.assign(
    (selector: (state: typeof auth) => unknown) => selector(auth),
    {
      getState: () => auth,
    }
  );
  const dependencies: Record<string, unknown> = {
    react: {
      useEffect: (effect: () => void | (() => void)) => effects.push(effect),
      useRef: (current: unknown) => ({ current }),
      useCallback: (callback: unknown) => callback,
      useMemo: (factory: () => unknown) => factory(),
    },
    'react-native': { AppState: { currentState: 'active' } },
    '@react-native-community/netinfo': {
      default: {
        addEventListener: (next: typeof listener) => {
          listener = next;
          return () => {
            unsubscribed = true;
          };
        },
      },
    },
    '../services/supabase': { supabase: {} },
    '../services/sync': {
      syncAll: async () => {
        syncCalls += 1;
      },
      pullFromCloud: async () => ({ success: true }),
    },
    '../stores/authStore': { useAuthStore },
    './syncCoordinator': { createSyncCoordinator },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL('./useSync.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }
  ).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  (exports as { useSync: () => unknown }).useSync();
  // Exercise the network effect itself; the independent initial/auth lifecycle
  // effects are not mounted in this focused subscriber test.
  const cleanup = effects[1]();
  return {
    emit: async (state: Connectivity) => {
      listener(state);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    calls: () => syncCalls,
    cleanup,
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
  if (network.cleanup) network.cleanup();
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
