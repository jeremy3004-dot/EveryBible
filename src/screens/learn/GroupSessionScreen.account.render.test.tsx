import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, mockSupabaseModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeUser } from '../../testing/supabaseFake';
import { installRenderHarness } from '../../testing/render';
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);
let role: 'leader' | 'member' = 'leader';
let finishRecord: (() => void) | undefined;
let recordStarted: (() => void) | undefined;
let record: () => Promise<void> = async () => {};
const updates: string[] = [];
const backend = createSupabaseFake();
let updateFails = false;
mockSupabaseModule(mock, backend);
mockModule(mock, sourcePath('constants/config.ts'), {
  config: { features: { studyGroupsSync: true } },
});
mockModule(mock, sourcePath('stores/fourFieldsStore.ts'), {
  useFourFieldsStore: create(() => ({ groups: [], groupProgress: {} })),
});
mockBarrel(mock, 'services/groups/index.ts', {
  real: [
    'buildGroupDetailSnapshot',
    'loadGroupDetailSnapshot',
    'getSyncedGroupServiceAvailability',
    'completeSyncedGroupSession',
  ],
  provide: {
    getSyncedGroup: async (groupId: string) => ({
      id: groupId,
      name: 'Tuesday group',
      join_code: 'ABC123',
      current_course_id: 'entry-course',
      current_lesson_id: 'entry-1',
      group_members: [
        {
          user_id: (harness.authStore.getState().user as { uid: string })?.uid,
          role,
          joined_at: '2026-09-01T00:00:00Z',
        },
      ],
    }),
  },
});
mockBarrel(mock, 'utils/index.ts', { provide: { successHaptic: () => {} } });
beforeEach(() => {
  backend.reset();
  backend.auth.handlers.getUser = async () => ({
    data: {
      user: makeFakeUser({ id: (harness.authStore.getState().user as { uid: string })?.uid }),
    },
    error: null,
  });
  backend.respondTo('group_sessions', async (call) => {
    await record();
    return { data: { id: 's1', ...(call.payload as object) } };
  });
  backend.respondTo('groups', (call) => {
    updates.push((harness.authStore.getState().user as { uid: string })?.uid ?? 'guest');
    return updateFails
      ? { error: { message: 'Could not advance' } }
      : { data: { id: 'group-1', ...(call.payload as object) } };
  });
  updateFails = false;
  role = 'leader';
  record = async () => {};
  updates.length = 0;
  finishRecord = undefined;
  recordStarted = undefined;
  harness.authStore.setState({ user: { uid: 'user-a' }, authGeneration: 1 });
});

for (const transition of ['generation', 'unmount'] as const) {
  test(`a saved session cannot advance or navigate after ${transition}`, async () => {
    record = () =>
      new Promise<void>((resolve) => {
        finishRecord = resolve;
      });
    const view = await renderCompletion();
    await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
    if (transition === 'generation') {
      await act(async () => harness.authStore.setState({ authGeneration: 2 }));
    } else {
      await view.unmount();
    }
    finishRecord?.();
    await view.flush();
    assert.deepEqual(updates, []);
    assert.deepEqual(harness.navigation.calls, []);
    assert.deepEqual(harness.rn.__recorded.alerts, []);
  });
}

test('an older account completion cannot clear the new account busy state', async () => {
  const finishes: Array<() => void> = [];
  record = () =>
    new Promise<void>((resolve) => {
      finishes.push(resolve);
    });
  const view = await renderCompletion();
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  await act(async () => harness.authStore.setState({ user: { uid: 'user-b' }, authGeneration: 2 }));
  await view.flush();
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  assertDefined(finishes[0], 'finishes[0]')();
  await view.flush();
  assert.ok(view.getByRole('button', { name: t('groups.session.saving'), busy: true }));
  assertDefined(finishes[1], 'finishes[1]')();
  await view.flush();
  assert.deepEqual(updates, ['user-b']);
  assert.equal(harness.navigation.calls.filter((call) => call.method === 'goBack').length, 1);
});

test('a pending completion for a replaced group route cannot advance or navigate', async () => {
  record = () =>
    new Promise<void>((resolve) => {
      finishRecord = resolve;
    });
  const view = await renderCompletion();
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  harness.navigation.route.params = { groupId: 'group-2' };
  const { GroupSessionScreen } = await import('./GroupSessionScreen');
  await view.rerender(<GroupSessionScreen />);
  finishRecord?.();
  await view.flush();
  assert.deepEqual(updates, []);
  assert.deepEqual(harness.navigation.calls, []);
});

test('a partial save explains the unchanged lesson and does not offer another record', async () => {
  updateFails = true;
  const view = await renderCompletion();
  const button = view.getByRole('button', { name: t('groups.saveSyncedSession') });
  await view.press(button);
  await view.flush();
  assert.equal(
    harness.rn.__recorded.alerts.at(-1)?.message,
    t('groups.syncSession.savedLessonUnchanged')
  );
  assert.equal(
    harness.navigation.calls.some((call) => call.method === 'goBack'),
    true
  );
  await act(async () => {
    (button.props.onPress as () => void)();
  });
  await view.flush();
  assert.equal(backend.callsFor('group_sessions').length, 1);
});

test('rapid completion taps record only once before React updates busy state', async () => {
  record = () =>
    new Promise<void>((resolve) => {
      finishRecord = resolve;
    });
  const view = await renderCompletion();
  const button = view.getByRole('button', { name: t('groups.saveSyncedSession') });
  await act(async () => {
    (button.props.onPress as () => void)();
    (button.props.onPress as () => void)();
  });
  await view.flush();
  assert.equal(backend.callsFor('group_sessions').length, 1);
  finishRecord?.();
  await view.flush();
});
async function renderCompletion() {
  harness.navigation.route.params = { groupId: 'group-1' };
  const { GroupSessionScreen } = await import('./GroupSessionScreen');
  const view = await harness.render(<GroupSessionScreen />);
  await view.flush();
  await view.press(view.getByRole('button', { name: t('common.next') }));
  await view.press(view.getByRole('button', { name: t('common.next') }));
  return view;
}
test('a session record finishing after account switch cannot advance the new account group or navigate', async () => {
  const started = new Promise<void>((resolve) => {
    recordStarted = resolve;
  });
  record = () => {
    recordStarted?.();
    return new Promise<void>((resolve) => {
      finishRecord = resolve;
    });
  };
  const view = await renderCompletion();
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  await started;
  await act(async () => {
    harness.authStore.setState({ user: { uid: 'user-b' }, authGeneration: 2 });
  });
  finishRecord?.();
  await view.flush();
  assert.deepEqual(updates, []);
  assert.equal(
    harness.navigation.calls.some((call) => call.method === 'goBack'),
    false
  );
});
test('a member can complete a session without attempting a leader-only group update', async () => {
  role = 'member';
  const view = await renderCompletion();
  await view.press(view.getByRole('button', { name: t('groups.saveSyncedSession') }));
  await view.flush();
  assert.deepEqual(updates, []);
  assert.equal(
    harness.navigation.calls.some((call) => call.method === 'goBack'),
    true
  );
});
