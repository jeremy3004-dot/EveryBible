import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../../testing/mockModules';

type NotificationHandler = {
  handleNotification: () => Promise<Record<string, boolean>>;
};

const handlers: NotificationHandler[] = [];
mockModule(mock, 'expo-notifications', {
  setNotificationHandler: (handler: NotificationHandler) => {
    handlers.push(handler);
  },
});

let setupNotificationHandler: () => void;

before(async () => {
  ({ setupNotificationHandler } = await import('./notificationBootstrap'));
});

test('the foreground handler is registered exactly once per call', () => {
  handlers.length = 0;

  setupNotificationHandler();

  assert.equal(handlers.length, 1);
});

test('foreground notifications show a banner and a list entry with sound but no badge', async () => {
  handlers.length = 0;
  setupNotificationHandler();

  assert.deepEqual(await handlers[0].handleNotification(), {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
});
