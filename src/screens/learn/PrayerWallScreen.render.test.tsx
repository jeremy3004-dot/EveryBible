import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// The wall lives only on the server; posts wait for its moderation, so nothing is cached.
const backend = {
  offline: false,
  result: { success: false, error: 'Failed to fetch' } as {
    success: boolean;
    data?: unknown[];
    error?: string;
  },
};
mockModule(mock, sourcePath('services/prayer/prayerService.ts'), {
  listPrayerRequests: async () => backend.result,
});
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => backend.offline,
});

beforeEach(() => {
  backend.offline = false;
  backend.result = { success: false, error: 'Failed to fetch' };
});

async function renderWall() {
  harness.navigation.route.params = { groupId: 'group-1', groupName: 'Tuesday group' };
  const { PrayerWallScreen } = await import('./PrayerWallScreen');
  const view = await harness.render(<PrayerWallScreen />);
  await view.flush();
  await view.flush();
  return view;
}

test('offline, a failed load says the reader is offline instead of "something went wrong"', async () => {
  backend.offline = true;

  const view = await renderWall();

  assert.ok(view.getByText(t('common.offlineTryAgain')));
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('online, a failed load keeps the generic error with a retry', async () => {
  const view = await renderWall();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.ok(view.getByRole('button', { name: t('common.retry') }));
});

test('retrying after reconnecting shows the wall instead of the offline message', async () => {
  backend.offline = true;
  const view = await renderWall();
  backend.offline = false;
  backend.result = { success: true, data: [] };

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(view.queryByText(t('common.offlineTryAgain')), null);
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
});
