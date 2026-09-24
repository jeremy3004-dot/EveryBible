import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  deferred,
  enableSync,
  env,
  harness,
  localGroup,
  resetGroupFixture,
  syncedGroup,
  t,
  useFourFieldsStore,
} from './groupScreens.renderFixture';

beforeEach(resetGroupFixture);

async function renderList() {
  const { GroupListScreen } = await import('./GroupListScreen');
  const view = await harness.render(<GroupListScreen />);
  await view.flush();
  return view;
}

test('with no groups on the device, the list says so and shows no synced section', async () => {
  const view = await renderList();

  assert.ok(view.getByText(t('harvest.noLocalGroups')));
  assert.ok(view.getByText(t('harvest.groupSyncPending')));
  assert.equal(view.queryByText(t('harvest.syncedGroupsTitle')), null);
  assert.equal(env.calls.listSyncedGroups, 0, 'nothing is fetched while sync is off');
});

test('local groups are listed with their member count and join code, and open their detail', async () => {
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderList();

  assert.ok(view.getByText('2 • ABC234'));
  assert.ok(view.getByText(t('harvest.localOnly')));
  await view.press(view.getByText('Tuesday group'));

  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['GroupDetail', { groupId: 'local-1' }],
  });
});

test('signed out with sync available, the list offers sign-in instead of synced groups', async () => {
  enableSync();
  harness.authStore.setState({ user: null });
  const view = await renderList();

  assert.ok(view.getByText(t('harvest.groupSyncSignin')));
  assert.ok(view.getByText(t('harvest.syncedGroupsSignin')));
  assert.equal(env.calls.listSyncedGroups, 0);

  await view.press(view.getByRole('button', { name: t('auth.signIn') }));
  assert.deepEqual(env.calls.authFlow, ['signIn']);
});

test('signed in, synced groups load behind a spinner and open their detail', async () => {
  enableSync();
  const pending = deferred<ReturnType<typeof syncedGroup>[]>();
  env.listSyncedGroups = () => pending.promise;
  const view = await renderList();

  assert.ok(view.getByText(t('harvest.loadingSyncedGroups')));
  assert.ok(view.getByText(t('harvest.groupSyncReady')));

  pending.resolve([syncedGroup('member')]);
  await view.flush();

  assert.equal(view.queryByText(t('harvest.loadingSyncedGroups')), null);
  assert.ok(view.getByText('2 • SYNC22'));
  assert.ok(view.getByText(t('harvest.syncedLabel')));
  await view.press(view.getByText('Riverside group'));
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['GroupDetail', { groupId: 'synced-1' }],
  });
});

test('an account with no synced groups gets the empty message', async () => {
  enableSync();
  const view = await renderList();

  assert.ok(view.getByText(t('harvest.noSyncedGroups')));
});

test('offline, the synced section shows a retry while local groups stay usable', async () => {
  enableSync();
  useFourFieldsStore.setState({ groups: [localGroup()] });
  env.listSyncedGroups = async () => {
    throw new Error('Network request failed');
  };
  const view = await renderList();

  assert.ok(view.getByText(t('harvest.groupSyncLoadError')));
  assert.ok(view.getByText('Tuesday group'), 'local groups do not need the network');

  env.listSyncedGroups = async () => [syncedGroup('leader')];
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(env.calls.listSyncedGroups, 2);
  assert.equal(view.queryByText(t('harvest.groupSyncLoadError')), null);
  assert.ok(view.getByText('Riverside group'));
});

test('back leaves the list', async () => {
  const view = await renderList();

  await view.press(view.getByRole('button', { name: t('common.back') }));

  assert.deepEqual(harness.navigation.calls.at(-1), { method: 'goBack', args: [] });
});
