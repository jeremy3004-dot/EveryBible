import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
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
  VIEWER,
} from './groupScreens.renderFixture';

beforeEach(() => {
  resetGroupFixture();
  const authState = { user: null, authGeneration: 0 };
  harness.authStore.setState(authState);
});

type Alert = {
  title: string;
  message?: string;
  buttons?: Array<{ text: string; onPress?: () => void }>;
};

async function renderDetail(groupId: string) {
  harness.navigation.route.params = { groupId };
  const { GroupDetailScreen } = await import('./GroupDetailScreen');
  const view = await harness.render(<GroupDetailScreen />);
  await view.flush();
  await view.flush();
  return view;
}

const lastAlert = () => harness.rn.__recorded.alerts.at(-1) as Alert;

test('a local leave-group alert cannot act or navigate after its account changes', async () => {
  harness.authStore.setState({ user: VIEWER });
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');
  await view.press(view.getByRole('button', { name: t('groups.leaveGroup') }));
  const confirm = lastAlert().buttons?.find((button) => button.text === t('groups.leave'));
  assert.ok(confirm?.onPress);
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'next-account' }, authGeneration: 1 });
  });
  await act(async () => {
    confirm.onPress?.();
  });
  assert.deepEqual(env.leftGroups, []);
  assert.equal(
    harness.navigation.calls.some((call) => call.method === 'goBack'),
    false
  );
});

for (const transition of ['generation', 'unmount', 'route'] as const) {
  test(`a retained leave-group confirmation cannot act after ${transition} changes`, async () => {
    harness.authStore.setState({ user: VIEWER });
    useFourFieldsStore.setState({ groups: [localGroup(), localGroup({ id: 'local-2' })] });
    const view = await renderDetail('local-1');
    await view.press(view.getByRole('button', { name: t('groups.leaveGroup') }));
    const confirm = lastAlert().buttons?.find((button) => button.text === t('groups.leave'));
    assert.ok(confirm?.onPress);
    if (transition === 'unmount') await view.unmount();
    else if (transition === 'generation') {
      await act(async () => {
        harness.authStore.setState({ authGeneration: 1 });
      });
    } else {
      harness.navigation.route.params = { groupId: 'local-2' };
      const { GroupDetailScreen } = await import('./GroupDetailScreen');
      await view.rerender(<GroupDetailScreen />);
    }
    await act(async () => {
      confirm.onPress?.();
    });
    assert.deepEqual(env.leftGroups, []);
    assert.equal(
      harness.navigation.calls.some((call) => call.method === 'goBack'),
      false
    );
  });
}

test('only the latest leave confirmation can act, and it is consumed once', async () => {
  harness.authStore.setState({ user: VIEWER });
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');
  const open = () => view.press(view.getByRole('button', { name: t('groups.leaveGroup') }));
  await open();
  const oldConfirm = lastAlert().buttons?.find((button) => button.text === t('groups.leave'));
  await open();
  const confirm = lastAlert().buttons?.find((button) => button.text === t('groups.leave'));
  await act(async () => {
    oldConfirm?.onPress?.();
  });
  assert.deepEqual(env.leftGroups, []);
  await act(async () => {
    confirm?.onPress?.();
    confirm?.onPress?.();
  });
  assert.deepEqual(env.leftGroups, [['local-1', VIEWER.uid]]);
  assert.equal(harness.navigation.calls.filter((call) => call.method === 'goBack').length, 1);
});

test('prayer preview is reloaded for a new account and hides the prior account content', async () => {
  enableSync();
  env.getSyncedGroup = async () => syncedGroup('member');
  env.listPrayerRequests = async () => ({
    success: true,
    data: [{ is_answered: false, content: 'Prayer hidden from the next viewer' }],
  });
  const view = await renderDetail('synced-1');
  await view.flush();
  assert.ok(view.getByText('Prayer hidden from the next viewer'));
  env.listPrayerRequests = async () => ({ success: true, data: [] });
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'other-viewer', displayName: 'Priscilla' } });
  });
  await view.flush();
  await view.flush();
  assert.equal(view.queryByText('Prayer hidden from the next viewer'), null);
});

test('a delayed prayer preview from the previous account cannot replace the current preview', async () => {
  enableSync();
  env.getSyncedGroup = async () => syncedGroup('member');
  const oldPreview = deferred<Awaited<ReturnType<typeof env.listPrayerRequests>>>();
  env.listPrayerRequests = () => oldPreview.promise;
  const view = await renderDetail('synced-1');

  env.listPrayerRequests = async () => ({
    success: true,
    data: [{ is_answered: false, content: 'Current account preview' }],
  });
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'other-viewer', displayName: 'Priscilla' } });
  });
  await view.flush();
  await view.flush();
  assert.ok(view.getByText('Current account preview'));
  oldPreview.resolve({
    success: true,
    data: [{ is_answered: false, content: 'Previous account preview' }],
  });
  await view.flush();
  assert.equal(view.queryByText('Previous account preview'), null);
  assert.ok(view.getByText('Current account preview'));
});

for (const failure of ['response', 'throw'] as const) {
  test(`a new session for the same user hides its old prayer preview when the current load fails by ${failure}`, async () => {
    enableSync();
    env.getSyncedGroup = async () => syncedGroup('member');
    env.listPrayerRequests = async () => ({
      success: true,
      data: [{ is_answered: false, content: 'Previous session preview' }],
    });
    const view = await renderDetail('synced-1');
    assert.ok(view.getByText('Previous session preview'));
    const currentPreview = deferred<Awaited<ReturnType<typeof env.listPrayerRequests>>>();
    env.listPrayerRequests = () => currentPreview.promise;
    const nextAuthState = { user: VIEWER, authGeneration: 1 };
    await act(async () => harness.authStore.setState(nextAuthState));
    assert.equal(view.queryByText('Previous session preview'), null);
    await view.flush();
    if (failure === 'response') currentPreview.resolve({ success: false });
    else currentPreview.reject(new Error('Network unavailable'));
    await view.flush();
    assert.equal(view.queryByText(t('prayer.title')), null);
    assert.equal(view.queryByText('Previous session preview'), null);
  });
}

test('replacing the group route hides its preview while the new group preview is loading', async () => {
  enableSync();
  env.getSyncedGroup = async (id) => syncedGroup('member', { id });
  env.listPrayerRequests = async () => ({
    success: true,
    data: [{ is_answered: false, content: 'First group preview' }],
  });
  const view = await renderDetail('synced-1');
  assert.ok(view.getByText('First group preview'));
  const newPreview = deferred<Awaited<ReturnType<typeof env.listPrayerRequests>>>();
  env.listPrayerRequests = () => newPreview.promise;
  harness.navigation.route.params = { groupId: 'synced-2' };
  const { GroupDetailScreen } = await import('./GroupDetailScreen');
  await view.rerender(<GroupDetailScreen />);
  await view.flush();
  await view.flush();
  assert.equal(view.queryByText('First group preview'), null);
  assert.equal(view.queryByText(t('prayer.title')), null);
  newPreview.resolve({
    success: true,
    data: [{ is_answered: false, content: 'Second group preview' }],
  });
  await view.flush();
  assert.equal(view.queryByText('First group preview'), null);
  assert.ok(view.getByText('Second group preview'));
});

// ─── Local groups ────────────────────────────────────────────────────────────

test('a local group shows its join code, current lesson and members, marking the viewer', async () => {
  harness.authStore.setState({ user: VIEWER });
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  assert.ok(view.getByRole('header', { name: 'Tuesday group' }));
  assert.ok(view.getByText('ABC234'));
  assert.ok(view.getByText(t('groups.members', { count: 2 })));
  assert.ok(view.getByText(`Lydia${t('groups.you')}`));
  assert.ok(view.getByText('Silas'));
  assert.equal(view.getAllByText(t('groups.leader')).length, 1, 'one leader badge');
  assert.ok(view.getByText(t('groups.lessonsCompleted', { count: 0 })));
});

test('a local group opens without the network: no server call, no prayer wall card', async () => {
  enableSync();
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  assert.deepEqual(env.calls.getSyncedGroup, []);
  assert.equal(view.queryByText(t('prayer.title')), null);
});

test('starting a session opens the group session for this group', async () => {
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  await view.press(view.getByRole('button', { name: t('groups.startGroupSession') }));

  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['GroupSession', { groupId: 'local-1' }],
  });
});

test('sharing sends the join code in the share sheet', async () => {
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  await view.press(view.getByRole('button', { name: t('groups.share') }));

  assert.deepEqual(harness.rn.__recorded.shares, [
    { message: t('interface.groupShareMessage', { name: 'Tuesday group', code: 'ABC234' }) },
  ]);
});

test('a leader leaving is warned that the group passes on, and confirming leaves and goes back', async () => {
  harness.authStore.setState({ user: VIEWER });
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  await view.press(view.getByRole('button', { name: t('groups.leaveGroup') }));

  const alert = lastAlert();
  assert.equal(alert.message, t('groups.leaveGroupLeaderMessage'));
  assert.deepEqual(env.leftGroups, [], 'nothing happens before confirming');
  alert.buttons?.find((button) => button.text === t('groups.leave'))?.onPress?.();
  assert.deepEqual(env.leftGroups, [['local-1', VIEWER.uid]]);
  assert.deepEqual(harness.navigation.calls.at(-1), { method: 'goBack', args: [] });
});

test('a member leaving gets the member confirmation', async () => {
  harness.authStore.setState({ user: { uid: 'member-2', displayName: 'Silas' } });
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  await view.press(view.getByRole('button', { name: t('groups.leaveGroup') }));

  assert.equal(lastAlert().message, t('groups.leaveGroupMemberMessage'));
});

test('signed out, a local group has no leave action', async () => {
  useFourFieldsStore.setState({ groups: [localGroup()] });
  const view = await renderDetail('local-1');

  assert.equal(view.queryByText(t('groups.leaveGroup')), null);
});

// ─── Missing and synced groups ───────────────────────────────────────────────

test('an unknown group says it was not found and offers a way back', async () => {
  const view = await renderDetail('missing');

  assert.ok(view.getByText(t('groups.groupNotFound')));
  await view.press(view.getByRole('button', { name: t('groups.goBack') }));
  assert.deepEqual(harness.navigation.calls.at(-1), { method: 'goBack', args: [] });
});

test('a synced group shows a loading state, then its read-only membership', async () => {
  enableSync();
  const pending = deferred<ReturnType<typeof syncedGroup> | null>();
  env.getSyncedGroup = () => pending.promise;
  const view = await renderDetail('synced-1');

  assert.ok(view.getByText(t('groups.loadingGroup')));

  pending.resolve(syncedGroup('member'));
  await view.flush();

  assert.deepEqual(env.calls.getSyncedGroup, ['synced-1']);
  assert.ok(view.getByRole('header', { name: 'Riverside group' }));
  assert.ok(view.getByText(t('groups.readOnlySyncedMembership')));
  assert.equal(view.queryByText(t('groups.leaveGroup')), null, 'synced groups are left elsewhere');
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['GroupSession', { groupId: 'synced-1' }],
  });
});

test('offline, a synced group that cannot load says so instead of "not found"', async () => {
  enableSync();
  env.getSyncedGroup = async () => {
    throw new Error('Network request failed');
  };
  const view = await renderDetail('synced-1');

  assert.ok(view.getByText(t('groups.unableToLoadGroup')));
  assert.equal(view.queryByText(t('groups.groupNotFound')), null);
});

for (const role of ['leader', 'member'] as const) {
  test(`the prayer wall card opens the wall as a ${role}`, async () => {
    enableSync();
    env.getSyncedGroup = async () => syncedGroup(role);
    env.listPrayerRequests = async () => ({
      success: true,
      data: [
        { is_answered: false, content: 'Pray for the harvest' },
        { is_answered: true, content: 'Answered already' },
      ],
    });
    const view = await renderDetail('synced-1');

    assert.ok(view.getByText(t('interface.activePrayerCount', { count: 1 })));
    assert.ok(view.getByText('Pray for the harvest'));
    await view.press(view.getByText(t('prayer.title')));

    assert.deepEqual(harness.navigation.calls.at(-1), {
      method: 'navigate',
      args: [
        'PrayerWall',
        { groupId: 'synced-1', groupName: 'Riverside group', isLeader: role === 'leader' },
      ],
    });
  });
}

test('an empty prayer wall invites the first request', async () => {
  enableSync();
  env.getSyncedGroup = async () => syncedGroup('member');
  const view = await renderDetail('synced-1');

  assert.ok(view.getByText(t('prayer.beFirst')));
});

test('a prayer wall that fails to load leaves the card out rather than showing it empty', async () => {
  enableSync();
  env.getSyncedGroup = async () => syncedGroup('member');
  env.listPrayerRequests = async () => ({ success: false });
  const view = await renderDetail('synced-1');

  assert.ok(view.getByRole('header', { name: 'Riverside group' }));
  assert.equal(view.queryByText(t('prayer.title')), null);
});
