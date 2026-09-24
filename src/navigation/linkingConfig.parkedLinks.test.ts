import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../testing/mockModules';

/**
 * Links that arrive while the navigator cannot take them. The navigator unmounts
 * behind the discreet-mode lock screen (and is not ready for a moment after each
 * mount), and React Navigation only listens for links while its container is
 * mounted: a verse link tapped while the app sat locked in the background was
 * dropped, so unlocking showed wherever the reader had been. Reset links and
 * reminder taps were already parked until navigation was ready; Bible links now are
 * too. The lock itself is never bypassed: nothing is delivered until the navigator
 * is mounted and ready, which is only after unlock.
 */

type UrlEvent = { url: string };
const urlListeners = new Set<(event: UrlEvent) => void>();
const emitUrl = (url: string) => {
  for (const listener of urlListeners) listener({ url });
};

mockModule(mock, 'expo-linking', {
  createURL: () => 'exp://127.0.0.1:8081/--/',
  getInitialURL: async () => null,
  addEventListener: (_type: 'url', listener: (event: UrlEvent) => void) => {
    urlListeners.add(listener);
    return { remove: () => urlListeners.delete(listener) };
  },
});
mockModule(mock, '@react-navigation/native', { getStateFromPath: () => undefined });

let navigationReady = false;
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => navigationReady },
});

const load = () => import('./linkingConfig');

/** A mounted NavigationContainer's link listener, as React Navigation subscribes it. */
async function mountNavigator() {
  const { linkingConfig } = await load();
  const delivered: string[] = [];
  assert.ok(linkingConfig.subscribe);
  const unsubscribe = linkingConfig.subscribe((url) => delivered.push(url));
  return { delivered, unmount: () => unsubscribe?.() };
}

const JOHN = 'com.everybible.app://bible/john/3/16';
const PSALM = 'com.everybible.app://bible/psalms/23';

beforeEach(async () => {
  navigationReady = false;
  // Drain anything a previous test left parked.
  const { delivered, unmount } = await mountNavigator();
  navigationReady = true;
  (await load()).flushParkedLink();
  delivered.length = 0;
  unmount();
  navigationReady = false;
});

test('a link to a mounted, ready navigator is delivered at once, exactly once', async () => {
  navigationReady = true;
  const navigator = await mountNavigator();
  emitUrl(JOHN);
  (await load()).flushParkedLink();
  assert.deepEqual(navigator.delivered, [JOHN]);
  navigator.unmount();
});

test('a link that arrives while the navigator is unmounted behind the lock opens after unlock', async () => {
  const before = await mountNavigator();
  navigationReady = true;
  before.unmount(); // locked: the navigator unmounts
  navigationReady = false;

  emitUrl(JOHN);
  assert.deepEqual(before.delivered, [], 'the unmounted navigator is not handed the link');

  // Unlocked: the remounted container is ready before React Navigation subscribes.
  navigationReady = true;
  const after = await mountNavigator();
  assert.deepEqual(after.delivered, [JOHN]);
  (await load()).flushParkedLink();
  assert.deepEqual(after.delivered, [JOHN], 'delivered once');
  after.unmount();
});

test('a link that arrives before the new navigator is ready waits for onReady', async () => {
  const navigator = await mountNavigator();
  emitUrl(JOHN);
  assert.deepEqual(navigator.delivered, [], 'a dispatch before ready would be dropped');

  navigationReady = true;
  (await load()).flushParkedLink(); // RootNavigator's onReady
  assert.deepEqual(navigator.delivered, [JOHN]);
  navigator.unmount();
});

test('while locked only the latest link is kept', async () => {
  emitUrl(JOHN);
  emitUrl(PSALM);
  navigationReady = true;
  const navigator = await mountNavigator();
  assert.deepEqual(navigator.delivered, [PSALM]);
  navigator.unmount();
});

test('flushing without a listening navigator keeps the link parked', async () => {
  emitUrl(JOHN);
  navigationReady = true;
  (await load()).flushParkedLink();
  const navigator = await mountNavigator();
  assert.deepEqual(navigator.delivered, [JOHN]);
  navigator.unmount();
});

test('the app listens for links once, however often the navigator remounts', async () => {
  for (let mount = 0; mount < 5; mount += 1) {
    const navigator = await mountNavigator();
    navigator.unmount();
  }
  assert.equal(urlListeners.size, 1);
});
