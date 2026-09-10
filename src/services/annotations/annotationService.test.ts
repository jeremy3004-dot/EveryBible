import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';
import type { UserAnnotation } from '../supabase/types';

// annotationService is deliberately backend-free: it reads and writes the local
// MMKV-backed annotation store and merges with the real ./annotationMerge. The
// only thing Node cannot load is MMKV, so that is the only mock this file needs.
const mmkv = mockMmkvStorage(mock);

let service: typeof import('./annotationService');
let useAnnotationStore: typeof import('../../stores/annotationStore').useAnnotationStore;

before(async () => {
  service = await import('./annotationService');
  ({ useAnnotationStore } = await import('../../stores/annotationStore'));
});

const makeAnnotation = (overrides: Partial<UserAnnotation> = {}): UserAnnotation => ({
  id: 'a1',
  user_id: 'local-device',
  book: 'GEN',
  chapter: 1,
  verse_start: 1,
  verse_end: null,
  type: 'highlight',
  color: 'amber',
  content: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  synced_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

const seedStore = (annotations: UserAnnotation[]) => {
  useAnnotationStore.setState({ annotations });
};

beforeEach(() => {
  useAnnotationStore.setState(useAnnotationStore.getInitialState(), true);
  mmkv.store.clear();
});

// ---------------------------------------------------------------------------
// fetchAnnotations
// ---------------------------------------------------------------------------

test('fetching with no saved annotations succeeds with an empty list', async () => {
  assert.deepEqual(await service.fetchAnnotations(), { success: true, data: [] });
});

test('fetching returns every active annotation ordered newest updated_at first', async () => {
  seedStore([
    makeAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
    makeAnnotation({ id: 'new', verse_start: 2, updated_at: '2026-06-01T00:00:00.000Z' }),
    makeAnnotation({ id: 'mid', verse_start: 3, updated_at: '2026-03-01T00:00:00.000Z' }),
  ]);

  const result = await service.fetchAnnotations();

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['new', 'mid', 'old']
  );
});

test('fetching breaks an updated_at tie on created_at, newest first', async () => {
  seedStore([
    makeAnnotation({ id: 'created-early', created_at: '2026-01-01T00:00:00.000Z' }),
    makeAnnotation({
      id: 'created-late',
      verse_start: 2,
      created_at: '2026-05-01T00:00:00.000Z',
    }),
  ]);

  const result = await service.fetchAnnotations();

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['created-late', 'created-early']
  );
});

test('fetching hides soft-deleted annotations', async () => {
  seedStore([
    makeAnnotation({ id: 'live' }),
    makeAnnotation({ id: 'tombstone', verse_start: 2, deleted_at: '2026-02-02T00:00:00.000Z' }),
  ]);

  const result = await service.fetchAnnotations();

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['live']
  );
});

test('a row with no deleted_at field at all is still an active annotation', async () => {
  // JSON.stringify drops undefined, so a snapshot written before the column
  // existed rehydrates without the key. Those rows must stay visible.
  const legacyRow: Partial<UserAnnotation> = makeAnnotation({ id: 'legacy' });
  delete legacyRow.deleted_at;
  seedStore([legacyRow as UserAnnotation]);

  const result = await service.fetchAnnotations();

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['legacy']
  );
  assert.equal((await service.getAnnotationsForChapter('GEN', 1)).data?.length, 1);
});

test('fetching with a book filter narrows the result to that book', async () => {
  seedStore([
    makeAnnotation({ id: 'gen', book: 'GEN' }),
    makeAnnotation({ id: 'jhn', book: 'JHN' }),
  ]);

  const result = await service.fetchAnnotations('JHN');

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['jhn']
  );
});

test('a book filter that matches nothing succeeds with an empty list', async () => {
  seedStore([makeAnnotation({ id: 'gen', book: 'GEN' })]);

  assert.deepEqual(await service.fetchAnnotations('REV'), { success: true, data: [] });
});

test('fetching does not mutate the stored annotation order', async () => {
  seedStore([
    makeAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
    makeAnnotation({ id: 'new', verse_start: 2, updated_at: '2026-06-01T00:00:00.000Z' }),
  ]);

  await service.fetchAnnotations();

  assert.deepEqual(
    useAnnotationStore.getState().annotations.map((annotation) => annotation.id),
    ['old', 'new']
  );
});

test('fetching reports failure instead of throwing when the local store cannot be read', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw new Error('MMKV unavailable');
  });

  assert.deepEqual(await service.fetchAnnotations(), {
    success: false,
    error: 'MMKV unavailable',
  });
});

// ---------------------------------------------------------------------------
// upsertAnnotation
// ---------------------------------------------------------------------------

test('upserting saves the annotation and returns the hydrated row', async () => {
  const result = await service.upsertAnnotation({
    id: '',
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'For God so loved',
    deleted_at: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.user_id, 'local-device');
  assert.equal(result.data?.content, 'For God so loved');
  assert.deepEqual(useAnnotationStore.getState().annotations, [result.data]);
});

test('upserting the same verse and type twice updates in place rather than duplicating', async () => {
  await service.upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });
  const second = await service.upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'rose',
    content: null,
    deleted_at: null,
  });

  assert.equal(useAnnotationStore.getState().annotations.length, 1);
  assert.equal(second.data?.color, 'rose');
});

test('an upserted annotation is written through to MMKV', async () => {
  await service.upsertAnnotation({
    id: 'persisted-1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'bookmark',
    color: null,
    content: null,
    deleted_at: null,
  });

  const persisted = JSON.parse(mmkv.store.get('annotation-storage') ?? '{}');
  assert.deepEqual(
    persisted.state.annotations.map((annotation: UserAnnotation) => annotation.id),
    ['persisted-1']
  );
});

test('upserting reports failure instead of throwing when the store write fails', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw new Error('storage full');
  });

  assert.deepEqual(
    await service.upsertAnnotation({
      id: '',
      book: 'GEN',
      chapter: 1,
      verse_start: 1,
      verse_end: null,
      type: 'highlight',
      color: null,
      content: null,
      deleted_at: null,
    }),
    { success: false, error: 'storage full' }
  );
});

test('a non-Error thrown by the store surfaces as an unknown-error result', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw 'not an error object';
  });

  assert.deepEqual(
    await service.upsertAnnotation({
      id: '',
      book: 'GEN',
      chapter: 1,
      verse_start: 1,
      verse_end: null,
      type: 'highlight',
      color: null,
      content: null,
      deleted_at: null,
    }),
    { success: false, error: 'Unknown error' }
  );
});

// ---------------------------------------------------------------------------
// softDeleteAnnotation
// ---------------------------------------------------------------------------

test('soft deleting an existing annotation succeeds and tombstones the row', async () => {
  seedStore([makeAnnotation({ id: 'a1' })]);

  assert.deepEqual(await service.softDeleteAnnotation('a1'), { success: true });
  assert.notEqual(useAnnotationStore.getState().annotations[0].deleted_at, null);
});

test('soft deleting an unknown id reports "Annotation not found"', async () => {
  seedStore([makeAnnotation({ id: 'a1' })]);

  assert.deepEqual(await service.softDeleteAnnotation('nope'), {
    success: false,
    error: 'Annotation not found',
  });
});

test('soft deleting an already deleted annotation reports not found', async () => {
  seedStore([makeAnnotation({ id: 'a1', deleted_at: '2026-02-02T00:00:00.000Z' })]);

  assert.deepEqual(await service.softDeleteAnnotation('a1'), {
    success: false,
    error: 'Annotation not found',
  });
});

test('a deleted annotation disappears from subsequent fetches', async () => {
  seedStore([makeAnnotation({ id: 'a1' })]);

  await service.softDeleteAnnotation('a1');

  assert.deepEqual((await service.fetchAnnotations()).data, []);
});

test('soft deleting reports failure instead of throwing when the store write fails', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw new Error('storage offline');
  });

  assert.deepEqual(await service.softDeleteAnnotation('a1'), {
    success: false,
    error: 'storage offline',
  });
});

// ---------------------------------------------------------------------------
// syncAnnotations
// ---------------------------------------------------------------------------

test('syncing an empty incoming list keeps everything already stored', async () => {
  seedStore([makeAnnotation({ id: 'a1' })]);

  const result = await service.syncAnnotations([], null);

  assert.equal(result.success, true);
  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['a1']
  );
});

test('syncing adds annotations that exist only in the incoming list', async () => {
  seedStore([makeAnnotation({ id: 'local-only' })]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'incoming-only', book: 'JHN', chapter: 3, verse_start: 16 })],
    null
  );

  assert.deepEqual(
    new Set(result.merged?.map((annotation) => annotation.id)),
    new Set(['local-only', 'incoming-only'])
  );
  assert.equal(useAnnotationStore.getState().annotations.length, 2);
});

test('on a conflict the incoming row wins when it is strictly newer', async () => {
  seedStore([
    makeAnnotation({ id: 'stored', color: 'amber', updated_at: '2026-01-01T00:00:00.000Z' }),
  ]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'incoming', color: 'rose', updated_at: '2026-06-01T00:00:00.000Z' })],
    null
  );

  assert.deepEqual(
    result.merged?.map((annotation) => [annotation.id, annotation.color]),
    [['incoming', 'rose']]
  );
});

test('on a conflict the stored row wins when the incoming row is older', async () => {
  seedStore([
    makeAnnotation({ id: 'stored', color: 'amber', updated_at: '2026-06-01T00:00:00.000Z' }),
  ]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'incoming', color: 'rose', updated_at: '2026-01-01T00:00:00.000Z' })],
    null
  );

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['stored']
  );
});

test('on an exact updated_at tie the stored row is kept', async () => {
  seedStore([makeAnnotation({ id: 'stored' })]);

  const result = await service.syncAnnotations([makeAnnotation({ id: 'incoming' })], null);

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['stored']
  );
});

test('a newer incoming tombstone replaces the stored active row so deletions propagate', async () => {
  seedStore([makeAnnotation({ id: 'a1', updated_at: '2026-01-01T00:00:00.000Z' })]);

  const result = await service.syncAnnotations(
    [
      makeAnnotation({
        id: 'a1',
        updated_at: '2026-06-01T00:00:00.000Z',
        deleted_at: '2026-06-01T00:00:00.000Z',
      }),
    ],
    null
  );

  assert.equal(result.merged?.[0].deleted_at, '2026-06-01T00:00:00.000Z');
  assert.deepEqual((await service.fetchAnnotations()).data, []);
});

test('an older incoming tombstone does not delete a newer stored annotation', async () => {
  seedStore([makeAnnotation({ id: 'a1', updated_at: '2026-06-01T00:00:00.000Z' })]);

  await service.syncAnnotations(
    [
      makeAnnotation({
        id: 'a1',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: '2026-01-01T00:00:00.000Z',
      }),
    ],
    null
  );

  assert.equal((await service.fetchAnnotations()).data?.length, 1);
});

test('syncing writes the merged list back into the local store and MMKV', async () => {
  seedStore([makeAnnotation({ id: 'stored' })]);

  await service.syncAnnotations(
    [makeAnnotation({ id: 'incoming', book: 'JHN', chapter: 3, verse_start: 16 })],
    null
  );

  const persisted = JSON.parse(mmkv.store.get('annotation-storage') ?? '{}');
  assert.equal(persisted.state.annotations.length, 2);
});

test('the lastSyncedAt argument is ignored by the local-only sync', async () => {
  seedStore([makeAnnotation({ id: 'stored' })]);

  const withTimestamp = await service.syncAnnotations([], '2026-06-01T00:00:00.000Z');
  const withoutTimestamp = await service.syncAnnotations([], null);

  assert.deepEqual(
    withTimestamp.merged?.map((annotation) => annotation.id),
    withoutTimestamp.merged?.map((annotation) => annotation.id)
  );
});

test('syncing reports failure instead of throwing when the store is unreadable', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw new Error('store closed');
  });

  assert.deepEqual(await service.syncAnnotations([], null), {
    success: false,
    error: 'store closed',
  });
});

// ---------------------------------------------------------------------------
// getAnnotationsForChapter
// ---------------------------------------------------------------------------

test('chapter annotations are returned in reading order by verse', async () => {
  seedStore([
    makeAnnotation({ id: 'v9', verse_start: 9 }),
    makeAnnotation({ id: 'v2', verse_start: 2 }),
    makeAnnotation({ id: 'v5', verse_start: 5 }),
  ]);

  const result = await service.getAnnotationsForChapter('GEN', 1);

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['v2', 'v5', 'v9']
  );
});

// QUESTION: sortByChapterVerse compares chapters first, but its only caller
// (getAnnotationsForChapter) has already filtered to a single chapter, so that
// branch is unreachable and no test can cover it. Should the chapter comparison
// be dropped, or is a cross-chapter caller planned?

test('chapter annotations exclude other chapters and other books', async () => {
  seedStore([
    makeAnnotation({ id: 'gen-1', book: 'GEN', chapter: 1 }),
    makeAnnotation({ id: 'gen-2', book: 'GEN', chapter: 2 }),
    makeAnnotation({ id: 'jhn-1', book: 'JHN', chapter: 1 }),
  ]);

  const result = await service.getAnnotationsForChapter('GEN', 1);

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['gen-1']
  );
});

test('chapter annotations exclude soft-deleted rows', async () => {
  seedStore([
    makeAnnotation({ id: 'live', verse_start: 1 }),
    makeAnnotation({ id: 'gone', verse_start: 2, deleted_at: '2026-02-02T00:00:00.000Z' }),
  ]);

  const result = await service.getAnnotationsForChapter('GEN', 1);

  assert.deepEqual(
    result.data?.map((annotation) => annotation.id),
    ['live']
  );
});

test('a chapter with no annotations succeeds with an empty list', async () => {
  seedStore([makeAnnotation({ id: 'gen-1', chapter: 1 })]);

  assert.deepEqual(await service.getAnnotationsForChapter('GEN', 42), {
    success: true,
    data: [],
  });
});

test('chapter annotations reporting failure surfaces the store error', async (t) => {
  t.mock.method(useAnnotationStore, 'getState', () => {
    throw new Error('store closed');
  });

  assert.deepEqual(await service.getAnnotationsForChapter('GEN', 1), {
    success: false,
    error: 'store closed',
  });
});

// ---------------------------------------------------------------------------
// syncAnnotations: harder merge cases
// ---------------------------------------------------------------------------

test('two incoming rows for the same verse and type collapse to the newer one', async () => {
  const result = await service.syncAnnotations(
    [
      makeAnnotation({ id: 'older', updated_at: '2026-01-01T00:00:00.000Z' }),
      makeAnnotation({ id: 'newer', updated_at: '2026-02-01T00:00:00.000Z' }),
    ],
    null
  );

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['newer']
  );
});

test('the order incoming duplicates arrive in does not decide which one survives', async () => {
  const result = await service.syncAnnotations(
    [
      makeAnnotation({ id: 'newer', updated_at: '2026-02-01T00:00:00.000Z' }),
      makeAnnotation({ id: 'older', updated_at: '2026-01-01T00:00:00.000Z' }),
    ],
    null
  );

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['newer']
  );
});

// Documents current behaviour: the merge is keyed on book|chapter|verse|type, so
// a stored list that somehow holds two rows for one key keeps only the last one
// seeded. The store's own upsert cannot create that state; a hand-written or
// migrated snapshot could. QUESTION for review — is silent collapse right here?
test('two stored rows for the same verse and type collapse to the last one seeded', async () => {
  seedStore([
    makeAnnotation({ id: 'first', updated_at: '2026-03-01T00:00:00.000Z' }),
    makeAnnotation({ id: 'second', updated_at: '2026-01-01T00:00:00.000Z' }),
  ]);

  const result = await service.syncAnnotations([], null);

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['second']
  );
});

test('the same verse annotated two different ways is two rows, not a conflict', async () => {
  seedStore([makeAnnotation({ id: 'highlight', type: 'highlight' })]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'note', type: 'note', content: 'a thought' })],
    null
  );

  assert.deepEqual(
    new Set(result.merged?.map((annotation) => annotation.id)),
    new Set(['highlight', 'note'])
  );
});

test('an incoming tombstone for a verse never stored locally is kept, not dropped', async () => {
  const result = await service.syncAnnotations(
    [
      makeAnnotation({
        id: 'remote-deleted',
        book: 'JHN',
        chapter: 3,
        verse_start: 16,
        deleted_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }),
    ],
    null
  );

  assert.deepEqual(
    result.merged?.map((annotation) => annotation.id),
    ['remote-deleted']
  );
  assert.deepEqual(await service.fetchAnnotations(), { success: true, data: [] });
});

test('a stored tombstone survives a sync whose incoming list does not mention it', async () => {
  seedStore([makeAnnotation({ id: 'a1', deleted_at: '2026-05-01T00:00:00.000Z' })]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'other', book: 'JHN', chapter: 3, verse_start: 16 })],
    null
  );

  assert.equal(
    result.merged?.find((annotation) => annotation.id === 'a1')?.deleted_at,
    '2026-05-01T00:00:00.000Z'
  );
});

test('a newer incoming row un-deletes a verse that was tombstoned locally', async () => {
  seedStore([
    makeAnnotation({
      id: 'a1',
      deleted_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    }),
  ]);

  const result = await service.syncAnnotations(
    [makeAnnotation({ id: 'a1', updated_at: '2026-06-01T00:00:00.000Z' })],
    null
  );

  assert.equal(result.merged?.[0]?.deleted_at, null);
  assert.equal((await service.fetchAnnotations()).data?.length, 1);
});

test('syncing the same list twice reaches the same state as syncing it once', async () => {
  seedStore([makeAnnotation({ id: 'local' })]);
  const incoming = [makeAnnotation({ id: 'remote', book: 'JHN', chapter: 3, verse_start: 16 })];

  const first = await service.syncAnnotations(incoming, null);
  const second = await service.syncAnnotations(incoming, null);

  assert.deepEqual(
    second.merged?.map((annotation) => annotation.id).sort(),
    first.merged?.map((annotation) => annotation.id).sort()
  );
});

test('a sync leaves the store sorted newest first, whatever order the merge produced', async () => {
  seedStore([makeAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' })]);

  await service.syncAnnotations(
    [
      makeAnnotation({
        id: 'new',
        book: 'JHN',
        chapter: 3,
        verse_start: 16,
        updated_at: '2026-07-01T00:00:00.000Z',
      }),
    ],
    null
  );

  assert.deepEqual(
    useAnnotationStore.getState().annotations.map((annotation) => annotation.id),
    ['new', 'old']
  );
});

// ---------------------------------------------------------------------------
// the local round trip, with no backend anywhere in the picture
// ---------------------------------------------------------------------------

test('a note written, edited and deleted on-device needs nothing but the local store', async () => {
  const created = await service.upsertAnnotation({
    id: '',
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'first thought',
    deleted_at: null,
  });
  await service.upsertAnnotation({
    id: created.data!.id,
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'second thought',
    deleted_at: null,
  });

  const beforeDelete = await service.getAnnotationsForChapter('JHN', 3);
  await service.softDeleteAnnotation(created.data!.id);
  const afterDelete = await service.getAnnotationsForChapter('JHN', 3);

  assert.deepEqual(
    beforeDelete.data?.map((annotation) => annotation.content),
    ['second thought']
  );
  assert.deepEqual(afterDelete.data, []);
});
