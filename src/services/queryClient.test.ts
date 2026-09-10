import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { mockModule, mockReactNative } from '../testing/mockModules';

// The real @tanstack/react-query is used: focusManager and onlineManager are the
// singletons the module wires up, so the assertions here are about the state
// those managers end up in. Only the two native edges are replaced.
const rn = mockReactNative(mock, { os: 'ios', appState: 'active' });

type NetInfoListener = (state: { isConnected: boolean | null }) => void;

const netInfoListeners = new Set<NetInfoListener>();
let netInfoSubscribeCount = 0;
let netInfoUnsubscribeCount = 0;

// installQueryClientListeners() reaches NetInfo through a lazy CommonJS
// `require(...).default`, so the fake carries a self-reference: it answers
// whether the loader hands back the namespace or the interop default.
const netInfoFake: Record<string, unknown> = {
  addEventListener: (listener: NetInfoListener) => {
    netInfoSubscribeCount += 1;
    netInfoListeners.add(listener);
    return () => {
      netInfoUnsubscribeCount += 1;
      netInfoListeners.delete(listener);
    };
  },
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

const emitNetInfo = (isConnected: boolean | null) => {
  for (const listener of netInfoListeners) {
    listener({ isConnected });
  }
};

let queryClient: import('@tanstack/react-query').QueryClient;
let focusManager: (typeof import('@tanstack/react-query'))['focusManager'];
let onlineManager: (typeof import('@tanstack/react-query'))['onlineManager'];

/** Native subscriptions observed straight after the import, before installing. */
const atImport = { appStateListeners: -1, netInfoSubscribes: -1 };

before(async () => {
  // Importing the module must NOT wire anything up: this module is on App.tsx's
  // static boot graph, and subscribing here dragged NetInfo into cold start.
  const { queryClient: client, installQueryClientListeners } = await import('./queryClient');
  queryClient = client;
  atImport.appStateListeners = rn.AppState.listenerCount();
  atImport.netInfoSubscribes = netInfoSubscribeCount;

  // AppRuntimeEffects calls this after interactions; call it twice to pin the
  // idempotence the caller relies on.
  installQueryClientListeners();
  installQueryClientListeners();

  // @tanstack/react-query ships separate `import` and `require` builds, each
  // with its own focusManager/onlineManager singleton. This repo has no
  // `"type": "module"`, so the module under test loads the `require` build —
  // read the managers the same way or the assertions watch the wrong instance.
  ({ focusManager, onlineManager } = createRequire(import.meta.url)(
    '@tanstack/react-query'
  ) as typeof import('@tanstack/react-query'));
});

test('the shared client retries a failed query twice', () => {
  assert.equal(queryClient.getDefaultOptions().queries?.retry, 2);
});

test('the shared client treats data as fresh for five minutes', () => {
  assert.equal(queryClient.getDefaultOptions().queries?.staleTime, 5 * 60 * 1000);
});

test('the shared client garbage-collects inactive queries after ten minutes', () => {
  assert.equal(queryClient.getDefaultOptions().queries?.gcTime, 10 * 60 * 1000);
});

test('importing the module touches neither AppState nor NetInfo, keeping them off cold start', () => {
  assert.deepEqual(atImport, { appStateListeners: 0, netInfoSubscribes: 0 });
});

test('installing the listeners subscribes to app state exactly once, however often it is called', () => {
  assert.equal(rn.AppState.listenerCount(), 1);
});

test('installing the listeners subscribes to NetInfo exactly once, however often it is called', () => {
  assert.equal(netInfoSubscribeCount, 1);
  assert.equal(netInfoListeners.size, 1);
});

test('backgrounding the app unfocuses react-query so it stops refetching', () => {
  rn.AppState.emit('background');

  assert.equal(focusManager.isFocused(), false);
});

test('returning to the foreground refocuses react-query', () => {
  rn.AppState.emit('background');
  rn.AppState.emit('active');

  assert.equal(focusManager.isFocused(), true);
});

test('an inactive app state (the iOS app switcher) counts as unfocused', () => {
  rn.AppState.emit('active');

  rn.AppState.emit('inactive');

  assert.equal(focusManager.isFocused(), false);
});

test('a focus change notifies react-query subscribers', () => {
  rn.AppState.emit('active');
  const seen: boolean[] = [];
  const unsubscribe = focusManager.subscribe((focused) => seen.push(focused));

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  unsubscribe();

  assert.deepEqual(seen, [false, true]);
});

test('losing the network marks react-query offline', () => {
  emitNetInfo(false);

  assert.equal(onlineManager.isOnline(), false);
});

test('regaining the network marks react-query online again', () => {
  emitNetInfo(false);

  emitNetInfo(true);

  assert.equal(onlineManager.isOnline(), true);
});

test('an unknown connection state (null) is treated as offline', () => {
  emitNetInfo(true);

  emitNetInfo(null);

  assert.equal(onlineManager.isOnline(), false);
});

// The three tests below run in order: react-query releases its event listener
// when the last subscriber goes away, so they must come after the tests that
// rely on the NetInfo subscription installed in before() being live.
test('an online change notifies react-query subscribers', () => {
  emitNetInfo(true);
  const seen: boolean[] = [];
  const unsubscribe = onlineManager.subscribe((online) => seen.push(online));

  emitNetInfo(false);
  emitNetInfo(true);
  unsubscribe();

  assert.deepEqual(seen, [false, true]);
});

test('dropping the last online subscriber releases the native NetInfo listener', () => {
  assert.equal(netInfoUnsubscribeCount, 1);
  assert.equal(netInfoListeners.size, 0);
});

test('a new online subscriber re-attaches the NetInfo listener registered at install', () => {
  const unsubscribe = onlineManager.subscribe(() => {});

  assert.equal(netInfoSubscribeCount, 2);
  assert.equal(netInfoListeners.size, 1);
  emitNetInfo(false);
  assert.equal(onlineManager.isOnline(), false);
  unsubscribe();
});
