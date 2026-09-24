import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';

type NotificationHandler = {
  handleNotification: () => Promise<Record<string, boolean>>;
};

const handlers: NotificationHandler[] = [];
mockModule(mock, 'expo-notifications/build/NotificationsHandler', {
  setNotificationHandler: (handler: NotificationHandler) => {
    handlers.push(handler);
  },
});

const responseListener = () => ({ remove: () => {} });
const lastResponse = async () => null;
const pushTokenListener = () => ({ remove: () => {} });
mockModule(mock, 'expo-notifications/build/NotificationsEmitter', {
  addNotificationResponseReceivedListener: responseListener,
  getLastNotificationResponseAsync: lastResponse,
});
mockModule(mock, 'expo-notifications/build/TokenEmitter', {
  addPushTokenListener: pushTokenListener,
});

// The package root must stay unloaded on the boot path: it evaluates the push
// token auto-registration side-effect module and its Node polyfills. Anything
// registered through it would land here instead of in the deep-module fakes.
const rootCalls: string[] = [];
mockModule(mock, 'expo-notifications', {
  setNotificationHandler: () => {
    rootCalls.push('setNotificationHandler');
  },
  addNotificationResponseReceivedListener: () => {
    rootCalls.push('addNotificationResponseReceivedListener');
    return { remove: () => {} };
  },
  addPushTokenListener: () => {
    rootCalls.push('addPushTokenListener');
    return { remove: () => {} };
  },
});

let bootstrap: typeof import('./notificationBootstrap');

before(async () => {
  bootstrap = await import('./notificationBootstrap');
});

test('the foreground handler is registered exactly once per call', () => {
  handlers.length = 0;

  bootstrap.setupNotificationHandler();

  assert.equal(handlers.length, 1);
});

test('foreground notifications show a banner and a list entry with sound but no badge', async () => {
  handlers.length = 0;
  bootstrap.setupNotificationHandler();

  assert.deepEqual(await handlers[0].handleNotification(), {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
});

test('in discreet mode foreground notifications are neither shown, listed nor heard', async () => {
  handlers.length = 0;
  let discreet = true;
  bootstrap.setupNotificationHandler({ isDiscreet: () => discreet });

  assert.deepEqual(await handlers[0].handleNotification(), {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });

  discreet = false;
  assert.equal((await handlers[0].handleNotification()).shouldShowBanner, true);
});

test('App.tsx gets the tap listener, the launch tap and the push-token listener from the same modules the package root re-exports', () => {
  assert.equal(bootstrap.addNotificationResponseReceivedListener, responseListener);
  assert.equal(bootstrap.getLastNotificationResponseAsync, lastResponse);
  assert.equal(bootstrap.addPushTokenListener, pushTokenListener);
});

test('registering at boot never goes through the expo-notifications root', () => {
  bootstrap.setupNotificationHandler();

  assert.deepEqual(rootCalls, []);
});
