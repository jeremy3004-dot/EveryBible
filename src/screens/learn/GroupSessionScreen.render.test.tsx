import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../testing/render';
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// A local (unsynced) group on the first Entry lesson.
const group = {
  id: 'group-1',
  name: 'Tuesday group',
  joinCode: 'ABC123',
  createdAt: 0,
  createdBy: 'user-1',
  currentCourseId: 'entry-course',
  currentLessonId: 'entry-1',
  members: [],
};
const useFourFieldsStore = create(() => ({
  groups: [group],
  groupProgress: {},
  markGroupLessonComplete: () => {},
  updateGroupLesson: () => {},
}));
let completedLessons = 0;
let advancedLessons = 0;
useFourFieldsStore.setState({
  markGroupLessonComplete: () => {
    completedLessons += 1;
  },
  updateGroupLesson: () => {
    advancedLessons += 1;
  },
});
mockModule(mock, sourcePath('stores/fourFieldsStore.ts'), { useFourFieldsStore });
mockModule(mock, sourcePath('services/supabase/index.ts'), { isSupabaseConfigured: () => false });
mockBarrel(mock, 'services/groups/index.ts', {
  real: ['buildGroupDetailSnapshot', 'loadGroupDetailSnapshot'],
  provide: {
    getSyncedGroup: async () => null,
    getSyncedGroupServiceAvailability: () => 'unavailable',
    completeSyncedGroupSession: async () => ({ status: 'saved' }),
  },
});
mockBarrel(mock, 'utils/index.ts', { provide: { successHaptic: () => {} } });

async function renderSession() {
  harness.navigation.route.params = { groupId: group.id };
  const { GroupSessionScreen } = await import('./GroupSessionScreen');
  const view = await harness.render(<GroupSessionScreen />);
  await view.flush();
  return view;
}

/** Opens the middle phase, where both Previous and Next are shown. */
async function renderMiddlePhase() {
  const view = await renderSession();
  await view.press(view.getByRole('button', { name: new RegExp(`^${t('common.next')}`) }));
  return view;
}

function footerOf(view: Awaited<ReturnType<typeof renderSession>>) {
  const previous = view.getByRole('button', { name: new RegExp(`^${t('common.previous')}`) });
  return hostAncestors(previous)[0];
}

test('Previous and Next share one row at the default text size', async () => {
  const view = await renderMiddlePhase();

  assert.equal(
    flattenStyle(assertDefined(footerOf(view), 'footerOf(view)').props.style)?.flexDirection,
    'row'
  );
});

test('at large text Previous and Next stack, with Next on top', async () => {
  harness.setFontScale(2);
  const view = await renderMiddlePhase();

  // column-reverse: Previous stays first in the tree (and the focus order) but draws last.
  assert.equal(
    flattenStyle(assertDefined(footerOf(view), 'footerOf(view)').props.style)?.flexDirection,
    'column-reverse'
  );
});

test('the scroll content clears the footer at whatever height it lays out to', async () => {
  harness.setFontScale(2);
  const view = await renderMiddlePhase();

  const footer = assertDefined(
    hostAncestors(assertDefined(footerOf(view), 'footerOf(view)'))[0],
    'hostAncestors(footerOf(view))[0]'
  );
  await view.fire(footer, 'onLayout', { nativeEvent: { layout: { height: 240 } } });
  const [scroll] = view.queryAllByType('ScrollView');
  const padding = flattenStyle(assertDefined(scroll, 'scroll').props.contentContainerStyle)
    ?.paddingBottom as number;
  assert.ok(padding > 240, `content padding ${padding} clears a 240pt footer`);
});

test('same-tick local completion taps mark once and go back once', async () => {
  completedLessons = 0;
  advancedLessons = 0;
  const view = await renderSession();
  await view.press(view.getByRole('button', { name: t('common.next') }));
  await view.press(view.getByRole('button', { name: t('common.next') }));
  const button = view.getByRole('button', { name: t('groups.session.completeSession') });
  await act(async () => {
    (button.props.onPress as () => void)();
    (button.props.onPress as () => void)();
  });
  assert.equal(completedLessons, 1);
  assert.equal(advancedLessons, 1);
  assert.equal(harness.navigation.calls.filter((call) => call.method === 'goBack').length, 1);
});

test('a local completion handler held past unmount cannot modify progress or navigate', async () => {
  completedLessons = 0;
  const view = await renderSession();
  await view.press(view.getByRole('button', { name: t('common.next') }));
  await view.press(view.getByRole('button', { name: t('common.next') }));
  const button = view.getByRole('button', { name: t('groups.session.completeSession') });
  const complete = button.props.onPress as () => void;
  await view.unmount();
  await act(async () => {
    complete();
  });
  assert.equal(completedLessons, 0);
  assert.deepEqual(harness.navigation.calls, []);
});

test('a local completion handler from the previous group route cannot modify progress or navigate', async () => {
  completedLessons = 0;
  const view = await renderSession();
  await view.press(view.getByRole('button', { name: t('common.next') }));
  await view.press(view.getByRole('button', { name: t('common.next') }));
  const complete = view.getByRole('button', { name: t('groups.session.completeSession') }).props
    .onPress as () => void;
  useFourFieldsStore.setState({ groups: [group, { ...group, id: 'group-2' }] });
  harness.navigation.route.params = { groupId: 'group-2' };
  const { GroupSessionScreen } = await import('./GroupSessionScreen');
  await view.rerender(<GroupSessionScreen />);
  await act(async () => {
    complete();
  });
  assert.equal(completedLessons, 0);
  assert.deepEqual(harness.navigation.calls, []);
  useFourFieldsStore.setState({ groups: [group] });
});
