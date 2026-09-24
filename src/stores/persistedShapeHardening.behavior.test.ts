import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';
import { mockMmkvStorage } from '../testing/mockModules';

/**
 * Persisted blobs that parse as JSON but have the wrong SHAPE — an older app
 * version's layout, a field written as null, a hand-restored backup. zustand's
 * default merge spreads them straight into the store, so the crash comes later:
 * `state.pinnedIds.includes` in a render selector, `state.annotations.findIndex`
 * in a tap handler (fatal in a release build). Each store must hydrate such a
 * blob into a usable state and keep every well-formed value it contains.
 */
const mmkv = mockMmkvStorage(mock);

let useTranslationPreferenceStore: typeof import('./translationPreferenceStore').useTranslationPreferenceStore;
let useGatherStore: typeof import('./gatherStore').useGatherStore;
let useAnnotationStore: typeof import('./annotationStore').useAnnotationStore;
let useFourFieldsStore: typeof import('./fourFieldsStore').useFourFieldsStore;
let createReadingPlansStore: typeof import('./readingPlansStore').createReadingPlansStore;

before(async () => {
  ({ useTranslationPreferenceStore } = await import('./translationPreferenceStore'));
  ({ useGatherStore } = await import('./gatherStore'));
  ({ useAnnotationStore } = await import('./annotationStore'));
  ({ useFourFieldsStore } = await import('./fourFieldsStore'));
  ({ createReadingPlansStore } = await import('./readingPlansStore'));
});

beforeEach(() => {
  mmkv.store.clear();
  useTranslationPreferenceStore.setState(useTranslationPreferenceStore.getInitialState(), true);
  useGatherStore.setState(useGatherStore.getInitialState(), true);
  useAnnotationStore.setState(useAnnotationStore.getInitialState(), true);
  useFourFieldsStore.setState(useFourFieldsStore.getInitialState(), true);
});

const seed = (key: string, state: unknown, version = 0) => {
  mmkv.store.set(key, JSON.stringify({ state, version }));
};

test('translation preferences with non-array pin/hide lists hydrate as empty lists and pinning still works', async () => {
  seed('translation-preferences', { pinnedIds: null, hiddenIds: { web: true } });

  await useTranslationPreferenceStore.persist.rehydrate();

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, []);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, []);
  useTranslationPreferenceStore.getState().pin('bsb');
  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb']);
});

test('translation preferences keep the string ids of a list that also holds junk', async () => {
  seed('translation-preferences', { pinnedIds: ['bsb', 7, null, 'web'], hiddenIds: ['kjv'] });

  await useTranslationPreferenceStore.persist.rehydrate();

  assert.deepEqual(useTranslationPreferenceStore.getState().pinnedIds, ['bsb', 'web']);
  assert.deepEqual(useTranslationPreferenceStore.getState().hiddenIds, ['kjv']);
});

test('gather completions stored in the wrong shape hydrate without breaking lesson taps', async () => {
  seed('gather-storage', {
    completedLessons: { 'foundation-1': ['lesson-a', 3], 'topic-courage': 'lesson-b' },
    infoBannerDismissed: 'yes',
  });

  await useGatherStore.persist.rehydrate();

  assert.deepEqual(useGatherStore.getState().completedLessons, {
    'foundation-1': ['lesson-a'],
    'topic-courage': [],
  });
  assert.equal(useGatherStore.getState().infoBannerDismissed, false);
  useGatherStore.getState().markLessonComplete('topic-courage', 'lesson-b');
  assert.equal(useGatherStore.getState().isLessonComplete('topic-courage', 'lesson-b'), true);
});

test('gather completions persisted as a list hydrate as an empty record', async () => {
  seed('gather-storage', { completedLessons: ['lesson-a'], infoBannerDismissed: true });

  await useGatherStore.persist.rehydrate();

  assert.deepEqual(useGatherStore.getState().completedLessons, {});
  assert.equal(useGatherStore.getState().infoBannerDismissed, true);
});

const annotation = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_id: 'local-device',
  book: 'GEN',
  chapter: 1,
  verse_start: 1,
  verse_end: 1,
  type: 'highlight',
  color: 'yellow',
  content: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  synced_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

test('annotations persisted as null hydrate as an empty list and a new highlight can be saved', async () => {
  seed('annotation-storage', { annotations: null });

  await useAnnotationStore.persist.rehydrate();

  assert.deepEqual(useAnnotationStore.getState().annotations, []);
  const saved = useAnnotationStore.getState().upsertAnnotation({
    id: '',
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: 16,
    type: 'highlight',
    color: 'yellow',
    content: null,
    deleted_at: null,
  });
  assert.equal(useAnnotationStore.getState().annotations[0]?.id, saved.id);
});

test('annotation entries that are not annotation records are dropped and the rest are kept', async () => {
  seed('annotation-storage', {
    annotations: [annotation('keep-1'), null, 'junk', { id: 5 }, annotation('keep-2', { book: 3 })],
  });

  await useAnnotationStore.persist.rehydrate();

  assert.deepEqual(
    useAnnotationStore.getState().annotations.map((entry) => entry.id),
    ['keep-1']
  );
});

test('Four Fields state of the current version but the wrong shape hydrates into a usable store', async () => {
  seed(
    'four-fields-storage',
    {
      completedLessons: { 'entry-course': 'entry-1' },
      practiceCompleted: ['entry-1'],
      taughtCompleted: { 'entry-1': true, 'entry-2': 'no' },
      currentField: 'nonsense',
      groups: [
        null,
        { id: 'group-a', name: 'A', joinCode: 'ABC234', members: 'everyone' },
        {
          id: 'group-b',
          name: 'B',
          joinCode: 'XYZ789',
          createdAt: 1,
          createdBy: 'leader-1',
          currentCourseId: 'entry-course',
          currentLessonId: 'entry-1',
          members: [{ id: 'leader-1', name: 'Leader', role: 'leader', joinedAt: 1 }, null],
        },
      ],
      activeGroupId: 42,
      groupProgress: {
        'group-b': { groupId: 'group-b', completedLessons: null, notes: 'n/a' },
        'group-c': null,
      },
    },
    1
  );

  await useFourFieldsStore.persist.rehydrate();
  const state = useFourFieldsStore.getState();

  assert.deepEqual(state.completedLessons, { 'entry-course': [] });
  assert.deepEqual(state.practiceCompleted, {});
  assert.deepEqual(state.taughtCompleted, { 'entry-1': true });
  assert.equal(state.currentField, 'entry');
  assert.equal(state.activeGroupId, null);
  assert.deepEqual(
    state.groups.map((group) => [group.id, group.members.map((member) => member.id)]),
    [
      ['group-a', []],
      ['group-b', ['leader-1']],
    ]
  );
  assert.deepEqual(state.groupProgress, {
    'group-b': { groupId: 'group-b', completedLessons: [], notes: {} },
  });

  // The taps that read these fields must not throw.
  assert.equal(state.joinGroup('ABC234', 'user-2', 'New Member'), true);
  useFourFieldsStore.getState().markGroupLessonComplete('group-b', 'entry-2');
  useFourFieldsStore.getState().addGroupNote('group-b', 'entry-2', 'Good discussion');
  assert.deepEqual(useFourFieldsStore.getState().groupProgress['group-b'], {
    groupId: 'group-b',
    completedLessons: ['entry-2'],
    notes: { 'entry-2': 'Good discussion' },
  });
});

function createMemoryStorage(seedValue: Record<string, string>): StateStorage {
  const store = new Map(Object.entries(seedValue));
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
    removeItem: (name) => {
      store.delete(name);
    },
  };
}

test('reading plans with wrong-shaped lists and a null progress entry still load the valid plan progress', () => {
  const validProgress = {
    id: 'reading-plan-progress-plan-a',
    plan_id: 'plan-a',
    started_at: '2026-09-01T00:00:00.000Z',
    completed_entries: {},
    completed_sessions: {},
    current_day: 3,
    current_session: null,
    is_completed: false,
    completed_at: null,
    synced_at: '2026-09-01T00:00:00.000Z',
  };
  const store = createReadingPlansStore(
    createMemoryStorage({
      'reading-plans-storage': JSON.stringify({
        state: {
          enrolledPlanIds: { 'plan-a': true },
          savedPlanIds: null,
          completedPlanIds: ['plan-z', 9],
          progressByPlanId: { 'plan-a': validProgress, 'plan-b': null },
          planDayResumeByKey: [],
          groupPlansByGroupId: 'none',
          pendingUnenrollPlanIds: 'plan-a',
        },
        version: 0,
      }),
    })
  );
  // Synchronous storage: the store hydrated while it was created.
  const state = store.getState();

  // A throwing merge would have left the store empty and let the next write
  // erase the user's real progress, so the valid record must survive.
  assert.equal(state.progressByPlanId['plan-a']?.current_day, 3);
  assert.equal('plan-b' in state.progressByPlanId, false);
  assert.deepEqual(state.enrolledPlanIds, []);
  assert.deepEqual(state.savedPlanIds, []);
  assert.deepEqual(state.completedPlanIds, ['plan-z']);
  assert.deepEqual(state.planDayResumeByKey, {});
  assert.deepEqual(state.groupPlansByGroupId, {});
  assert.deepEqual(state.pendingUnenrollPlanIds, []);
  assert.deepEqual(state.getGroupPlans('group-1'), []);
});
