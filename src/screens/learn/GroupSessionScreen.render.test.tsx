import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../testing/render';

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
mockModule(mock, sourcePath('stores/fourFieldsStore.ts'), { useFourFieldsStore });
mockModule(mock, sourcePath('services/supabase/index.ts'), { isSupabaseConfigured: () => false });
mockBarrel(mock, 'services/groups/index.ts', {
  real: ['buildGroupDetailSnapshot', 'loadGroupDetailSnapshot'],
  provide: {
    getSyncedGroup: async () => null,
    getSyncedGroupServiceAvailability: () => 'unavailable',
    recordSyncedGroupSession: async () => ({ success: true }),
    updateSyncedGroupLesson: async () => ({ success: true }),
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

  assert.equal(flattenStyle(footerOf(view).props.style)?.flexDirection, 'row');
});

test('at large text Previous and Next stack, with Next on top', async () => {
  harness.setFontScale(2);
  const view = await renderMiddlePhase();

  // column-reverse: Previous stays first in the tree (and the focus order) but draws last.
  assert.equal(flattenStyle(footerOf(view).props.style)?.flexDirection, 'column-reverse');
});

test('the scroll content clears the footer at whatever height it lays out to', async () => {
  harness.setFontScale(2);
  const view = await renderMiddlePhase();

  const footer = hostAncestors(footerOf(view))[0];
  await view.fire(footer, 'onLayout', { nativeEvent: { layout: { height: 240 } } });
  const [scroll] = view.queryAllByType('ScrollView');
  const padding = flattenStyle(scroll.props.contentContainerStyle)?.paddingBottom as number;
  assert.ok(padding > 240, `content padding ${padding} clears a 240pt footer`);
});
