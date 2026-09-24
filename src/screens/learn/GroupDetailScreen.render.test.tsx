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
  VIEWER,
} from './groupScreens.renderFixture';

beforeEach(resetGroupFixture);

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
