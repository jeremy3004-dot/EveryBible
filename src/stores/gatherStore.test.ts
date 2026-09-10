import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// One mock configuration per file: the persisted store only needs MMKV.
const mmkv = mockMmkvStorage(mock);

// Loaded in `before` because this file is transpiled to CJS (no top-level await),
// and because the mock above must be installed before the store is evaluated.
let useGatherStore: typeof import('./gatherStore').useGatherStore;

before(async () => {
  ({ useGatherStore } = await import('./gatherStore'));
});

const readPersisted = () => JSON.parse(mmkv.store.get('gather-storage') ?? '{}');

const seedStorage = (state: unknown) => {
  mmkv.store.set('gather-storage', JSON.stringify({ state, version: 0 }));
};

beforeEach(() => {
  useGatherStore.setState(useGatherStore.getInitialState(), true);
  mmkv.store.clear();
});

test('marking a lesson complete records it under its parent and persists it', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');

  assert.deepEqual(useGatherStore.getState().completedLessons, {
    'foundation-1': ['lesson-a'],
  });
  assert.deepEqual(readPersisted().state.completedLessons, { 'foundation-1': ['lesson-a'] });
});

test('marking the same lesson complete twice does not duplicate the entry', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');

  assert.deepEqual(useGatherStore.getState().completedLessons['foundation-1'], ['lesson-a']);
});

test('lessons completed under different parents are tracked independently', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');
  useGatherStore.getState().markLessonComplete('topic-courage', 'lesson-b');

  assert.deepEqual(useGatherStore.getState().completedLessons, {
    'foundation-1': ['lesson-a'],
    'topic-courage': ['lesson-b'],
  });
  assert.equal(useGatherStore.getState().getCompletedCount('foundation-1'), 1);
  assert.equal(useGatherStore.getState().getCompletedCount('topic-courage'), 1);
});

test('completions append in the order they were marked', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-b');
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-c');

  assert.deepEqual(useGatherStore.getState().completedLessons['foundation-1'], [
    'lesson-a',
    'lesson-b',
    'lesson-c',
  ]);
});

test('unmarking a lesson removes only that lesson from its parent', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-b');

  useGatherStore.getState().unmarkLessonComplete('foundation-1', 'lesson-a');

  assert.deepEqual(useGatherStore.getState().completedLessons['foundation-1'], ['lesson-b']);
  assert.deepEqual(readPersisted().state.completedLessons['foundation-1'], ['lesson-b']);
});

test('unmarking a lesson for an unknown parent creates an empty completion list', () => {
  useGatherStore.getState().unmarkLessonComplete('never-seen', 'lesson-a');

  assert.deepEqual(useGatherStore.getState().completedLessons, { 'never-seen': [] });
  assert.equal(useGatherStore.getState().getCompletedCount('never-seen'), 0);
});

test('isLessonComplete reports false for an unknown parent and for an unmarked lesson', () => {
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-a');

  assert.equal(useGatherStore.getState().isLessonComplete('foundation-1', 'lesson-a'), true);
  assert.equal(useGatherStore.getState().isLessonComplete('foundation-1', 'lesson-z'), false);
  assert.equal(useGatherStore.getState().isLessonComplete('foundation-9', 'lesson-a'), false);
});

test('getCompletedCount returns zero for a parent with no recorded lessons', () => {
  assert.equal(useGatherStore.getState().getCompletedCount('foundation-1'), 0);
});

test('dismissing the info banner persists the dismissal', () => {
  assert.equal(useGatherStore.getState().infoBannerDismissed, false);

  useGatherStore.getState().dismissInfoBanner();

  assert.equal(useGatherStore.getState().infoBannerDismissed, true);
  assert.equal(readPersisted().state.infoBannerDismissed, true);
});

test('only completion data and banner state are persisted, never the action functions', () => {
  useGatherStore.getState().dismissInfoBanner();

  assert.deepEqual(Object.keys(readPersisted().state).sort(), [
    'completedLessons',
    'infoBannerDismissed',
  ]);
});

test('a persisted snapshot rehydrates completions and the dismissed banner', async () => {
  seedStorage({
    completedLessons: { 'foundation-2': ['seeded-1', 'seeded-2'] },
    infoBannerDismissed: true,
  });

  await useGatherStore.persist.rehydrate();

  assert.equal(useGatherStore.getState().getCompletedCount('foundation-2'), 2);
  assert.equal(useGatherStore.getState().infoBannerDismissed, true);
});

test('a snapshot missing the banner flag keeps the in-memory default rather than undefined', async () => {
  seedStorage({ completedLessons: { 'foundation-2': ['seeded-1'] } });

  await useGatherStore.persist.rehydrate();

  assert.equal(useGatherStore.getState().infoBannerDismissed, false);
});

test('an empty storage slot leaves the store at its initial state', async () => {
  await useGatherStore.persist.rehydrate();

  assert.deepEqual(useGatherStore.getState().completedLessons, {});
  assert.equal(useGatherStore.getState().infoBannerDismissed, false);
});

// Documents current behaviour: gatherStore has no persisted-state sanitizer, so a
// corrupted `completedLessons` (null instead of an object) survives hydration and
// the first read throws. QUESTION for review — every other persisted store in
// src/stores runs its payload through persistedStateSanitizers first.
test('a corrupted completedLessons payload hydrates unsanitized and throws on first read', async () => {
  seedStorage({ completedLessons: null, infoBannerDismissed: false });

  await useGatherStore.persist.rehydrate();

  assert.equal(useGatherStore.getState().completedLessons, null);
  assert.throws(() => useGatherStore.getState().isLessonComplete('foundation-1', 'lesson-a'), {
    name: 'TypeError',
  });
});
